import 'package:flutter/foundation.dart';

import '../core/utils/logger.dart';
import '../data/local/database_helper.dart';
import '../data/local/secure_store.dart';
import '../data/models/models.dart';
import '../data/remote/api_client.dart';

/// Owns user settings, the memory list and account-level privacy actions.
class SettingsProvider extends ChangeNotifier {
  SettingsProvider({required ApiClient api, SecureStore? store})
      : _api = api,
        _store = store ?? SecureStore();

  final ApiClient _api;
  final SecureStore _store;

  AppSettings _settings = const AppSettings();
  List<Map<String, dynamic>> _voices = const [];
  List<Map<String, dynamic>> _languages = const [];
  List<Map<String, dynamic>> _memories = const [];
  Map<String, dynamic> _habits = const {};
  bool _loading = false;

  AppSettings get settings => _settings;
  List<Map<String, dynamic>> get voices => _voices;
  List<Map<String, dynamic>> get languages => _languages;
  List<Map<String, dynamic>> get memories => _memories;
  Map<String, dynamic> get habits => _habits;
  bool get loading => _loading;

  Future<void> load() async {
    _loading = true;
    notifyListeners();
    try {
      final Map<String, dynamic> res = await _api.settings();
      _settings = AppSettings.fromJson(Map<String, dynamic>.from(res['settings'] as Map));
      _voices = (res['voices'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      _languages =
          (res['languages'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      await loadMemory();
    } catch (e) {
      AppLogger.w('Settings load failed (using defaults): $e');
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> loadMemory() async {
    try {
      final Map<String, dynamic> res = await _api.memory();
      _memories = (res['items'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      _habits = Map<String, dynamic>.from(res['habits'] as Map? ?? {});
      notifyListeners();
    } catch (e) {
      AppLogger.w('Memory load failed: $e');
    }
  }

  /// Optimistically applies a change, then persists it.
  Future<void> update(Map<String, dynamic> patch) async {
    final AppSettings previous = _settings;
    _settings = AppSettings.fromJson({..._toJson(previous), ...patch});
    notifyListeners();
    try {
      _settings = await _api.updateSettings(patch);
    } catch (e) {
      AppLogger.w('Settings update failed, rolling back: $e');
      _settings = previous;
    }
    notifyListeners();
  }

  Future<void> wipeMemory() async {
    await _api.wipeMemory();
    await loadMemory();
  }

  Future<void> clearHistory() => _api.clearHistory();

  /// Right-to-erasure: deletes the server account, local DB and secure store.
  Future<void> deleteAccount() async {
    await _api.deleteAccount();
    await DatabaseHelper.instance.wipe();
    await _store.wipe();
  }

  Map<String, dynamic> _toJson(AppSettings s) => {
        'language': s.language,
        'voice': s.voice,
        'speech_rate': s.speechRate,
        'pitch': s.pitch,
        'wake_word_enabled': s.wakeWordEnabled,
        'haptics': s.haptics,
        'auto_speak_replies': s.autoSpeakReplies,
        'confirm_calls': s.confirmCalls,
        'confirm_messages': s.confirmMessages,
        'save_history': s.saveHistory,
        'personalised_memory': s.personalisedMemory,
        'analytics': s.analytics,
        'theme': s.theme,
      };
}
