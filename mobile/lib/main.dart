import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';
import 'core/theme/app_colors.dart';

/// Entry point.
///
/// Run against a local backend:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Edge-to-edge, transparent system bars — part of the futuristic look.
  await SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.edgeToEdge,
    overlays: SystemUiOverlay.values,
  );
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppColors.bg0,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  // The assistant is portrait-only (the orb layout assumes a tall screen).
  await SystemChrome.setPreferredOrientations(<DeviceOrientation>[
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(const AjayApp());
}
