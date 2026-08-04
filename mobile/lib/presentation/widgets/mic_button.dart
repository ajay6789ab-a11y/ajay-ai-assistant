import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_colors.dart';
import '../../providers/assistant_provider.dart';

/// The primary voice trigger: a gradient circle with an expanding halo that
/// animates while the assistant is listening.
class MicButton extends StatefulWidget {
  const MicButton({
    super.key,
    required this.state,
    required this.onTap,
    this.haptics = true,
    this.size = 84,
  });

  final AssistantState state;
  final VoidCallback onTap;
  final bool haptics;
  final double size;

  @override
  State<MicButton> createState() => _MicButtonState();
}

class _MicButtonState extends State<MicButton> with SingleTickerProviderStateMixin {
  late final AnimationController _halo = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  );
  bool _pressed = false;

  bool get _listening => widget.state == AssistantState.listening;

  @override
  void didUpdateWidget(covariant MicButton old) {
    super.didUpdateWidget(old);
    _listening ? _halo.repeat() : _halo.stop();
  }

  @override
  void dispose() {
    _halo.dispose();
    super.dispose();
  }

  void _handleTap() {
    if (widget.haptics) HapticFeedback.mediumImpact();
    widget.onTap();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: _handleTap,
      child: SizedBox(
        width: widget.size + 40,
        height: widget.size + 40,
        child: Stack(
          alignment: Alignment.center,
          children: <Widget>[
            // Expanding halo while listening.
            AnimatedBuilder(
              animation: _halo,
              builder: (BuildContext context, _) {
                if (!_listening) return const SizedBox.shrink();
                final double v = _halo.value;
                return Container(
                  width: widget.size * (1 + v * 0.55),
                  height: widget.size * (1 + v * 0.55),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppColors.cyan.withOpacity(0.55 * (1 - v)),
                      width: 2,
                    ),
                  ),
                );
              },
            ),
            AnimatedScale(
              scale: _pressed ? 0.92 : 1,
              duration: const Duration(milliseconds: 140),
              curve: Curves.easeOutBack,
              child: Container(
                width: widget.size,
                height: widget.size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: AppColors.primaryGradient,
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      color: (_listening ? AppColors.cyan : AppColors.sky).withOpacity(0.45),
                      blurRadius: _listening ? 46 : 32,
                      spreadRadius: _listening ? 6 : 0,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                child: Icon(
                  _listening ? Icons.graphic_eq_rounded : Icons.mic_rounded,
                  size: widget.size * 0.42,
                  color: AppColors.bg0,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
