/// Data models shared across the app.
///
/// These mirror the Pydantic schemas in `backend/app/schemas.py` one-for-one,
/// so the JSON contract is guaranteed on both sides.
library;

/// Every action the assistant can ask the phone to perform.
/// Keep in sync with `backend/app/ai/nlu.py :: ActionType`.
enum ActionType {
  call,
  sms,
  whatsapp,
  openApp,
  openUrl,
  webSearch,
  youtubeSearch,
  setAlarm,
  setTimer,
  openCamera,
  openGallery,
  openFiles,
  openSettings,
  createReminder,
  createTask,
  createNote,
  showPlanner,
  showWeather,
  showNews,
  translate,
  calculate,
  navigate,
  playMusic,
  toggleFlashlight,
  batteryStatus,
  speakOnly;

  static ActionType fromApi(String raw) {
    switch (raw.toUpperCase()) {
      case 'CALL':
        return ActionType.call;
      case 'SMS':
        return ActionType.sms;
      case 'WHATSAPP':
        return ActionType.whatsapp;
      case 'OPEN_APP':
        return ActionType.openApp;
      case 'OPEN_URL':
        return ActionType.openUrl;
      case 'WEB_SEARCH':
        return ActionType.webSearch;
      case 'YOUTUBE_SEARCH':
        return ActionType.youtubeSearch;
      case 'SET_ALARM':
        return ActionType.setAlarm;
      case 'SET_TIMER':
        return ActionType.setTimer;
      case 'OPEN_CAMERA':
        return ActionType.openCamera;
      case 'OPEN_GALLERY':
        return ActionType.openGallery;
      case 'OPEN_FILES':
        return ActionType.openFiles;
      case 'OPEN_SETTINGS':
        return ActionType.openSettings;
      case 'CREATE_REMINDER':
        return ActionType.createReminder;
      case 'CREATE_TASK':
        return ActionType.createTask;
      case 'CREATE_NOTE':
        return ActionType.createNote;
      case 'SHOW_PLANNER':
        return ActionType.showPlanner;
      case 'SHOW_WEATHER':
        return ActionType.showWeather;
      case 'SHOW_NEWS':
        return ActionType.showNews;
      case 'TRANSLATE':
        return ActionType.translate;
      case 'CALCULATE':
        return ActionType.calculate;
      case 'NAVIGATE':
        return ActionType.navigate;
      case 'PLAY_MUSIC':
        return ActionType.playMusic;
      case 'TOGGLE_FLASHLIGHT':
        return ActionType.toggleFlashlight;
      case 'BATTERY_STATUS':
        return ActionType.batteryStatus;
      default:
        return ActionType.speakOnly;
    }
  }
}

/// A device action plus its consent metadata.
class AssistantAction {
  const AssistantAction({
    required this.type,
    this.params = const {},
    this.requiresConfirmation = false,
    this.confirmationPrompt,
    this.androidIntent,
    this.url,
  });

  final ActionType type;
  final Map<String, dynamic> params;
  final bool requiresConfirmation;
  final String? confirmationPrompt;
  final String? androidIntent;
  final String? url;

  factory AssistantAction.fromJson(Map<String, dynamic> json) => AssistantAction(
        type: ActionType.fromApi(json['type'] as String? ?? 'SPEAK_ONLY'),
        params: Map<String, dynamic>.from(json['params'] as Map? ?? {}),
        requiresConfirmation: json['requires_confirmation'] as bool? ?? false,
        confirmationPrompt: json['confirmation_prompt'] as String?,
        androidIntent: json['android_intent'] as String?,
        url: json['url'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'type': type.name,
        'params': params,
        'requires_confirmation': requiresConfirmation,
        'confirmation_prompt': confirmationPrompt,
        'android_intent': androidIntent,
        'url': url,
      };

  String? get contact => params['contact'] as String?;
  String? get body => params['body'] as String?;
}

/// One line in the conversation.
class ChatMessage {
  ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
    this.intent,
    this.action,
    this.language = 'en',
    this.data = const {},
    this.engine,
    this.confidence,
    this.isPending = false,
  });

  final String id;
  final String role; // 'user' | 'assistant'
  final String content;
  final DateTime createdAt;
  final String? intent;
  final AssistantAction? action;
  final String language;
  final Map<String, dynamic> data;
  final String? engine;
  final double? confidence;
  final bool isPending;

  bool get isUser => role == 'user';

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String? ?? DateTime.now().microsecondsSinceEpoch.toString(),
        role: json['role'] as String? ?? 'assistant',
        content: json['content'] as String? ?? '',
        intent: json['intent'] as String?,
        language: json['language'] as String? ?? 'en',
        createdAt: DateTime.tryParse(json['created_at'] as String? ?? '') ?? DateTime.now(),
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'role': role,
        'content': content,
        'intent': intent,
        'language': language,
        'created_at': createdAt.toIso8601String(),
      };
}

/// The `/api/assistant/chat` response.
class AssistantReply {
  const AssistantReply({
    required this.reply,
    required this.intent,
    required this.confidence,
    required this.language,
    required this.action,
    required this.speak,
    required this.data,
    required this.messageId,
    required this.engine,
  });

  final String reply;
  final String intent;
  final double confidence;
  final String language;
  final AssistantAction action;
  final bool speak;
  final Map<String, dynamic> data;
  final String messageId;
  final String engine;

