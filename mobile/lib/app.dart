import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/config/app_config.dart';
import 'core/theme/app_theme.dart';
import 'core/utils/logger.dart';
import 'data/remote/api_client.dart';
import 'presentation/screens/main_shell.dart';
import 'presentation/screens/splash_screen.dart';
import 'providers/assistant_provider.dart';
import 'providers/history_provider.dart';
import 'providers/settings_provider.dart';
import 'services/notification_service.dart';
import 'services/speech_service.dart';
import 'services/tts_service.dart';

/// Root widget: builds the dependency graph and boots the app.
class AjayApp extends StatelessWidget {
  const AjayApp({super.key});

  @override
  Widget build(BuildContext context) {
    final ApiClient api = ApiClient();

    return MultiProvider(
      providers: <SingleChildStatelessWidget>[
        // ---- singletons -------------------------------------------------
        Provider<ApiClient>.value(value: api),
        ChangeNotifierProvider<SpeechService>(create: (_) => SpeechService()),
        ChangeNotifierProvider<TtsService>(create: (_) => TtsService()),
        Provider<NotificationService>(create: (_) => NotificationService()),

        // ---- feature providers ------------------------------------------
        ChangeNotifierProxyProvider2<SpeechService, TtsService, AssistantProvider>(
          create: (BuildContext ctx) => AssistantProvider(
            api: api,
            speech: ctx.read<SpeechService>(),
            tts: ctx.read<TtsService>(),
            notifications: ctx.read<NotificationService>(),
          ),
          update: (_, __, ___, AssistantProvider? previous) => previous!,
        ),
        ChangeNotifierProvider<SettingsProvider>(create: (_) => SettingsProvider(api: api)),
        ChangeNotifierProvider<HistoryProvider>(create: (_) => HistoryProvider(api: api)),
      ],
      child: MaterialApp(
        title: AppConfig.appName,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        themeMode: ThemeMode.dark,
        home: const _Bootstrapper(),
        builder: (BuildContext context, Widget? child) {
          // Lock text scaling so the futuristic layout never breaks on
          // devices with very large system font settings.
          final MediaQueryData mq = MediaQuery.of(context);
          return MediaQuery(
            data: mq.copyWith(
              textScaler: TextScaler.linear(mq.textScaler.scale(1).clamp(0.85, 1.15)),
            ),
            child: child!,
          );
        },
      ),
    );
  }
}

/// Runs one-time async start-up work behind the splash screen.
class _Bootstrapper extends StatefulWidget {
  const _Bootstrapper();

  @override
  State<_Bootstrapper> createState() => _BootstrapperState();
}

class _BootstrapperState extends State<_Bootstrapper> {
  String _status = 'Waking up…';
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final ApiClient api = context.read<ApiClient>();
    try {
      setState(() => _status = 'Signing in securely…');
      await api.restoreSession();
      await api.authenticateDevice();

      setState(() => _status = 'Starting voice engines…');
      await context.read<TtsService>().init();
      await context.read<SpeechService>().init();

      setState(() => _status = 'Preparing reminders…');
      await context.read<NotificationService>().init();
    } catch (e) {
      AppLogger.e('Bootstrap issue (continuing offline)', e);
    }
    if (!mounted) return;
    // A short beat so the splash animation does not flash by.
    await Future<void>.delayed(const Duration(milliseconds: 500));
    if (mounted) setState(() => _ready = true);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 600),
      child: _ready ? const MainShell() : SplashScreen(status: _status),
    );
  }
}
