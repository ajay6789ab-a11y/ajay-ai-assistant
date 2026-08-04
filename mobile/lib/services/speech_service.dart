import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../core/config/app_config.dart';
import '../core/utils/logger.dart';
import 'permission_service.dart';

/// Speech-to-text wrapper (Hindi + English).
///
/// Design notes
/// ------------
/// * `hi_IN` and `en_IN` are both requested from the platform recogniser; if a
///   device lacks the Hindi pack we degrade to `en_IN` rather than failing.
/// * `soundLevel` is forwarded so the AI orb can react to the user's voice.
/// * The service is a `ChangeNotifier` so widgets can rebuild on state change.
class SpeechService extends ChangeNotifier {
  SpeechService({SpeechToText? engine}) : _speech = engine ?? SpeechToText();

  final SpeechToText _speech;

  bool _available = false;
  bool _listening = false;
  String _transcript = '';
  String _partial = '';
  double _level = 0;
  List<LocaleName> _locales = const [];

  bool get isAvailable => _available;
  bool get isListening => _listening;
  String get transcript => _transcript;
  String get partial => _partial;

  /// Normalised 0..1 microphone loudness used to animate the orb.
  double get level => _level;

  bool get supportsHindi => _locales.any((l) => l.localeId.startsWith('hi'));

  /// Must be called once during app start-up.
  Future<bool> init() async {
    if (_available) return true;
    _available = await _speech.initialize(
      onStatus: _onStatus,
      onError: (e) => AppLogger.w('STT error: ${e.errorMsg}'),
      debugLogging: kDebugMode,
    );
    if (_available) _locales = await _speech.locales();
    AppLogger.i('STT ready=$_available hindi=$supportsHindi');
    notifyListeners();
    return _available;
  }

  /// Starts listening. [localeId] is `en_IN`, `hi_IN`, or null for the default.
  ///
  /// [onFinal] fires once with the finished utterance; [onPartial] streams
  /// interim words so the UI can show live text while the user talks.
  Future<void> listen({
    String? localeId,
    required void Function(String text) onFinal,
    void Function(String text)? onPartial,
  }) async {
    if (!await PermissionService.ensureMicrophone()) {
      AppLogger.w('Microphone permission denied');
      return;
    }
    if (!await init()) return;
    if (_listening) await stop();

    _transcript = '';
    _partial = '';

    await _speech.listen(
      localeId: _resolveLocale(localeId),
      listenFor: AppConfig.listenTimeout,
      pauseFor: AppConfig.pauseTimeout,
      onSoundLevelChange: (double db) {
        // Android reports roughly -2..10 dB; map to 0..1 for the animation.
        _level = ((db + 2) / 12).clamp(0.0, 1.0);
        notifyListeners();
      },
      onResult: (SpeechRecognitionResult r) {
        if (r.finalResult) {
          _transcript = r.recognizedWords.trim();
          _partial = '';
          notifyListeners();
          if (_transcript.isNotEmpty) onFinal(_transcript);
        } else {
          _partial = r.recognizedWords;
          onPartial?.call(_partial);
          notifyListeners();
        }
      },
      listenOptions: SpeechListenOptions(
        partialResults: true,
        cancelOnError: true,
        listenMode: ListenMode.confirmation,
      ),
    );

    _listening = true;
    notifyListeners();
  }

  Future<void> stop() async {
    if (!_listening) return;
    await _speech.stop();
    _listening = false;
    _level = 0;
    notifyListeners();
  }

  Future<void> cancel() async {
    await _speech.cancel();
    _listening = false;
    _level = 0;
    _partial = '';
    notifyListeners();
  }

  /// Falls back to English when the requested pack is missing.
  String? _resolveLocale(String? requested) {
    if (requested == null) return null;
    if (_locales.isEmpty) return requested;
    final bool has = _locales.any((l) => l.localeId.replaceAll('-', '_') == requested);
    if (has) return requested;
    if (requested.startsWith('hi')) {
      AppLogger.w('Hindi STT pack missing — using English');
      return AppConfig.localeEnglish;
    }
    return requested;
  }

  void _onStatus(String status) {
    _listening = status == 'listening';
    if (!_listening) _level = 0;
    notifyListeners();
  }

  @override
  void dispose() {
    _speech.cancel();
    super.dispose();
  }
}
