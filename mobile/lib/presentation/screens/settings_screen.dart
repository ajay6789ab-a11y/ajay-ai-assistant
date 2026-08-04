import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/app_config.dart';
import '../../core/theme/app_colors.dart';
import '../../providers/assistant_provider.dart';
import '../../providers/settings_provider.dart';
import '../../services/tts_service.dart';
import '../widgets/common.dart';

/// Settings: voice, language, privacy, memory and the danger zone.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final SettingsProvider provider = context.watch<SettingsProvider>();
    final s = provider.settings;

    return SafeArea(
      child: ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: <Widget>[
          const ScreenTitle('Settings', subtitle: 'Voice, language & privacy'),
          const SizedBox(height: 18),

          // ---------------------------------------------------------- voice --
          _label(context, 'Voice & language'),
          _row(
            title: 'Assistant voice',
            subtitle: 'Used for every spoken reply',
            trailing: _dropdown(
              value: s.voice,
              items: <DropdownMenuItem<String>>[
                for (final Map<String, dynamic> v in provider.voices)
                  DropdownMenuItem<String>(
                    value: '${v['id']}',
                    child: Text('${v['label']}', overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (String? id) async {
                if (id == null) return;
                await provider.update(<String, dynamic>{'voice': id});
                await context.read<TtsService>().speak(
                      'Hello, this is my voice.',
                      settings: provider.settings,
                    );
              },
            ),
          ),
          _row(
            title: 'Language',
            subtitle: 'Auto detects Hindi & English',
            trailing: _dropdown(
              value: s.language,
              items: <DropdownMenuItem<String>>[
                for (final Map<String, dynamic> l in provider.languages)
                  DropdownMenuItem<String>(
                    value: '${l['id']}',
                    child: Text('${l['label']}', overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (String? id) async {
                if (id == null) return;
                await provider.update(<String, dynamic>{'language': id});
                context.read<AssistantProvider>().settings = provider.settings;
              },
            ),
          ),
          _row(
            title: 'Speech rate',
            subtitle: '${s.speechRate.toStringAsFixed(2)}×',
            trailing: SizedBox(
              width: 130,
              child: Slider(
                value: s.speechRate.clamp(0.2, 1.0),
                min: 0.2,
                max: 1.0,
                onChanged: (double v) => provider.update(<String, dynamic>{'speech_rate': v}),
              ),
            ),
          ),
          _row(
            title: 'Pitch',
            subtitle: s.pitch.toStringAsFixed(2),
            trailing: SizedBox(
              width: 130,
              child: Slider(
                value: s.pitch.clamp(0.5, 2.0),
                min: 0.5,
                max: 2.0,
                onChanged: (double v) => provider.update(<String, dynamic>{'pitch': v}),
              ),
            ),
          ),
          _switchRow(
            title: 'Speak replies aloud',
            subtitle: 'Text-to-speech on every answer',
            value: s.autoSpeakReplies,
            onChanged: (bool v) => provider.update(<String, dynamic>{'auto_speak_replies': v}),
          ),
          _switchRow(
            title: 'Wake word',
            subtitle: '“${AppConfig.wakeWord}” — uses more battery',
            value: s.wakeWordEnabled,
            onChanged: (bool v) => provider.update(<String, dynamic>{'wake_word_enabled': v}),
          ),

          const SizedBox(height: 18),

          // -------------------------------------------------------- privacy --
          _label(context, 'Security & privacy'),
          _switchRow(
            title: 'Confirm before calling',
            subtitle: 'Always ask before dialling a number',
            value: s.confirmCalls,
            onChanged: (bool v) => provider.update(<String, dynamic>{'confirm_calls': v}),
          ),
          _switchRow(
            title: 'Confirm before messaging',
            subtitle: 'Review the text before it is sent',
            value: s.confirmMessages,
            onChanged: (bool v) => provider.update(<String, dynamic>{'confirm_messages': v}),
          ),
          _switchRow(
            title: 'Save command history',
            subtitle: 'Keep a searchable log on this device',
            value: s.saveHistory,
            onChanged: (bool v) => provider.update(<String, dynamic>{'save_history': v}),
          ),
          _switchRow(
            title: 'Personalised memory',
            subtitle: 'Learn preferences & frequent contacts',
            value: s.personalisedMemory,
            onChanged: (bool v) => provider.update(<String, dynamic>{'personalised_memory': v}),
          ),

          const SizedBox(height: 18),

          // --------------------------------------------------------- memory --
          _label(context, 'What Ajay remembers'),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (provider.memories.isEmpty)
                  const Text(
                    'Nothing learned yet — say “my name is …” or “I live in Delhi”.',
                    style: TextStyle(fontSize: 12, color: AppColors.textFaint),
                  )
                else
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: <Widget>[
                      for (final Map<String, dynamic> m in provider.memories.take(12))
                        _memChip('${m['key']}'.replaceAll('_', ' '), '${m['value']}'),
                    ],
                  ),
                const SizedBox(height: 12),
                _dangerButton(
                  'Erase all memories',
                  () async {
                    await provider.wipeMemory();
                    _toast(context, 'All memories erased.');
                  },
                ),
              ],
            ),
          ),

          const SizedBox(height: 18),

          // ---------------------------------------------------- danger zone --
          _label(context, 'Danger zone'),
          _dangerButton('Clear command history', () async {
            await provider.clearHistory();
            _toast(context, 'History cleared.');
          }),
          const SizedBox(height: 8),
          _dangerButton('Delete account & all data', () async {
            final bool ok = await _confirm(context);
            if (!ok) return;
            await provider.deleteAccount();
            _toast(context, 'Account deleted.');
          }),

          const SizedBox(height: 18),
          Center(
            child: Text(
              '${AppConfig.appName} v${AppConfig.version} · '
              '${context.watch<AssistantProvider>().engine} engine',
              style: const TextStyle(fontSize: 11, color: AppColors.textFaint),
            ),
          ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------- helpers --
  Widget _label(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 10),
        child: Text(text.toUpperCase(), style: Theme.of(context).textTheme.labelSmall),
      );

  Widget _row({required String title, String? subtitle, required Widget trailing}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: GlassCard(
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(title,
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                    if (subtitle != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(subtitle,
                            style: const TextStyle(fontSize: 11, color: AppColors.textFaint)),
                      ),
                  ],
                ),
              ),
              trailing,
            ],
          ),
        ),
      );

  Widget _switchRow({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) =>
      _row(
        title: title,
        subtitle: subtitle,
        trailing: Switch(value: value, onChanged: onChanged),
      );

  Widget _dropdown({
    required String value,
    required List<DropdownMenuItem<String>> items,
    required ValueChanged<String?> onChanged,
  }) =>
      ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 150),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: items.any((i) => i.value == value) ? value : null,
            isDense: true,
            isExpanded: true,
            dropdownColor: AppColors.bg2,
            borderRadius: BorderRadius.circular(12),
            style: const TextStyle(fontSize: 12.5, color: AppColors.text),
            icon: const Icon(Icons.expand_more_rounded, size: 18, color: AppColors.textDim),
            items: items,
            onChanged: onChanged,
          ),
        ),
      );

  Widget _memChip(String k, String v) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.cyan.withOpacity(0.1),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.cyan.withOpacity(0.25)),
        ),
        child: Text('$k: $v',
            style: const TextStyle(fontSize: 11.5, color: Color(0xFFA7F3D0))),
      );

  Widget _dangerButton(String label, VoidCallback onTap) => SizedBox(
        width: double.infinity,
        child: TextButton(
          onPressed: onTap,
          style: TextButton.styleFrom(
            backgroundColor: AppColors.danger.withOpacity(0.1),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
              side: BorderSide(color: AppColors.danger.withOpacity(0.32)),
            ),
          ),
          child: Text(label,
              style: const TextStyle(
                  color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 13)),
        ),
      );

  void _toast(BuildContext context, String message) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

  Future<bool> _confirm(BuildContext context) async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        backgroundColor: AppColors.bg2,
        title: const Text('Delete everything?'),
        content: const Text(
          'Your account, conversations, history, notes and memories will be '
          'permanently erased from this device and the server.',
          style: TextStyle(fontSize: 13, color: AppColors.textDim),
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    return ok ?? false;
  }
}
