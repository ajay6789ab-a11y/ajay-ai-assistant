import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/config/app_config.dart';
import '../../core/theme/app_colors.dart';

/// Boot screen shown while services initialise (STT, TTS, DB, session).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key, this.status = 'Waking up…'});

  final String status;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: <Color>[Color(0xFF070A16), AppColors.bg0],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Container(
                width: 92,
                height: 92,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: AppColors.primaryGradient,
                  borderRadius: BorderRadius.circular(30),
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      color: AppColors.sky.withOpacity(0.4),
                      blurRadius: 60,
                      offset: const Offset(0, 20),
                    ),
                  ],
                ),
                child: const Text(
                  'A',
                  style: TextStyle(
                    fontSize: 38,
                    fontWeight: FontWeight.w800,
                    color: AppColors.bg0,
                  ),
                ),
              )
                  .animate(onPlay: (AnimationController c) => c.repeat(reverse: true))
                  .moveY(begin: 0, end: -9, duration: 1200.ms, curve: Curves.easeInOut),
              const SizedBox(height: 20),
              Text(
                AppConfig.appName,
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              const Text(
                'YOUR VOICE. YOUR PHONE.',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 2.4,
                  color: AppColors.textFaint,
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: 128,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: const LinearProgressIndicator(
                    minHeight: 3,
                    backgroundColor: Color(0x1AFFFFFF),
                    valueColor: AlwaysStoppedAnimation<Color>(AppColors.sky),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                status,
                style: const TextStyle(fontSize: 11.5, color: AppColors.textFaint),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
