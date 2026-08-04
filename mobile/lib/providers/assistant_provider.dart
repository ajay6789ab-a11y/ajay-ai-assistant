import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/utils/logger.dart';
import '../data/local/database_helper.dart';
import '../data/models/models.dart';
import '../data/remote/api_client.dart';
import '../services/notification_service.dart';
import '../services/phone_control_service.dart';
import '../services/speech_service.dart';
import '../services/tts_service.dart';

/// Visual/functional state of the assistant, drives the orb animation.
enum AssistantState { idle, listening, thinking, speaking }

/// The central brain-side controller of the app.
///
/// Responsibilities
///  * own the conversation list,
///  * run the voice loop: listen → transcribe → ask backend → speak → act,
///  * ask for confirmation before sensitive actions,
///  * cache everything locally so the UI is instant and offline-tolerant.
class AssistantProvider extends ChangeNotifier {
  AssistantProvider({
    required ApiClient api,
    required SpeechService speech,
    required TtsService tts,
    PhoneControlService? phone,
    NotificationService? notifications,
    DatabaseHelper? db,
  })  : _api = api,
        _speech = speech,
        _tts = tts,
        _phone = phone ?? const PhoneControlService(),
        _notifications = notifications ?? NotificationService(),
        _db = db ?? DatabaseHelper.instance {
    _speech.addListener(_onSpeechChanged);
    _tts.addListener(_onTtsChanged);
  }

  final ApiClient _api;
  final SpeechService _speech;
  final TtsService _tts;
  final PhoneControlService _phone;
  final NotificationService _notifications;
  final DatabaseHelper _db;

  final List<ChatMessage> _messages = <ChatMessage>[];
  List<Suggestion> _suggestions = const [];
  AssistantState _state = AssistantState.idle;
  String _partialTranscript = '';
  String? _error;
  bool _online = true;
  String _engine = 'rules';
  AppSettings _settings = const AppSettings();

  /// Set by the UI: asks the user to approve a call/message. Returns true to
  /// proceed. Injected as a callback so this class stays widget-free.
  Future<bool> Function(AssistantAction action)? confirmationHandler;

  /// Set by the UI to surface a snackbar after an action runs.
  void Function(ActionResult result)? onActionResult;

  // ------------------------------------------------------------- getters --
  List<ChatMessage> get messages => List.unmodifiable(_messages);
  List<Suggestion> get suggestions => _suggestions;
  AssistantState get state => _state;
  bool get isListening => _state == AssistantState.listening;
  bool get isBusy => _state == AssistantState.thinking;
  String get partialTranscript => _partialTranscript;
  String? get error => _error;
  bool get isOnline => _online;
  String get engine => _engine;
  AppSettings get settings => _settings;

  /// 0..1 microphone level for the orb.
  double get micLevel => _speech.level;

  set settings(AppSettings value) {
    _settings = value;
    notifyListeners();
  }

  // ----------------------------------------------------------- lifecycle --
  Future<void> bootstrap() async {
    // 1. Instant paint from the local cache.
    _messages
      ..clear()
      ..addAll(await _db.loadMessages(limit: 60));
    notifyListeners();

    // 2. Refresh from the server (and detect the AI engine in use).
    try {
      final Map<String, dynamic> health = await _api.health();
      _engine = health['ai_engine'] as String? ?? 'rules';
      _online = true;

      final List<ChatMessage> remote = await _api.conversation(limit: 60);
      if (remote.isNotEmpty) {
        _messages
          ..clear()
          ..addAll(remote);
        for (final ChatMessage m in remote) {
          await _db.saveMessage(m);
        }
      }
      _suggestions = await _api.suggestions();
    } catch (e) {
      _online = false;
      AppLogger.w('Offline bootstrap: $e');
    }

    if (_messages.isEmpty) {
      _messages.add(ChatMessage(
        id: 'welcome',
        role: 'assistant',
        content: 'Namaste! I am Ajay. Tap the mic and tell me what you need — '
            'in Hindi or English.',
        createdAt: DateTime.now(),
      ));
    }
    notifyListeners();
  }

  // --------------------------------------------------------- voice loop ---
  /// Starts/stops listening (the mic button toggles this).
  Future<void> toggleListening() async {
    if (_state == AssistantState.listening) {
      await _speech.stop();
      _setState(AssistantState.idle);
      return;
    }
    await _tts.stop();
    _partialTranscript = '';
    _setState(AssistantState.listening);

    await _speech.listen(
      localeId: _settings.language == 'auto' ? null : _settings.sttLocale,
      onPartial: (String text) {
        _partialTranscript = text;
        notifyListeners();
      },
      onFinal: (String text) {
        _partialTranscript = '';
        send(text, source: 'voice');
      },
    );
  }

