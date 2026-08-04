import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

/// Minimal logger that stays silent in release builds.
///
/// Never log user speech, contacts or tokens — see docs/SECURITY.md.
class AppLogger {
  const AppLogger._();

  static void d(String message) => _log('DEBUG', message);
  static void i(String message) => _log('INFO', message);
  static void w(String message) => _log('WARN', message);

  static void e(String message, [Object? error, StackTrace? stack]) {
    _log('ERROR', '$message${error != null ? ' — $error' : ''}');
    if (kDebugMode && stack != null) developer.log(stack.toString(), name: 'Ajay');
  }

  static void _log(String level, String message) {
    if (!kDebugMode) return;
    developer.log('[$level] $message', name: 'Ajay');
  }
}
