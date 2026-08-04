import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/models.dart';
import '../../providers/assistant_provider.dart';
import '../../providers/history_provider.dart';
import '../widgets/common.dart';

/// History: searchable log of every command with quick stats and re-run.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.onRerun});

  final VoidCallback onRerun;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<HistoryProvider>().load());
  }

  static const Map<String, IconData> _intentIcons = <String, IconData>{
    'call': Icons.call_rounded,
    'message': Icons.sms_rounded,
    'open_app': Icons.apps_rounded,
    'web_search': Icons.search_rounded,
    'youtube_search': Icons.play_circle_fill_rounded,
    'alarm': Icons.alarm_rounded,
    'timer': Icons.timer_rounded,
    'camera': Icons.photo_camera_rounded,
    'gallery': Icons.photo_library_rounded,
    'reminder': Icons.notifications_active_rounded,
    'task': Icons.checklist_rounded,
    'note': Icons.edit_note_rounded,
    'weather': Icons.wb_cloudy_rounded,
    'news': Icons.newspaper_rounded,
    'translate': Icons.translate_rounded,
    'calculate': Icons.calculate_rounded,
    'navigate': Icons.navigation_rounded,
    'settings': Icons.settings_rounded,
  };

  @override
  Widget build(BuildContext context) {
    final HistoryProvider history = context.watch<HistoryProvider>();

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: ScreenTitle('History', subtitle: 'Every command, searchable'),
          ),

          // ---- search --------------------------------------------------------
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: TextField(
              onChanged: history.search,
              style: const TextStyle(fontSize: 13.5),
              decoration: const InputDecoration(
                hintText: 'Search commands…',
                prefixIcon: Icon(Icons.search_rounded, size: 19, color: AppColors.textFaint),
              ),
            ),
          ),
          const SizedBox(height: 14),

          // ---- stats ---------------------------------------------------------
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: <Widget>[
                _stat('${history.total}', 'commands'),
                const SizedBox(width: 8),
                _stat(history.topIntent, 'top intent'),
                const SizedBox(width: 8),
                _stat('${history.voiceCount}', 'by voice'),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ---- list ----------------------------------------------------------
          Expanded(
            child: history.items.isEmpty
                ? Center(
                    child: Text(
                      history.query.isEmpty
                          ? 'Your commands will appear here.'
                          : 'No matching commands.',
                      style: const TextStyle(color: AppColors.textFaint, fontSize: 13),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: history.load,
                    backgroundColor: AppColors.bg2,
                    color: AppColors.cyan,
                    child: ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(
                        parent: BouncingScrollPhysics(),
                      ),
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                      itemCount: history.items.length,
                      itemBuilder: (BuildContext context, int i) {
                        final HistoryItem item = history.items[i];
                        return Dismissible(
                          key: ValueKey<String>(item.id),
                          direction: DismissDirection.endToStart,
                          background: Container(
                            alignment: Alignment.centerRight,
                            padding: const EdgeInsets.only(right: 20, bottom: 9),
                            child: const Icon(Icons.delete_outline_rounded,
                                color: AppColors.danger),
                          ),
                          onDismissed: (_) => history.delete(item),
                          child: _tile(context, item, i),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _stat(String value, String label) => Expanded(
        child: GlassCard(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
              ),
              Text(
                label.toUpperCase(),
                style: const TextStyle(
                  fontSize: 9.5,
                  letterSpacing: 1,
                  color: AppColors.textFaint,
                ),
              ),
            ],
          ),
        ),
      );

  Widget _tile(BuildContext context, HistoryItem item, int index) => Padding(
        padding: const EdgeInsets.only(bottom: 9),
        child: GlassCard(
          onTap: () {
            context.read<AssistantProvider>().send(item.command, source: 'text');
            widget.onRerun();
          },
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  gradient: AppColors.softGradient,
                  borderRadius: BorderRadius.circular(11),
                  border: Border.all(color: AppColors.stroke),
                ),
                child: Icon(
                  _intentIcons[item.intent] ?? Icons.bolt_rounded,
                  size: 17,
                  color: AppColors.cyan,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      item.command,
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                    ),
                    if (item.reply.isNotEmpty) ...<Widget>[
                      const SizedBox(height: 3),
                      Text(
                        item.reply,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11.5, color: AppColors.textDim),
                      ),
                    ],
                    const SizedBox(height: 5),
                    Text(
                      '${DateFormat('dd MMM · HH:mm').format(item.createdAt)} · ${item.source}',
                      style: const TextStyle(
                        fontSize: 10,
                        color: AppColors.textFaint,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.violet.withOpacity(0.16),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppColors.violet.withOpacity(0.25)),
                ),
                child: Text(
                  item.intent.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.7,
                    color: Color(0xFFC4B5FD),
                  ),
                ),
              ),
            ],
          ),
        ),
      ).animate().fadeIn(delay: (index * 22).ms, duration: 240.ms).slideX(begin: 0.05);
}
