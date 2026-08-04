import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/config/app_config.dart';
import '../../core/utils/logger.dart';
import '../local/secure_store.dart';
import '../models/models.dart';

/// Thrown for any non-2xx response so the UI can show a friendly message.
class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Thin, typed REST client for the FastAPI backend.
///
/// * Automatically attaches the JWT bearer token.
/// * Transparently re-authenticates the device once on a 401.
/// * All calls time out (never leave the mic spinner hanging).
class ApiClient {
  ApiClient({http.Client? client, SecureStore? store})
      : _http = client ?? http.Client(),
        _store = store ?? SecureStore();

  final http.Client _http;
  final SecureStore _store;
  String? _token;

  Uri _uri(String path, [Map<String, dynamic>? query]) => Uri.parse(
        '${AppConfig.apiBaseUrl}$path',
      ).replace(
        queryParameters: query?.map((k, v) => MapEntry(k, '$v'))
          ?..removeWhere((_, v) => v == 'null'),
      );

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  // ------------------------------------------------------------------ auth
  /// Signs the device in anonymously (creates the account on first launch).
  Future<Map<String, dynamic>> authenticateDevice() async {
    final String deviceId = await _store.deviceId();
    final Map<String, dynamic> res = await _post('/api/auth/guest', {
      'device_id': deviceId,
      'name': await _store.readName() ?? 'Friend',
    }, authed: false);
    _token = res['access_token'] as String;
    await _store.writeToken(_token!);
    return Map<String, dynamic>.from(res['user'] as Map);
  }

  Future<void> restoreSession() async => _token = await _store.readToken();

  Future<Map<String, dynamic>> register(String name, String email, String password) async {
    final Map<String, dynamic> res = await _post('/api/auth/register', {
      'name': name,
      'email': email,
      'password': password,
    }, authed: false);
    _token = res['access_token'] as String;
    await _store.writeToken(_token!);
    return Map<String, dynamic>.from(res['user'] as Map);
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final Map<String, dynamic> res = await _post('/api/auth/login', {
      'email': email,
      'password': password,
    }, authed: false);
    _token = res['access_token'] as String;
    await _store.writeToken(_token!);
    return Map<String, dynamic>.from(res['user'] as Map);
  }

  // ------------------------------------------------------------- assistant
  Future<AssistantReply> chat(
    String text, {
    String source = 'voice',
    String? language,
    String? location,
  }) async {
    final Map<String, dynamic> res = await _post('/api/assistant/chat', {
      'text': text,
      'source': source,
      'language': language,
      'client_time': DateTime.now().toIso8601String(),
      'location': location,
    });
    return AssistantReply.fromJson(res);
  }

  /// Rules-only parse used in offline mode (no side effects on the server).
  Future<AssistantAction> parseIntent(String text) async {
    final Map<String, dynamic> res = await _post('/api/assistant/intent', {'text': text});
    return AssistantAction.fromJson(Map<String, dynamic>.from(res['action'] as Map));
  }

