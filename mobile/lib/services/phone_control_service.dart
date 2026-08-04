import 'package:android_intent_plus/android_intent.dart';
import 'package:android_intent_plus/flag.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:flutter/services.dart';
import 'package:torch_light/torch_light.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/utils/logger.dart';
import '../data/models/models.dart';
import 'permission_service.dart';

/// Result of executing an action — surfaced to the user as a snackbar/toast.
class ActionResult {
  const ActionResult(this.ok, this.message);
  final bool ok;
  final String message;

  static const ActionResult noop = ActionResult(true, '');
}

/// Turns an [AssistantAction] from the AI brain into a real Android action.
///
/// Everything goes through platform intents (no root, no accessibility abuse),
/// and every sensitive path re-checks its runtime permission first.
class PhoneControlService {
  const PhoneControlService();

  Future<ActionResult> execute(AssistantAction action) async {
    try {
      switch (action.type) {
        case ActionType.call:
          return _call(action);
        case ActionType.sms:
          return _sms(action);
        case ActionType.whatsapp:
          return _whatsapp(action);
        case ActionType.openApp:
          return _openApp(action);
        case ActionType.openUrl:
          return _openUrl(action.url ?? '');
        case ActionType.webSearch:
          return _openUrl(
            'https://www.google.com/search?q=${Uri.encodeComponent('${action.params['query']}')}',
          );
        case ActionType.youtubeSearch:
          return _openUrl(
            'https://www.youtube.com/results?search_query=${Uri.encodeComponent('${action.params['query']}')}',
          );
        case ActionType.playMusic:
          return _openUrl(
            'https://www.youtube.com/results?search_query=${Uri.encodeComponent('${action.params['query']}')}',
          );
        case ActionType.navigate:
          return _navigate('${action.params['place']}');
        case ActionType.setAlarm:
          return _setAlarm(action);
        case ActionType.setTimer:
          return _setTimer(action);
        case ActionType.openCamera:
          return _openCamera();
        case ActionType.openGallery:
          return _openGallery();
        case ActionType.openFiles:
          return _openFiles();
        case ActionType.openSettings:
          return _openSettings(action);
        case ActionType.toggleFlashlight:
          return _torch(action.params['on'] == true);
        case ActionType.batteryStatus:
          return _battery();
        // Handled by the app itself (saved server-side, shown in the UI).
        case ActionType.createReminder:
        case ActionType.createTask:
        case ActionType.createNote:
        case ActionType.showPlanner:
        case ActionType.showWeather:
        case ActionType.showNews:
        case ActionType.translate:
        case ActionType.calculate:
        case ActionType.speakOnly:
          return ActionResult.noop;
      }
    } on PlatformException catch (e) {
      AppLogger.e('Action ${action.type} failed', e);
      return ActionResult(false, 'That app or feature is not available on this phone.');
    } catch (e) {
      AppLogger.e('Action ${action.type} failed', e);
      return const ActionResult(false, 'Sorry, I could not complete that.');
    }
  }

  // ----------------------------------------------------------------- calls
  Future<ActionResult> _call(AssistantAction a) async {
    final String? number = a.params['number'] as String?;
    final String contact = '${a.params['contact'] ?? ''}';

    // Without a resolved number we hand off to the dialler pre-filled with the
    // contact search — the user taps once, so no CALL_PHONE permission needed.
    if (number == null || number.isEmpty) {
      final AndroidIntent intent = AndroidIntent(
        action: 'android.intent.action.DIAL',
        data: 'tel:',
        arguments: <String, dynamic>{'name': contact},
        flags: <int>[Flag.FLAG_ACTIVITY_NEW_TASK],
      );
      await intent.launch();
      return ActionResult(true, 'Opening the dialler for $contact');
    }

    if (!await PermissionService.ensurePhone()) {
      return const ActionResult(false, 'Phone permission is needed to place calls.');
    }
    final AndroidIntent intent = AndroidIntent(
      action: 'android.intent.action.CALL',
      data: 'tel:$number',
      flags: <int>[Flag.FLAG_ACTIVITY_NEW_TASK],
    );
    await intent.launch();
    return ActionResult(true, 'Calling $contact');
  }

  Future<ActionResult> _sms(AssistantAction a) async {
    if (!await PermissionService.ensureSms()) {
      // Composer fallback still works without the SEND_SMS permission.
      AppLogger.i('SMS permission denied — using the compose intent');
    }
    final String body = Uri.encodeComponent('${a.params['body'] ?? ''}');
    final String number = '${a.params['number'] ?? ''}';
    final Uri uri = Uri.parse('sms:$number?body=$body');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
    return ActionResult(true, 'Message ready for ${a.params['contact']}');
  }

