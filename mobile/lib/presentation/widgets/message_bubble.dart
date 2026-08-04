import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/models.dart';
import 'common.dart';

/// A single chat row: avatar, bubble, optional rich card, and metadata.
class MessageBubble extends StatelessWidget {
  const MessageBubble({super.key, required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final bool me = message.isUser;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: me ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: <Widget>[
          if (!me) _avatar(me),
          if (!me) const SizedBox(width: 9),
          Flexible(
            child: Column(
              crossAxisAlignment: me ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  constraints: const BoxConstraints(maxWidth: 280),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  decoration: BoxDecoration(
                    gradient: me
                        ? LinearGradient(colors: <Color>[
                            AppColors.sky.withOpacity(0.22),
                            AppColors.violet.withOpacity(0.22),
                          ])
                        : null,
                    color: me ? null : AppColors.surface,
                    border: Border.all(
                      color: me ? AppColors.violet.withOpacity(0.3) : AppColors.stroke,
                    ),
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: Radius.circular(me ? 18 : 6),
                      bottomRight: Radius.circular(me ? 6 : 18),
                    ),
                  ),
                  child: Text(
                    message.content,
                    style: const TextStyle(fontSize: 14, height: 1.5, color: AppColors.text),
                  ),
                ),
                if (message.data.isNotEmpty) _RichResultCard(data: message.data),
                if (message.action != null && message.action!.type != ActionType.speakOnly)
                  _actionChip(message.action!),
                if (message.confidence != null) _meta(),
              ],
            ),
          ),
          if (me) const SizedBox(width: 9),
          if (me) _avatar(me),
        ],
      ),
    ).animate().fadeIn(duration: 260.ms).slideY(begin: 0.12, curve: Curves.easeOutCubic);
  }

  Widget _avatar(bool me) => Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: me ? null : AppColors.primaryGradient,
          color: me ? AppColors.surface2 : null,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Text(
          me ? 'You'.substring(0, 1) : 'A',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: me ? AppColors.textDim : AppColors.bg0,
          ),
        ),
      );

  Widget _actionChip(AssistantAction action) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.cyan.withOpacity(0.12),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: AppColors.cyan.withOpacity(0.35)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(Icons.bolt_rounded, size: 13, color: AppColors.cyan),
              const SizedBox(width: 5),
              Text(
                action.type.name.toUpperCase(),
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                  color: AppColors.cyan,
                ),
              ),
            ],
          ),
        ),
      );

  Widget _meta() => Padding(
        padding: const EdgeInsets.only(top: 5),
        child: Text(
          '${message.intent} · ${((message.confidence ?? 0) * 100).round()}% · '
          '${message.language.toUpperCase()} · ${message.engine ?? 'rules'}',
          style: const TextStyle(fontSize: 10, color: AppColors.textFaint, letterSpacing: 0.4),
        ),
      );
}

/// Weather / news / calculator / translation results rendered inline.
class _RichResultCard extends StatelessWidget {
  const _RichResultCard({required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic>? weather = _ok('weather');
    if (weather != null) return _weather(weather);

    final Map<String, dynamic>? news = _ok('news');
    if (news != null) return _news(news);

    final Map<String, dynamic>? calc = _ok('calculator');
    if (calc != null) {
      return _wrap('Calculator', '${calc['result']}', '${calc['expression']}');
    }

    final Map<String, dynamic>? tr = _ok('translate');
    if (tr != null) {
      return _wrap('Translation · ${tr['target']}', '${tr['translated']}', '${tr['original']}');
    }
    return const SizedBox.shrink();
  }

  Map<String, dynamic>? _ok(String key) {
    final dynamic v = data[key];
    if (v is Map && v['ok'] == true) return Map<String, dynamic>.from(v);
    return null;
  }

  Widget _wrap(String label, String big, String small) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: GlassCard(
          gradient: AppColors.softGradient,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(label.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 10,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textFaint)),
              const SizedBox(height: 6),
              Text(big,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, height: 1.2)),
              const SizedBox(height: 2),
              Text(small, style: const TextStyle(fontSize: 12, color: AppColors.textDim)),
            ],
          ),
        ),
      );

  Widget _weather(Map<String, dynamic> w) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: GlassCard(
          gradient: AppColors.softGradient,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('WEATHER · ${w['city']}'.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 10,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textFaint)),
              const SizedBox(height: 8),
              Row(
                children: <Widget>[
                  Text('${w['icon'] ?? '🌤'}', style: const TextStyle(fontSize: 30)),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text('${w['temp_c']}°',
                          style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700)),
                      Text('${w['description']} · feels ${w['feels_like_c']}°',
                          style: const TextStyle(fontSize: 12, color: AppColors.textDim)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: <Widget>[
                  for (final dynamic d in (w['forecast'] as List? ?? const []).take(3))
                    Expanded(
                      child: Container(
                        margin: const EdgeInsets.only(right: 6),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.22),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          children: <Widget>[
                            Text('${d['date']}'.substring(5),
                                style: const TextStyle(fontSize: 10, color: AppColors.textFaint)),
                            const SizedBox(height: 3),
                            Text('${d['icon']} ${d['max']}°',
                                style: const TextStyle(
                                    fontSize: 13, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      );

  Widget _news(Map<String, dynamic> n) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: GlassCard(
          gradient: AppColors.softGradient,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('TOP HEADLINES · ${n['topic']}'.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 10,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textFaint)),
              const SizedBox(height: 4),
              for (final dynamic a in (n['articles'] as List? ?? const []).take(4))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Icon(Icons.circle, size: 6, color: AppColors.sky),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text('${a['title']}',
                                style: const TextStyle(fontSize: 12.5, height: 1.35)),
                            Text('${a['source']}',
                                style: const TextStyle(
                                    fontSize: 10.5, color: AppColors.textFaint)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
}