  Future<List<ChatMessage>> conversation({int limit = 50}) async {
    final Map<String, dynamic> res = await _get('/api/assistant/conversation', {'limit': limit});
    return (res['messages'] as List)
        .map((e) => ChatMessage.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<void> clearConversation() => _delete('/api/assistant/conversation');

  Future<List<Suggestion>> suggestions() async {
    final Map<String, dynamic> res = await _get('/api/assistant/suggestions');
    return (res['suggestions'] as List)
        .map((e) => Suggestion.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  // --------------------------------------------------------------- history
  Future<List<HistoryItem>> history({String? query, int limit = 100}) async {
    final Map<String, dynamic> res =
        await _get('/api/history', {'q': query, 'limit': limit});
    return (res['items'] as List)
        .map((e) => HistoryItem.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<Map<String, dynamic>> historyStats() => _get('/api/history/stats');
  Future<void> clearHistory() => _delete('/api/history');
  Future<void> deleteHistoryItem(String id) => _delete('/api/history/$id');

  // ----------------------------------------------------------- productivity
  Future<List<TaskItem>> tasks({bool? done}) async {
    final Map<String, dynamic> res = await _get('/api/tasks', {'done': done});
    return (res['items'] as List)
        .map((e) => TaskItem.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<TaskItem> createTask(String title, {int priority = 1, String? dueAt}) async {
    final Map<String, dynamic> res =
        await _post('/api/tasks', {'title': title, 'priority': priority, 'due_at': dueAt});
    return TaskItem.fromJson(res);
  }

  Future<void> toggleTask(String id, bool done) => _patch('/api/tasks/$id', {'done': done});
  Future<void> deleteTask(String id) => _delete('/api/tasks/$id');

  Future<Map<String, dynamic>> planner() => _get('/api/tasks/planner/today');

  Future<List<ReminderItem>> reminders() async {
    final Map<String, dynamic> res = await _get('/api/reminders', {'upcoming_only': true});
    return (res['items'] as List)
        .map((e) => ReminderItem.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<ReminderItem> createReminder(String title, DateTime at, {String repeat = 'none'}) async {
    final Map<String, dynamic> res = await _post('/api/reminders', {
      'title': title,
      'remind_at': at.toIso8601String(),
      'repeat': repeat,
    });
    return ReminderItem.fromJson(res);
  }

  Future<Map<String, dynamic>> createNote(String body, {String? title, String? audioPath}) =>
      _post('/api/notes', {'body': body, 'title': title, 'audio_path': audioPath});

  Future<List<Map<String, dynamic>>> notes({String? query}) async {
    final Map<String, dynamic> res = await _get('/api/notes', {'q': query});
    return (res['items'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  // ---------------------------------------------------------------- memory
  Future<Map<String, dynamic>> memory() => _get('/api/memory');
  Future<void> remember(String key, String value) =>
      _post('/api/memory', {'key': key, 'value': value});
  Future<void> wipeMemory() => _delete('/api/memory');

  // -------------------------------------------------------------- settings
  Future<Map<String, dynamic>> settings() => _get('/api/settings');
  Future<AppSettings> updateSettings(Map<String, dynamic> patch) async {
    final Map<String, dynamic> res = await _patch('/api/settings', patch);
    return AppSettings.fromJson(Map<String, dynamic>.from(res['settings'] as Map));
  }

  Future<void> deleteAccount() => _delete('/api/settings/account');

  // ----------------------------------------------------------------- tools
  Future<Map<String, dynamic>> weather(String city, {String language = 'en'}) =>
      _get('/api/tools/weather', {'city': city, 'language': language});

  Future<Map<String, dynamic>> news(String topic, {String language = 'en'}) =>
      _get('/api/tools/news', {'topic': topic, 'language': language});

  Future<Map<String, dynamic>> translate(String text, String target) =>
      _get('/api/tools/translate', {'text': text, 'target': target});

  Future<Map<String, dynamic>> calculate(String expression) =>
      _get('/api/tools/calculate', {'expression': expression});

  Future<Map<String, dynamic>> health() => _get('/api/health', null, authed: false);

  // -------------------------------------------------------------- plumbing
  Future<Map<String, dynamic>> _get(
    String path, [
    Map<String, dynamic>? query,
    bool authed = true,
  ]) =>
      _send(() => _http.get(_uri(path, query), headers: _headers), path, authed);

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body,
          {bool authed = true}) =>
      _send(() => _http.post(_uri(path), headers: _headers, body: jsonEncode(body)), path, authed);

  Future<Map<String, dynamic>> _patch(String path, Map<String, dynamic> body) =>
      _send(() => _http.patch(_uri(path), headers: _headers, body: jsonEncode(body)), path, true);

  Future<Map<String, dynamic>> _delete(String path) =>
      _send(() => _http.delete(_uri(path), headers: _headers), path, true);

  /// Executes a request, retrying once after a silent re-auth on 401.
  Future<Map<String, dynamic>> _send(
    Future<http.Response> Function() request,
    String path,
    bool authed, [
    bool isRetry = false,
  ]) async {
    try {
      final http.Response res = await request().timeout(AppConfig.httpTimeout);

      if (res.statusCode == 401 && authed && !isRetry) {
        AppLogger.w('Token rejected — re-authenticating device');
        await authenticateDevice();
        return _send(request, path, authed, true);
      }
      if (res.statusCode >= 400) {
        throw ApiException(res.statusCode, _extractDetail(res.body));
      }
      if (res.body.isEmpty) return <String, dynamic>{};
      final dynamic decoded = jsonDecode(utf8.decode(res.bodyBytes));
      return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    } on TimeoutException {
      throw ApiException(408, 'The assistant took too long to answer.');
    } on ApiException {
      rethrow;
    } catch (e) {
      AppLogger.e('Request failed: $path', e);
      throw ApiException(0, 'No connection to the assistant service.');
    }
  }

  String _extractDetail(String body) {
    try {
      final dynamic j = jsonDecode(body);
      if (j is Map && j['detail'] != null) return j['detail'].toString();
    } catch (_) {/* fall through */}
    return 'Request failed';
  }

  void dispose() => _http.close();
}
