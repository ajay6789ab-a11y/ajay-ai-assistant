import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/models.dart';
import '../../providers/assistant_provider.dart';
import '../../providers/settings_provider.dart';
import '../../services/phone_control_service.dart';
import '../widgets/confirm_action_sheet.dart';
import 'chat_screen.dart';
import 'history_screen.dart';
import 'home_screen.dart';
import 'settings_screen.dart';

/// Root scaffold: aurora backdrop + the four tabs + the bottom navigation bar.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;
  final PageController _pages = PageController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final AssistantProvider assistant = context.read<AssistantProvider>();

      // Wire the consent sheet + action feedback into the provider.
      assistant.confirmationHandler =
          (AssistantAction action) => ConfirmActionSheet.show(context, action);
      assistant.onActionResult = (ActionResult r) {
        if (!mounted || r.message.isEmpty) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(r.message),
            backgroundColor: r.ok ? AppColors.bg2 : AppColors.danger.withOpacity(0.9),
          ),
        );
      };

      await context.read<SettingsProvider>().load();
      assistant.settings = context.read<SettingsProvider>().settings;
      await assistant.bootstrap();
    });
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _go(int i) {
    setState(() => _index = i);
    _pages.animateToPage(
      i,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: <Color>[AppColors.bg1, AppColors.bg0],
          ),
        ),
        child: Stack(
          children: <Widget>[
            // Ambient glows (the "aurora" backdrop).
            const Positioned.fill(
              child: DecoratedBox(decoration: BoxDecoration(gradient: AppColors.backdropTop)),
            ),
            const Positioned.fill(
              child: DecoratedBox(decoration: BoxDecoration(gradient: AppColors.backdropBottom)),
            ),
            PageView(
              controller: _pages,
              onPageChanged: (int i) => setState(() => _index = i),
              children: <Widget>[
                HomeScreen(onOpenChat: () => _go(1)),
                const ChatScreen(),
                HistoryScreen(onRerun: () => _go(1)),
                const SettingsScreen(),
              ],
            ),
          ],
        ),
      ),
      bottomNavigationBar: _NavBar(index: _index, onTap: _go),
    );
  }
}

/// Custom bottom navigation with a gradient indicator.
class _NavBar extends StatelessWidget {
  const _NavBar({required this.index, required this.onTap});

  final int index;
  final ValueChanged<int> onTap;

  static const List<(IconData, String)> _items = <(IconData, String)>[
    (Icons.home_rounded, 'Home'),
    (Icons.forum_rounded, 'Chat'),
    (Icons.history_rounded, 'History'),
    (Icons.settings_rounded, 'Settings'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(top: 8, bottom: 14, left: 14, right: 14),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[Colors.transparent, Color(0xE604050C)],
          stops: <double>[0, 0.45],
        ),
      ),
      child: Row(
        children: <Widget>[
          for (int i = 0; i < _items.length; i++)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onTap(i),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    AnimatedScale(
                      scale: index == i ? 1.1 : 1,
                      duration: const Duration(milliseconds: 240),
                      curve: Curves.easeOutBack,
                      child: index == i
                          ? ShaderMask(
                              shaderCallback: (Rect b) =>
                                  AppColors.primaryGradient.createShader(b),
                              child: Icon(_items[i].$1, size: 22, color: Colors.white),
                            )
                          : Icon(_items[i].$1, size: 22, color: AppColors.textFaint),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _items[i].$2,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: index == i ? AppColors.text : AppColors.textFaint,
                      ),
                    ),
                    const SizedBox(height: 4),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 260),
                      height: 3,
                      width: index == i ? 22 : 0,
                      decoration: const BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        borderRadius: BorderRadius.all(Radius.circular(3)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
