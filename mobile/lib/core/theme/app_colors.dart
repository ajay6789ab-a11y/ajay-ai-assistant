import 'package:flutter/material.dart';

/// Design tokens — identical values to `backend/app/static/styles.css`
/// so the web demo and the Flutter app are pixel-consistent.
class AppColors {
  const AppColors._();

  // Background layers
  static const Color bg0 = Color(0xFF04050C);
  static const Color bg1 = Color(0xFF080B1A);
  static const Color bg2 = Color(0xFF0D1226);

  // Glass surfaces
  static const Color surface = Color(0x0BFFFFFF);   // white 4.5%
  static const Color surface2 = Color(0x13FFFFFF);  // white 7.5%
  static const Color stroke = Color(0x17FFFFFF);    // white 9%
  static const Color strokeStrong = Color(0x29FFFFFF);

  // Accents
  static const Color cyan = Color(0xFF5EEAD4);
  static const Color sky = Color(0xFF38BDF8);
  static const Color violet = Color(0xFFA78BFA);
  static const Color pink = Color(0xFFF472B6);
  static const Color amber = Color(0xFFFBBF24);
  static const Color danger = Color(0xFFFB7185);
  static const Color ok = Color(0xFF34D399);

  // Text
  static const Color text = Color(0xFFEEF2FF);
  static const Color textDim = Color(0xFF9AA4C4);
  static const Color textFaint = Color(0xFF6B7594);

  /// Primary brand gradient (mic button, active nav, CTA).
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [sky, violet, pink],
    stops: [0.0, 0.55, 1.0],
  );

  /// Subtle glass tint used behind cards and icons.
  static const LinearGradient softGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0x2938BDF8), Color(0x1FA78BFA)],
  );

  /// Screen backdrop: three radial glows over near-black.
  static const RadialGradient backdropTop = RadialGradient(
    center: Alignment(0, -1.1),
    radius: 1.1,
    colors: [Color(0x2E38BDF8), Colors.transparent],
  );
  static const RadialGradient backdropBottom = RadialGradient(
    center: Alignment(1, 1.2),
    radius: 1.0,
    colors: [Color(0x24F472B6), Colors.transparent],
  );

  /// Orb palettes per assistant state.
  static const List<Color> orbIdle = [sky, violet];
  static const List<Color> orbListening = [cyan, sky];
  static const List<Color> orbThinking = [violet, pink];
  static const List<Color> orbSpeaking = [pink, violet];
}
