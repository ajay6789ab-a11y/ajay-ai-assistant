import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../core/utils/logger.dart';
import 'permission_service.dart';

/// Schedules reminder notifications on the device.
///
/// Reminders live in two places: the server (so they survive a reinstall) and
/// the local notification queue (so they fire without a network connection).
class NotificationService {
  NotificationService([FlutterLocalNotificationsPlugin? plugin])
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  bool _ready = false;

  static const AndroidNotificationDetails _android = AndroidNotificationDetails(
    'ajay_reminders',
    'Reminders',
    channelDescription: 'Reminders and alarms created through Ajay',
    importance: Importance.max,
    priority: Priority.high,
    playSound: true,
    enableVibration: true,
    styleInformation: BigTextStyleInformation(''),
  );

  Future<void> init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Kolkata'));

    const InitializationSettings settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _plugin.initialize(settings);
    await PermissionService.ensureNotifications();
    _ready = true;
    AppLogger.i('Notifications ready');
  }

  /// Schedules a one-off (or repeating) reminder.
  Future<void> scheduleReminder({
    required String id,
    required String title,
    required DateTime at,
    String repeat = 'none',
  }) async {
    await init();
    final int notificationId = id.hashCode & 0x7FFFFFFF;

    await _plugin.zonedSchedule(
      notificationId,
      'Ajay reminder',
      title,
      tz.TZDateTime.from(at, tz.local),
      const NotificationDetails(android: _android),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      matchDateTimeComponents: switch (repeat) {
        'daily' => DateTimeComponents.time,
        'weekly' => DateTimeComponents.dayOfWeekAndTime,
        _ => null,
      },
    );
    AppLogger.i('Reminder scheduled for $at ($repeat)');
  }

  Future<void> cancel(String id) => _plugin.cancel(id.hashCode & 0x7FFFFFFF);

  Future<void> cancelAll() => _plugin.cancelAll();

  /// Immediate confirmation toast-style notification (e.g. "Note saved").
  Future<void> notifyNow(String title, String body) async {
    await init();
    await _plugin.show(
      DateTime.now().millisecondsSinceEpoch & 0x7FFFFFFF,
      title,
      body,
      const NotificationDetails(android: _android),
    );
  }
}
