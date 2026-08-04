import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// The single source of truth for the app's dark, futuristic look.
class AppTheme {
  const AppTheme._();

  static const double radiusSm = 12;
  static const double radiusMd = 18;
  static const double radiusLg = 26;
  static const double radiusXl = 34;

  static ThemeData get dark {
    final TextTheme base = GoogleFonts.interTextTheme(ThemeData.dark().textTheme);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.bg0,
      splashFactory: InkSparkle.splashFactory,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.sky,
        secondary: AppColors.violet,
        tertiary: AppColors.pink,
        surface: AppColors.bg1,
        error: AppColors.danger,
        onPrimary: AppColors.bg0,
        onSurface: AppColors.text,
      ),
      textTheme: base.apply(
        bodyColor: AppColors.text,
        displayColor: AppColors.text,
      ).copyWith(
        displaySmall: base.displaySmall?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -1,
        ),
        titleLarge: base.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
        bodyMedium: base.bodyMedium?.copyWith(height: 1.5),
        labelSmall: base.labelSmall?.copyWith(
          color: AppColors.textFaint,
          letterSpacing: 1.4,
          fontWeight: FontWeight.w700,
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          systemNavigationBarColor: AppColors.bg0,
        ),
      ),
      cardTheme: CardTheme(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          side: const BorderSide(color: AppColors.stroke),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        hintStyle: const TextStyle(color: AppColors.textFaint, fontSize: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(999),
          borderSide: const BorderSide(color: AppColors.stroke),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(999),
          borderSide: const BorderSide(color: AppColors.stroke),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(999),
          borderSide: const BorderSide(color: AppColors.cyan, width: 1.4),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? Colors.white : const Color(0xFFCBD5E1),
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.violet.withOpacity(0.85)
              : Colors.white.withOpacity(0.12),
        ),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: AppColors.sky,
        inactiveTrackColor: Colors.white.withOpacity(0.14),
        thumbColor: AppColors.cyan,
        overlayColor: AppColors.cyan.withOpacity(0.12),
        trackHeight: 4,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.bg2,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(radiusXl)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.bg2,
        contentTextStyle: const TextStyle(color: AppColors.text, fontSize: 13),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: ZoomPageTransitionsBuilder(),
        },
      ),
    );
  }

  /// Full-screen backdrop used by every screen (aurora + radial glows).
  static BoxDecoration get backdrop => const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.bg1, AppColors.bg0],
        ),
      );

  /// Glassmorphism container decoration.
  static BoxDecoration glass({double radius = radiusMd, Color? tint}) => BoxDecoration(
        color: tint ?? AppColors.surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: AppColors.stroke),
      );
}
