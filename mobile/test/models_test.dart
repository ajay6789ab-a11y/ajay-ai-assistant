import 'package:ajay_ai_assistant/data/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

/// Contract tests: the JSON the FastAPI brain returns must always decode into
/// the exact action the phone is expected to perform.
void main() {
  group('ActionType mapping', () {
    test('maps every backend action string', () {
      const Map<String, ActionType> expected = <String, ActionType>{
        'CALL': ActionType.call,
        'SMS': ActionType.sms,
        'WHATSAPP': ActionType.whatsapp,
        'OPEN_APP': ActionType.openApp,
        'WEB_SEARCH': ActionType.webSearch,
        'YOUTUBE_SEARCH': ActionType.youtubeSearch,
        'SET_ALARM': ActionType.setAlarm,
        'SET_TIMER': ActionType.setTimer,
        'OPEN_CAMERA': ActionType.openCamera,
        'OPEN_GALLERY': ActionType.openGallery,
        'OPEN_FILES': ActionType.openFiles,
        'OPEN_SETTINGS': ActionType.openSettings,
        'CREATE_REMINDER': ActionType.createReminder,
        'CREATE_TASK': ActionType.createTask,
        'CREATE_NOTE': ActionType.createNote,
        'SHOW_WEATHER': ActionType.showWeather,
        'SHOW_NEWS': ActionType.showNews,
        'TRANSLATE': ActionType.translate,
        'CALCULATE': ActionType.calculate,
        'NAVIGATE': ActionType.navigate,
        'TOGGLE_FLASHLIGHT': ActionType.toggleFlashlight,
        'BATTERY_STATUS': ActionType.batteryStatus,
        'SPEAK_ONLY': ActionType.speakOnly,
      };
      expected.forEach((String raw, ActionType type) {
        expect(ActionType.fromApi(raw), type, reason: raw);
      });
    });

    test('unknown values degrade to speakOnly instead of throwing', () {
      expect(ActionType.fromApi('LAUNCH_ROCKET'), ActionType.speakOnly);
    });
  });

  group('AssistantReply', () {
    test('decodes a full "Call Rahul" payload', () {
      final AssistantReply reply = AssistantReply.fromJson(<String, dynamic>{
        'reply': 'Calling Rahul. Shall I dial now?',
        'intent': 'call',
        'confidence': 0.95,
        'language': 'en',
        'action': <String, dynamic>{
          'type': 'CALL',
          'params': <String, dynamic>{'contact': 'Rahul', 'number': null},
          'requires_confirmation': true,
          'confirmation_prompt': 'Call Rahul now?',
        },
        'speak': true,
        'data': <String, dynamic>{},
        'message_id': 'abc123',
        'engine': 'rules',
      });

      expect(reply.action.type, ActionType.call);
      expect(reply.action.requiresConfirmation, isTrue);
      expect(reply.action.contact, 'Rahul');
      expect(reply.confidence, closeTo(0.95, 0.001));
    });

    test('decodes a Hindi weather payload with tool data', () {
      final AssistantReply reply = AssistantReply.fromJson(<String, dynamic>{
        'reply': 'दिल्ली में अभी 29 डिग्री',
        'intent': 'weather',
        'confidence': 0.92,
        'language': 'hi',
        'action': <String, dynamic>{
          'type': 'SHOW_WEATHER',
          'params': <String, dynamic>{'city': 'Delhi'},
        },
        'speak': true,
        'data': <String, dynamic>{
          'weather': <String, dynamic>{'ok': true, 'temp_c': 29, 'city': 'Delhi'},
        },
        'message_id': 'w1',
        'engine': 'rules',
      });

      expect(reply.language, 'hi');
      expect(reply.action.type, ActionType.showWeather);
      expect(reply.data['weather']['temp_c'], 29);
    });

    test('tolerates a minimal/partial payload', () {
      final AssistantReply reply = AssistantReply.fromJson(<String, dynamic>{'reply': 'ok'});
      expect(reply.intent, 'chat');
      expect(reply.action.type, ActionType.speakOnly);
    });
  });

  group('AppSettings', () {
    test('derives speech locales from the language preference', () {
      const AppSettings hindi = AppSettings(language: 'hi-IN');
      expect(hindi.sttLocale, 'hi_IN');
      expect(hindi.ttsLocale, 'hi-IN');

      const AppSettings auto = AppSettings();
      expect(auto.sttLocale, 'en_IN');
    });

    test('detects the requested voice gender', () {
      expect(const AppSettings(voice: 'male_deep').prefersMaleVoice, isTrue);
      expect(const AppSettings(voice: 'female_warm').prefersMaleVoice, isFalse);
    });

    test('privacy defaults are safe (confirmations on)', () {
      const AppSettings s = AppSettings();
      expect(s.confirmCalls, isTrue);
      expect(s.confirmMessages, isTrue);
      expect(s.analytics, isFalse);
    });
  });
}