  factory AssistantReply.fromJson(Map<String, dynamic> json) => AssistantReply(
        reply: json['reply'] as String? ?? '',
        intent: json['intent'] as String? ?? 'chat',
        confidence: (json['confidence'] as num? ?? 0).toDouble(),
        language: json['language'] as String? ?? 'en',
        action: AssistantAction.fromJson(
          Map<String, dynamic>.from(json['action'] as Map? ?? {}),
        ),
        speak: json['speak'] as bool? ?? true,
        data: Map<String, dynamic>.from(json['data'] as Map? ?? {}),
        messageId: json['message_id'] as String? ?? '',
        engine: json['engine'] as String? ?? 'rules',
      );
}

/// A row on the History screen.
class HistoryItem {
  const HistoryItem({
    required this.id,
    required this.command,
    required this.reply,
    required this.intent,
    required this.actionType,
    required this.confidence,
    required this.source,
    required this.createdAt,
  });

  final String id;
  final String command;
  final String reply;
  final String intent;
  final String actionType;
  final double confidence;
  final String source;
  final DateTime createdAt;

  factory HistoryItem.fromJson(Map<String, dynamic> json) => HistoryItem(
        id: json['id'] as String,
        command: json['command'] as String? ?? '',
        reply: json['reply'] as String? ?? '',
        intent: json['intent'] as String? ?? 'chat',
        actionType: json['action_type'] as String? ?? 'SPEAK_ONLY',
        confidence: (json['confidence'] as num? ?? 0).toDouble(),
        source: json['source'] as String? ?? 'voice',
        createdAt: DateTime.tryParse(json['created_at'] as String? ?? '')?.toLocal() ??
            DateTime.now(),
      );
}

/// To-do item / planner entry.
class TaskItem {
  const TaskItem({
    required this.id,
    required this.title,
    required this.done,
    this.notes,
    this.dueAt,
    this.priority = 1,
  });

  final String id;
  final String title;
  final bool done;
  final String? notes;
  final DateTime? dueAt;
  final int priority;

  factory TaskItem.fromJson(Map<String, dynamic> json) => TaskItem(
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        done: (json['done'] as int? ?? 0) == 1,
        notes: json['notes'] as String?,
        dueAt: DateTime.tryParse(json['due_at'] as String? ?? ''),
        priority: json['priority'] as int? ?? 1,
      );
}

/// A reminder that also becomes a local notification.
class ReminderItem {
  const ReminderItem({
    required this.id,
    required this.title,
    required this.remindAt,
    this.repeat = 'none',
    this.fired = false,
  });

  final String id;
  final String title;
  final DateTime remindAt;
  final String repeat;
  final bool fired;

  factory ReminderItem.fromJson(Map<String, dynamic> json) => ReminderItem(
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        remindAt: DateTime.tryParse(json['remind_at'] as String? ?? '') ?? DateTime.now(),
        repeat: json['repeat'] as String? ?? 'none',
        fired: (json['fired'] as int? ?? 0) == 1,
      );
}

/// User-facing settings (voice, language, privacy).
class AppSettings {
  const AppSettings({
    this.language = 'auto',
    this.voice = 'female_warm',
    this.speechRate = 0.48,
    this.pitch = 1.0,
    this.wakeWordEnabled = false,
    this.haptics = true,
    this.autoSpeakReplies = true,
    this.confirmCalls = true,
    this.confirmMessages = true,
    this.saveHistory = true,
    this.personalisedMemory = true,
    this.analytics = false,
    this.theme = 'midnight',
  });

  final String language;
  final String voice;
  final double speechRate;
  final double pitch;
  final bool wakeWordEnabled;
  final bool haptics;
  final bool autoSpeakReplies;
  final bool confirmCalls;
  final bool confirmMessages;
  final bool saveHistory;
  final bool personalisedMemory;
  final bool analytics;
  final String theme;

  factory AppSettings.fromJson(Map<String, dynamic> j) => AppSettings(
        language: j['language'] as String? ?? 'auto',
        voice: j['voice'] as String? ?? 'female_warm',
        speechRate: (j['speech_rate'] as num? ?? 0.48).toDouble(),
        pitch: (j['pitch'] as num? ?? 1.0).toDouble(),
        wakeWordEnabled: j['wake_word_enabled'] as bool? ?? false,
        haptics: j['haptics'] as bool? ?? true,
        autoSpeakReplies: j['auto_speak_replies'] as bool? ?? true,
        confirmCalls: j['confirm_calls'] as bool? ?? true,
        confirmMessages: j['confirm_messages'] as bool? ?? true,
        saveHistory: j['save_history'] as bool? ?? true,
        personalisedMemory: j['personalised_memory'] as bool? ?? true,
        analytics: j['analytics'] as bool? ?? false,
        theme: j['theme'] as String? ?? 'midnight',
      );

  /// Speech locale derived from the language preference.
  String get sttLocale => language == 'hi-IN' ? 'hi_IN' : 'en_IN';
  String get ttsLocale => language == 'hi-IN' ? 'hi-IN' : 'en-IN';
  bool get prefersMaleVoice => voice.startsWith('male');
}

/// Quick-action chip on the home screen.
class Suggestion {
  const Suggestion({required this.label, required this.icon, required this.command});

  final String label;
  final String icon;
  final String command;

  factory Suggestion.fromJson(Map<String, dynamic> j) => Suggestion(
        label: j['label'] as String? ?? '',
        icon: j['icon'] as String? ?? 'app',
        command: j['command'] as String? ?? '',
      );
}