  /// Sends a command (typed, spoken or from a quick-action chip).
  Future<void> send(String text, {String source = 'text'}) async {
    final String clean = text.trim();
    if (clean.isEmpty || _state == AssistantState.thinking) return;

    _error = null;
    _appendMessage(ChatMessage(
      id: 'local-${DateTime.now().microsecondsSinceEpoch}',
      role: 'user',
      content: clean,
      createdAt: DateTime.now(),
    ));
    _setState(AssistantState.thinking);

    try {
      final AssistantReply reply = await _api.chat(clean, source: source);
      _online = true;
      _engine = reply.engine;

      _appendMessage(ChatMessage(
        id: reply.messageId,
        role: 'assistant',
        content: reply.reply,
        intent: reply.intent,
        action: reply.action,
        language: reply.language,
        data: reply.data,
        engine: reply.engine,
        confidence: reply.confidence,
        createdAt: DateTime.now(),
      ));

      await _db.saveHistory(HistoryItem(
        id: reply.messageId,
        command: clean,
        reply: reply.reply,
        intent: reply.intent,
        actionType: reply.action.type.name,
        confidence: reply.confidence,
        source: source,
        createdAt: DateTime.now(),
      ));

      // Speak first so the reply is heard while the action launches.
      if (reply.speak && _settings.autoSpeakReplies) {
        _setState(AssistantState.speaking);
        unawaited(_tts.speak(reply.reply, language: reply.language, settings: _settings));
      } else {
        _setState(AssistantState.idle);
      }

      await _runAction(reply.action);
      unawaited(_refreshSuggestions());
    } on ApiException catch (e) {
      _online = e.statusCode != 0;
      _error = e.message;
      _appendMessage(ChatMessage(
        id: 'err-${DateTime.now().microsecondsSinceEpoch}',
        role: 'assistant',
        content: _online
            ? 'Something went wrong: ${e.message}'
            : 'I am offline right now. I can still open apps and set alarms.',
        createdAt: DateTime.now(),
      ));
      _setState(AssistantState.idle);
    }
  }

  /// Executes an action, gating sensitive ones behind user consent.
  Future<void> _runAction(AssistantAction action) async {
    if (action.type == ActionType.speakOnly) return;

    final bool needsConsent = action.requiresConfirmation &&
        ((action.type == ActionType.call && _settings.confirmCalls) ||
            (action.type != ActionType.call && _settings.confirmMessages));

    if (needsConsent) {
      final bool approved = await (confirmationHandler?.call(action) ?? Future.value(false));
      if (!approved) {
        _appendMessage(ChatMessage(
          id: 'cancel-${DateTime.now().microsecondsSinceEpoch}',
          role: 'assistant',
          content: 'Cancelled — nothing was sent.',
          createdAt: DateTime.now(),
        ));
        return;
      }
    }

    // Reminders additionally schedule a local notification.
    if (action.type == ActionType.createReminder) {
      final DateTime at =
          DateTime.tryParse('${action.params['remind_at']}') ?? DateTime.now().add(const Duration(hours: 1));
      await _notifications.scheduleReminder(
        id: 'rem-${at.millisecondsSinceEpoch}',
        title: '${action.params['title']}',
        at: at,
      );
    }

    final ActionResult result = await _phone.execute(action);
    if (result.message.isNotEmpty) onActionResult?.call(result);
  }

  Future<void> _refreshSuggestions() async {
    try {
      _suggestions = await _api.suggestions();
      notifyListeners();
    } catch (_) {/* non-critical */}
  }

  Future<void> clearConversation() async {
    await _api.clearConversation();
    await _db.clearMessages();
    _messages.clear();
    notifyListeners();
  }

  Future<void> stopSpeaking() async {
    await _tts.stop();
    _setState(AssistantState.idle);
  }

  // ------------------------------------------------------------ internals --
  void _appendMessage(ChatMessage m) {
    _messages.add(m);
    unawaited(_db.saveMessage(m));
    notifyListeners();
  }

  void _setState(AssistantState s) {
    _state = s;
    notifyListeners();
  }

  void _onSpeechChanged() {
    if (_speech.isListening && _state != AssistantState.listening) {
      _state = AssistantState.listening;
    } else if (!_speech.isListening && _state == AssistantState.listening) {
      _state = AssistantState.idle;
    }
    notifyListeners(); // also propagates the mic level to the orb
  }

  void _onTtsChanged() {
    if (_tts.isSpeaking) {
      _state = AssistantState.speaking;
    } else if (_state == AssistantState.speaking) {
      _state = AssistantState.idle;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _speech.removeListener(_onSpeechChanged);
    _tts.removeListener(_onTtsChanged);
    super.dispose();
  }
}