  Future<ActionResult> _whatsapp(AssistantAction a) async {
    final String text = Uri.encodeComponent('${a.params['body'] ?? ''}');
    final String phone = '${a.params['number'] ?? ''}';
    final Uri uri = Uri.parse(
      phone.isEmpty ? 'https://wa.me/?text=$text' : 'https://wa.me/$phone?text=$text',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
    return ActionResult(true, 'Opening WhatsApp');
  }

  // ------------------------------------------------------------------ apps
  Future<ActionResult> _openApp(AssistantAction a) async {
    final String package = '${a.params['package'] ?? ''}';
    final String label = '${a.params['app'] ?? 'the app'}';

    if (package.isNotEmpty) {
      try {
        final AndroidIntent intent = AndroidIntent(
          action: 'action_main',
          package: package,
          flags: <int>[Flag.FLAG_ACTIVITY_NEW_TASK],
        );
        await intent.launch();
        return ActionResult(true, 'Opening $label');
      } catch (_) {
        AppLogger.w('$package not installed — falling back to the web');
      }
    }
    final String url = '${a.params['url'] ?? ''}';
    if (url.isNotEmpty) return _openUrl(url);
    return ActionResult(false, "I couldn't find $label on this phone.");
  }

  Future<ActionResult> _openUrl(String url) async {
    if (url.isEmpty) return const ActionResult(false, 'Nothing to open.');
    final Uri uri = Uri.parse(url);
    final bool ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    return ActionResult(ok, ok ? 'Opening…' : 'Could not open that link.');
  }

  Future<ActionResult> _navigate(String place) => _openUrl(
        'https://www.google.com/maps/dir/?api=1&destination=${Uri.encodeComponent(place)}',
      );

  // --------------------------------------------------------- clock & media
  Future<ActionResult> _setAlarm(AssistantAction a) async {
    final int hour = (a.params['hour'] as num?)?.toInt() ?? 7;
    final int minute = (a.params['minute'] as num?)?.toInt() ?? 0;
    final AndroidIntent intent = AndroidIntent(
      action: 'android.intent.action.SET_ALARM',
      arguments: <String, dynamic>{
        'android.intent.extra.alarm.HOUR': hour,
        'android.intent.extra.alarm.MINUTES': minute,
        'android.intent.extra.alarm.MESSAGE': '${a.params['label'] ?? 'Ajay AI Assistant'}',
        'android.intent.extra.alarm.SKIP_UI': true,
      },
      flags: <int>[Flag.FLAG_ACTIVITY_NEW_TASK],
    );
    await intent.launch();
    final String hh = hour.toString().padLeft(2, '0');
    final String mm = minute.toString().padLeft(2, '0');
    return ActionResult(true, 'Alarm set for $hh:$mm');
  }

  Future<ActionResult> _setTimer(AssistantAction a) async {
    final int seconds = (a.params['seconds'] as num?)?.toInt() ?? 300;
    final AndroidIntent intent = AndroidIntent(
      action: 'android.intent.action.SET_TIMER',
      arguments: <String, dynamic>{
        'android.intent.extra.alarm.LENGTH': seconds,
        'android.intent.extra.alarm.MESSAGE': 'Ajay timer',
        'android.intent.extra.alarm.SKIP_UI': true,
      },
      flags: <int>[Flag.FLAG_ACTIVITY_NEW_TASK],
    );
    await intent.launch();
    return ActionResult(true, 'Timer started for ${(seconds / 60).round()} minutes');
  }

  Future<ActionResult> _openCamera() async {
    const AndroidIntent intent = AndroidIntent(
      action: 'android.media.action.STILL_IMAGE_CAMERA',
      flags: <int>[Flag.FLAG_ACTIVITY_NEW_TASK],
    );
    await intent.launch();
    return const ActionResult(true, 'Camera opened');
  }

  Future<ActionResult> _openGallery() async {
    if (!await PermissionService.ensurePhotos()) {
      return const ActionResult(false, 'Photo access is needed to show your gallery.');
    }
    const AndroidIntent intent = AndroidIntent(
      action: 'android.intent.action.VIEW',
      type: 'image/*',
      flags: <int>[Flag.FLAG_ACTIVITY_NEW_TASK],
    );
    await intent.launch();
    return const ActionResult(true, 'Here are your photos');
  }

  Future<ActionResult> _openFiles() async {
    const AndroidIntent intent = AndroidIntent(
      action: 'android.intent.action.GET_CONTENT',
      type: '*/*',
      flags: <int>[Flag.FLAG_ACTIVITY_NEW_TASK],
    );
    await intent.launch();
    return const ActionResult(true, 'Files opened');
  }

  Future<ActionResult> _openSettings(AssistantAction a) async {
    final String action = '${a.androidIntent ?? a.params['intent'] ?? 'android.settings.SETTINGS'}';
    final AndroidIntent intent = AndroidIntent(
      action: action,
      flags: <int>[Flag.FLAG_ACTIVITY_NEW_TASK],
    );
    await intent.launch();
    return ActionResult(true, 'Opening ${a.params['page'] ?? 'phone'} settings');
  }

  // ---------------------------------------------------------------- device
  Future<ActionResult> _torch(bool on) async {
    on ? await TorchLight.enableTorch() : await TorchLight.disableTorch();
    return ActionResult(true, on ? 'Torch on' : 'Torch off');
  }

  Future<ActionResult> _battery() async {
    final int level = await Battery().batteryLevel;
    return ActionResult(true, 'Battery is at $level percent');
  }
}
