import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/utils/logger.dart';
import '../data/local/database_helper.dart';
import '../data/models/models.dart';
import '../data/remote/api_client.dart';

/// Backs the History screen: search, stats and deletion.
///
/// Reads the local cache first (instant), then reconciles with the server.
class HistoryProvider extends ChangeNotifier {
  HistoryProvider({required ApiClient api, DatabaseHelper? db})
      : _api = api,
        _db = db ?? DatabaseHelper.instance;

  final ApiClient _api;
  final DatabaseHelper _db;

  List<HistoryItem> _items = const [];
  Map<String, dynamic> _stats = const {};
  String _query = '';
  bool _loading = false;
  Timer? _debounce;

  List<HistoryItem> get items => _items;
  Map<String, dynamic> get stats => _stats;
  String get query => _query;
  bool get loading => _loading;

  int get total => (_stats['total'] as int?) ?? _items.length;
  String get topIntent {
    final List<dynamic> byIntent = (_stats['by_intent'] as List?) ?? const [];
    return byIntent.isEmpty ? '—' : '${byIntent.first['intent']}';
  }

  int get voiceCount {
    final List<dynamic> bySource = (_stats['by_source'] as List?) ?? const [];
    for (final dynamic s in bySource) {
      if (s['source'] == 'voice') return s['c'] as int;
    }
    return 0;
  }

  /// Debounced search-as-you-type.
  void search(String value) {
    _query = value;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), load);
    notifyListeners();
  }

  Future<void> load() async {
    _loading = true;
    notifyListeners();

    _items = await _db.searchHistory(_query);   // cache-first paint
    notifyListeners();

    try {
      final List<HistoryItem> remote = await _api.history(query: _query.isEmpty ? null : _query);
      _items = remote;
      _stats = await _api.historyStats();
      for (final HistoryItem h in remote.take(100)) {
        await _db.saveHistory(h);
      }
    } catch (e) {
      AppLogger.w('History sync failed, showing cache: $e');
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> delete(HistoryItem item) async {
    _items = _items.where((i) => i.id != item.id).toList();
    notifyListeners();
    try {
      await _api.deleteHistoryItem(item.id);
    } catch (e) {
      AppLogger.w('Delete failed: $e');
    }
  }

  Future<void> clear() async {
    _items = const [];
    _stats = const {};
    notifyListeners();
    await _api.clearHistory();
    await _db.clearHistory();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }
}
