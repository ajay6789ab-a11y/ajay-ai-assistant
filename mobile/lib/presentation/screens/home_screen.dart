import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_colors.dart';
import '../../providers/assistant_provider.dart';
import '../../providers/settings_provider.dart';
import '../widgets/ai_orb.dart';
import '../widgets/common.dart';
import '../widgets/mic_button.dart';

/// Home: greeting, the animated AI orb, the mic button and quick actions.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onOpenChat});

  /// Called when a command is issued so the shell can switch to the chat tab.
  final VoidCallback onOpenChat;

  String get _greeting {
    final int h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  String _stateLabel(AssistantState s) => switch (s) {
        AssistantState.listening => 'LISTENING…',
        AssistantState.thinking => 'THINKING…',
        AssistantState.speaking => 'SPEAKING',
        AssistantState.idle => 'TAP TO SPEAK',
      };

  Color _stateColor(AssistantState s) => switch (s) {
        AssistantState.listening => AppColors.cyan,
        AssistantState.thinking => AppColors.violet,
        AssistantState.speaking => AppColors.pink,
        AssistantState.idle => AppColors.textFaint,
      };

  @override
  Widget build(BuildContext context) {
    final AssistantProvider assistant = context.watch<AssistantProvider>();
    final SettingsProvider settings = context.watch<SettingsProvider>();

    return SafeArea(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // ---- header -----------------------------------------------------
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        _greeting,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.textDim,
                          letterSpacing: 0.4,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const ScreenTitle("Hi, I'm Ajay"),
                      const SizedBox(height: 4),
                      Text(
                        assistant.engine == 'llm'
                            ? 'GPT brain online · speak Hindi or English'
                            : 'On-device brain · speak Hindi or English',
                        style: const TextStyle(fontSize: 12.5, color: AppColors.textFaint),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    gradient: AppColors.primaryGradient,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                        color: AppColors.sky.withOpacity(0.3),
                        blurRadius: 22,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: const Text(
                    'A',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: AppColors.bg0,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 10),

            // ---- the orb ----------------------------------------------------
            Center(
              child: Column(
                children: <Widget>[
                  AiOrb(
                    state: assistant.state,
                    level: assistant.micLevel,
                    size: MediaQuery.of(context).size.width * 0.62,
                  ),
                  const SizedBox(height: 4),
                  AnimatedDefaultTextStyle(
                    duration: const Duration(milliseconds: 300),
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.4,
                      color: _stateColor(assistant.state),
                    ),
                    child: Text(_stateLabel(assistant.state)),
                  ),
                ],
              ),
            ),

            // ---- live transcript --------------------------------------------
            AnimatedSize(
              duration: const Duration(milliseconds: 250),
              child: SizedBox(
                width: double.infinity,
                child: assistant.partialTranscript.isEmpty
                    ? const SizedBox(height: 18)
                    : Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Text(
                          assistant.partialTranscript,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 15, height: 1.45),
                        ).animate().fadeIn(duration: 200.ms),
                      ),
              ),
            ),

            // ---- mic --------------------------------------------------------
            Center(
              child: Column(
                children: <Widget>[
                  MicButton(
                    state: assistant.state,
                    haptics: settings.settings.haptics,
                    onTap: () {
                      assistant.toggleListening();
                      if (assistant.state == AssistantState.thinking) onOpenChat();
                    },
                  ),
                  Text(
                    assistant.isListening ? 'Tap again to stop' : 'Hold a thought — tap to talk',
                    style: const TextStyle(fontSize: 11.5, color: AppColors.textFaint),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 18),

            // ---- quick actions ----------------------------------------------
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                Text('QUICK ACTIONS', style: Theme.of(context).textTheme.labelSmall),
                Text('personalised', style: Theme.of(context).textTheme.labelSmall),
              ],
            ),
            const SizedBox(height: 10),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 2.55,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              children: <Widget>[
                for (int i = 0; i < assistant.suggestions.length; i++)
                  QuickActionCard(
                    suggestion: assistant.suggestions[i],
                    onTap: () {
                      assistant.send(assistant.suggestions[i].command, source: 'quick_action');
                      onOpenChat();
                    },
                  )
                      .animate()
                      .fadeIn(delay: (40 * i).ms, duration: 260.ms)
                      .slideY(begin: 0.15, curve: Curves.easeOutCubic),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
