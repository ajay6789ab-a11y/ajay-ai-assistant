import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

import '../core/utils/logger.dart';
import '../data/models/models.dart';

/// Text-to-speech wrapper.
///
/// Picks a natural Indian-English or Hindi voice, honours the user's rate and
/// pitch settings, and exposes `isSpeaking` so the AI orb can pulse in sync.
class TtsService extends ChangeNotifier {
  TtsService({FlutterTts? engine}) : _tts = engine ?? FlutterTts();

  final FlutterTts _tts;
  bool _ready = false;
  bool _speaking = false;

  bool get isSpeaking => _speaking;

  Future<void> init() async {
    if (_ready) return;
    await _tts.awaitSpeakCompletion(true);
    await _tts.setSharedInstance(true);

    _tts.setStartHandler(() {
      _speaking = true;
      notifyListeners();
    });
    _tts.setCompletionHandler(() {
      _speaking = false;
      notifyListeners();
    });
    _tts.setCancelHandler(() {
      _speaking = false;
      notifyListeners();
    });
    _tts.setErrorHandler((dynamic msg) {
      AppLogger.w('TTS error: $msg');
      _speaking = false;
      notifyListeners();
    });

    _ready = true;
    AppLogger.i('TTS ready');
  }

  /// Speaks [text] in [language] ('hi' or 'en') using the user's voice choice.
  Future<void> speak(
    String text, {
    String language = 'en',
    AppSettings? settings,
  }) async {
    if (text.trim().isEmpty) return;
    await init();
    await stop();

    final AppSettings s = settings ?? const AppSettings();
    final String locale = language == 'hi' ? 'hi-IN' : 'en-IN';

    await _tts.setLanguage(locale);
    await _tts.setSpeechRate(s.speechRate); // 0.0 – 1.0 on Android
    await _tts.setPitch(s.pitch);
    await _tts.setVolume(1.0);
    await _applyVoice(locale, preferMale: s.prefersMaleVoice);

    // Strip markdown/emoji so the engine does not read symbols aloud.
    final String clean = text
        .replaceAll(RegExp(r'[*_`#>]'), '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    await _tts.speak(clean);
  }

  /// Chooses the most natural installed voice for the locale + gender.
  Future<void> _applyVoice(String locale, {required bool preferMale}) async {
    try {
      final List<dynamic> voices = await _tts.getVoices as List<dynamic>;
      final List<Map<String, String>> matching = voices
          .map((dynamic v) => Map<String, String>.from(v as Map))
          .where((v) => (v['locale'] ?? '').toLowerCase().startsWith(locale.toLowerCase()))
          .toList();
      if (matching.isEmpty) return;

      final RegExp maleHint = RegExp(r'#male|male', caseSensitive: false);
      final RegExp femaleHint = RegExp(r'#female|female', caseSensitive: false);

      final Map<String, String> chosen = matching.firstWhere(
        (v) => preferMale
            ? maleHint.hasMatch(v['name'] ?? '')
            : femaleHint.hasMatch(v['name'] ?? ''),
        orElse: () => matching.first,
      );
      await _tts.setVoice({'name': chosen['name']!, 'locale': chosen['locale']!});
    } catch (e) {
      AppLogger.w('Voice selection skipped: $e');
    }
  }

  Future<void> stop() async {
    await _tts.stop();
    _speaking = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _tts.stop();
    super.dispose();
  }
}
