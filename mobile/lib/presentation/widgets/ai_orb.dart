import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../providers/assistant_provider.dart';

/// The animated AI voice orb — the visual signature of the app.
///
/// Four moods, each with its own palette and motion:
///   idle      → slow breathing rings
///   listening → waveform amplitude driven by the live microphone level
///   thinking  → fast orbiting particles
///   speaking  → outward pulses
///
/// Implemented with a single [CustomPainter] and one [AnimationController]
/// (60 fps, no rebuilds of the widget tree, negligible battery impact).
class AiOrb extends StatefulWidget {
  const AiOrb({
    super.key,
    required this.state,
    this.level = 0,
    this.size = 260,
  });

  /// Current assistant state.
  final AssistantState state;

  /// Live microphone loudness, 0..1 (only used while listening).
  final double level;

  final double size;

  @override
  State<AiOrb> createState() => _AiOrbState();
}

class _AiOrbState extends State<AiOrb> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 12),
  )..repeat();

  /// Eased energy value so palette/scale changes never jump.
  double _energy = 0.2;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  double get _targetEnergy => switch (widget.state) {
        AssistantState.listening => 0.35 + widget.level * 0.9,
        AssistantState.thinking => 0.55,
        AssistantState.speaking => 0.6,
        AssistantState.idle => 0.2,
      };

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (BuildContext context, _) {
          _energy += (_targetEnergy - _energy) * 0.09;
          return CustomPaint(
            size: Size.square(widget.size),
            painter: _OrbPainter(
              t: _controller.value * 12,   // seconds
              energy: _energy,
              colors: switch (widget.state) {
                AssistantState.listening => AppColors.orbListening,
                AssistantState.thinking => AppColors.orbThinking,
                AssistantState.speaking => AppColors.orbSpeaking,
                AssistantState.idle => AppColors.orbIdle,
              },
              fast: widget.state == AssistantState.thinking,
              pulsing: widget.state != AssistantState.idle,
            ),
          );
        },
      ),
    );
  }
}

class _OrbPainter extends CustomPainter {
  _OrbPainter({
    required this.t,
    required this.energy,
    required this.colors,
    required this.fast,
    required this.pulsing,
  });

  final double t;
  final double energy;
  final List<Color> colors;
  final bool fast;
  final bool pulsing;

  /// Deterministic particle field (seeded so it never flickers on rebuild).
  static final List<_Particle> _particles = List<_Particle>.generate(46, (int i) {
    final math.Random r = math.Random(i * 7919);
    return _Particle(
      angle: r.nextDouble() * math.pi * 2,
      radius: 60 + r.nextDouble() * 46,
      speed: 0.002 + r.nextDouble() * 0.01,
      size: 0.6 + r.nextDouble() * 1.8,
    );
  });

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = Offset(size.width / 2, size.height / 2);
    final double scale = size.width / 260;
    final double baseR = (52 + energy * 16) * scale;
    final Color c1 = colors[0];
    final Color c2 = colors[1];

    // ---- outer glow -------------------------------------------------------
    canvas.drawCircle(
      c,
      baseR * 2.5,
      Paint()
        ..shader = RadialGradient(
          colors: [
            c1.withOpacity(0.5 + energy * 0.35),
            c2.withOpacity(0.16 + energy * 0.14),
            Colors.transparent,
          ],
          stops: const [0.0, 0.45, 1.0],
        ).createShader(Rect.fromCircle(center: c, radius: baseR * 2.5))
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18),
    );

    // ---- inner sphere -----------------------------------------------------
    canvas.drawCircle(
      c,
      baseR * 0.52,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(-0.35, -0.4),
          colors: [
            Colors.white.withOpacity(0.92),
            c1.withOpacity(0.75),
            c2.withOpacity(0.12),
          ],
          stops: const [0.0, 0.35, 1.0],
        ).createShader(Rect.fromCircle(center: c, radius: baseR)),
    );

    // ---- four concentric waveform rings -----------------------------------
    for (int ring = 0; ring < 4; ring++) {
      final double radius = baseR + (12 + ring * 15) * scale;
      final double amp = (3 + energy * 19) * (1 - ring * 0.14) * scale;
      final double speed = t * (1.1 + ring * 0.32) * (fast ? 2.1 : 1);

      final Path path = Path();
      for (double a = 0; a <= math.pi * 2 + 0.06; a += 0.055) {
        final double wobble = math.sin(a * (3 + ring) + speed) * amp +
            math.sin(a * (7 - ring) - speed * 1.5) * amp * 0.4;
        final double r = radius + wobble;
        final Offset p = c + Offset(math.cos(a) * r, math.sin(a) * r);
        a == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
      }
      path.close();

      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = (ring == 0 ? 2 : 1.2) * scale
          ..color = (ring.isOdd ? c2 : c1)
              .withOpacity((0.4 - ring * 0.07 + energy * 0.22).clamp(0.0, 1.0)),
      );
    }

    // ---- orbiting particles ------------------------------------------------
    final Paint dot = Paint()..color = c1.withOpacity(0.25 + energy * 0.5);
    for (final _Particle p in _particles) {
      final double angle = p.angle + t * p.speed * (fast ? 340 : 120);
      final double rr = (p.radius + math.sin(t * 1.6 + angle * 3) * (4 + energy * 12)) * scale;
      canvas.drawCircle(
        c + Offset(math.cos(angle) * rr, math.sin(angle) * rr * 0.94),
        p.size * (0.7 + energy * 0.9) * scale,
        dot,
      );
    }

    // ---- expanding pulse ---------------------------------------------------
    if (pulsing) {
      final double phase = (t * 0.8) % 1;
      canvas.drawCircle(
        c,
        baseR + phase * 68 * scale,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2 * scale
          ..color = c1.withOpacity(0.34 * (1 - phase)),
      );
    }
  }

  @override
  bool shouldRepaint(_OrbPainter old) =>
      old.t != t || old.energy != energy || old.colors != colors;
}

class _Particle {
  const _Particle({
    required this.angle,
    required this.radius,
    required this.speed,
    required this.size,
  });

  final double angle;
  final double radius;
  final double speed;
  final double size;
}
