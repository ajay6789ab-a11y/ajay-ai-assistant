import 'package:permission_handler/permission_handler.dart';

import '../core/utils/logger.dart';

/// Runtime permission helper.
///
/// Policy (see docs/SECURITY.md):
///  * Nothing is requested at install time — every permission is asked for
///    *in context*, the first time the user triggers the matching feature.
///  * Calls and SMS additionally require an explicit in-app confirmation
///    sheet, even after the OS permission has been granted.
class PermissionService {
  const PermissionService._();

  static Future<bool> ensureMicrophone() => _ensure(Permission.microphone);

  static Future<bool> ensurePhone() => _ensure(Permission.phone);

  static Future<bool> ensureContacts() => _ensure(Permission.contacts);

  static Future<bool> ensureSms() => _ensure(Permission.sms);

  static Future<bool> ensureNotifications() => _ensure(Permission.notification);

  /// Android 13+ splits storage into granular media permissions.
  static Future<bool> ensurePhotos() async {
    if (await _ensure(Permission.photos)) return true;
    return _ensure(Permission.storage);
  }

  static Future<bool> ensureLocation() => _ensure(Permission.locationWhenInUse);

  static Future<bool> _ensure(Permission permission) async {
    PermissionStatus status = await permission.status;
    if (status.isGranted) return true;

    if (status.isPermanentlyDenied) {
      AppLogger.w('$permission permanently denied — user must enable it in Settings');
      return false;
    }

    status = await permission.request();
    AppLogger.i('$permission -> $status');
    return status.isGranted;
  }

  /// Opens the OS app-settings page (used when a permission is blocked).
  static Future<bool> openSettingsPage() => openAppSettings();
}
