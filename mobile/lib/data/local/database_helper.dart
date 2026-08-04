import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../../core/config/app_config.dart';
import '../../core/utils/logger.dart';
import '../models/models.dart';

/// On-device SQLite mirror of the server database.
///
/// Purpose:
///  * the Chat and History screens open instantly (no network wait),
///  * the assistant keeps working offline with the rule engine,
///  * pending turns are re-synced when connectivity returns.
///
/// The schema deliberately matches `backend/app/database.py`.
class DatabaseHelper {
  DatabaseHelper._();
  static final DatabaseHelper instance = DatabaseHelper._();

  static const int _version = 1;
  Database? _db;

  Future<Database> get database async => _db ??= await _open();

  Future<Database> _open() async {
    final String path = p.join(await getDatabasesPath(), 'ajay.db');
    AppLogger.i('Opening local database at $path');
    return openDatabase(path, version: _version, onCreate: _create, onUpgrade: _upgrade);
  }

  Future<void> _create(Database db, int version) async {
    await db.execute('''
      CREATE TABLE messages (
        id         TEXT PRIMARY KEY,
        role       TEXT NOT NULL,
        content    TEXT NOT NULL,
        intent     TEXT,
        language   TEXT DEFAULT 'en',
        synced     INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      )''');
    await db.execute('CREATE INDEX idx_messages_time ON messages(created_at DESC)');

    await db.execute('''
      CREATE TABLE history (
        id          TEXT PRIMARY KEY,
        command     TEXT NOT NULL,
        reply       TEXT,
        intent      TEXT,
        action_type TEXT,
        confidence  REAL DEFAULT 0,
        source      TEXT DEFAULT 'voice',
        created_at  TEXT NOT NULL
      )''');
    await db.execute('CREATE INDEX idx_history_time ON history(created_at DESC)');

    await db.execute('''
      CREATE TABLE tasks (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        notes      TEXT,
        due_at     TEXT,
        priority   INTEGER DEFAULT 1,
        done       INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )''');

    await db.execute('''
      CREATE TABLE notes (
        id         TEXT PRIMARY KEY,
        title      TEXT,
        body       TEXT NOT NULL,
        audio_path TEXT,
        created_at TEXT NOT NULL
      )''');
  }

  Future<void> _upgrade(Database db, int oldV, int newV) async {
    AppLogger.i('Migrating local db $oldV -> $newV');
    // Future migrations go here.
  }

  // -------------------------------------------------------------- messages
  Future<void> saveMessage(ChatMessage m, {bool synced = true}) async {
    final Database db = await database;
    await db.insert(
      'messages',
      {...m.toMap(), 'synced': synced ? 1 : 0},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    await _trim('messages');
  }

  Future<List<ChatMessage>> loadMessages({int limit = 100}) async {
    final Database db = await database;
    final List<Map<String, Object?>> rows = await db.query(
      'messages',
      orderBy: 'created_at DESC',
      limit: limit,
    );
    return rows.reversed
        .map((r) => ChatMessage(
              id: r['id'] as String,
              role: r['role'] as String,
              content: r['content'] as String,
              intent: r['intent'] as String?,
              language: r['language'] as String? ?? 'en',
              createdAt: DateTime.parse(r['created_at'] as String),
            ))
        .toList();
  }

  Future<void> clearMessages() async => (await database).delete('messages');

  // --------------------------------------------------------------- history
  Future<void> saveHistory(HistoryItem h) async {
    final Database db = await database;
    await db.insert(
      'history',
      {
        'id': h.id,
        'command': h.command,
        'reply': h.reply,
        'intent': h.intent,
        'action_type': h.actionType,
        'confidence': h.confidence,
        'source': h.source,
        'created_at': h.createdAt.toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    await _trim('history');
  }

  Future<List<HistoryItem>> searchHistory(String query) async {
    final Database db = await database;
    final List<Map<String, Object?>> rows = await db.query(
      'history',
      where: query.isEmpty ? null : 'command LIKE ? OR reply LIKE ?',
      whereArgs: query.isEmpty ? null : ['%$query%', '%$query%'],
      orderBy: 'created_at DESC',
      limit: 200,
    );
    return rows.map((r) => HistoryItem.fromJson(Map<String, dynamic>.from(r))).toList();
  }

  Future<void> clearHistory() async => (await database).delete('history');

  /// Keeps the local cache bounded.
  Future<void> _trim(String table) async {
    final Database db = await database;
    await db.rawDelete('''
      DELETE FROM $table WHERE id NOT IN (
        SELECT id FROM $table ORDER BY created_at DESC LIMIT ${AppConfig.localHistoryLimit}
      )''');
  }

  Future<void> wipe() async {
    final Database db = await database;
    await db.transaction((txn) async {
      for (final String t in ['messages', 'history', 'tasks', 'notes']) {
        await txn.delete(t);
      }
    });
  }
}
