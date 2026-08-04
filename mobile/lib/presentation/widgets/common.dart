import 'dart:ui';

import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';

/// Frosted-glass container used for every card in the app.
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.radius = AppTheme.radiusMd,
    this.gradient,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Gradient? gradient;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(radius),
            child: Ink(
              decoration: BoxDecoration(
                color: gradient == null ? AppColors.surface : null,
                gradient: gradient,
                borderRadius: BorderRadius.circular(radius),
                border: Border.all(color: AppColors.stroke),
              ),
              child: Padding(padding: padding, child: child),
            ),
          ),
        ),
      ),
    );
  }
}

/// Gradient section title used on every screen header.
class ScreenTitle extends StatelessWidget {
  const ScreenTitle(this.title, {super.key, this.subtitle, this.trailing});

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              ShaderMask(
                shaderCallback: (Rect b) => const LinearGradient(
                  colors: <Color>[Colors.white, Color(0xFF9FD7FF), Color(0xFFD5B6FF)],
                  stops: <double>[0.2, 0.6, 1],
                ).createShader(b),
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.6,
                        color: Colors.white,
                      ),
                ),
              ),
              if (subtitle != null) ...<Widget>[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.textFaint),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// Small status pill, e.g. "GPT" / "on-device".
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, this.color = AppColors.ok});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.stroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: <BoxShadow>[BoxShadow(color: color, blurRadius: 8)],
            ),
          ),
          const SizedBox(width: 7),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.textDim,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

/// Quick-action chip on the home screen.
class QuickActionCard extends StatelessWidget {
  const QuickActionCard({super.key, required this.suggestion, required this.onTap});

  final Suggestion suggestion;
  final VoidCallback onTap;

  static const Map<String, IconData> _icons = <String, IconData>{
    'cloud': Icons.wb_cloudy_rounded,
    'newspaper': Icons.newspaper_rounded,
    'alarm': Icons.alarm_rounded,
    'camera': Icons.photo_camera_rounded,
    'photo': Icons.photo_library_rounded,
    'planner': Icons.event_note_rounded,
    'call': Icons.call_rounded,
    'app': Icons.apps_rounded,
  };

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(
        children: <Widget>[
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              gradient: AppColors.softGradient,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.stroke),
            ),
            child: Icon(
              _icons[suggestion.icon] ?? Icons.bolt_rounded,
              size: 17,
              color: AppColors.cyan,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  suggestion.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 1),
                Text(
                  suggestion.command,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 10.5, color: AppColors.textFaint),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
