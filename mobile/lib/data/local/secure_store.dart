import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Encrypted key/value storage for anything sensitive.
///
/// On Android this is backed by the hardware Keystore (AES-GCM), so the JWT
/// and the device identity are never readable from a rooted file dump.
class SecureStore {
  SecureStore([FlutterSecureStorage? storage])
      : _s = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _s;

  static const String _kToken = 'ajay.jwt';
  static const String _kDevice = 'ajay.device_id';
  static const String _kName = 'ajay.user_name';

  Future<String?> readToken() => _s.read(key: _kToken);
  Future<void> writeToken(String token) => _s.write(key: _kToken, value: token);
  Future<void> clearToken() => _s.delete(key: _kToken);

  Future<String?> readName() => _s.read(key: _kName);
  Future<void> writeName(String name) => _s.write(key: _kName, value: name);

  /// Stable, random per-install identifier (never a hardware ID — privacy).
  Future<String> deviceId() async {
    final String? existing = await _s.read(key: _kDevice);
    if (existing != null && existing.isNotEmpty) return existing;

    final Random rnd = Random.secure();
    final String id = 'and-${List<int>.generate(16, (_) => rnd.nextInt(256)).map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';
    await _s.write(key: _kDevice, value: id);
    return id;
  }

  /// Full wipe — used by "Delete account & data".
  Future<void> wipe() => _s.deleteAll();
}
