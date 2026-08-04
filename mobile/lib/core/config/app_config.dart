/// Global, compile-time configuration for the app.
///
/// Override the backend URL without touching code:
///   flutter run --dart-define=API_BASE_URL=https://api.yourdomain.com
library;

class AppConfig {
  const AppConfig._();

  static const String appName = 'Ajay AI Assistant';
  static const String version = '1.0.0';

  /// Backend base URL.
  ///
  /// * `10.0.2.2` is the host machine as seen from the Android emulator.
  /// * On a physical device use your LAN IP, e.g. http://192.168.1.5:8000
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  /// Wake word (optional, off by default to save battery).
  static const String wakeWord = 'hey ajay';

  /// Request timeouts.
  static const Duration httpTimeout = Duration(seconds: 25);
  static const Duration listenTimeout = Duration(seconds: 12);
  static const Duration pauseTimeout = Duration(seconds: 3);

  /// Locales supported by the speech engine.
  static const String localeEnglish = 'en_IN';
  static const String localeHindi = 'hi_IN';

  /// How many conversation turns are kept on the device.
  static const int localHistoryLimit = 500;
}
