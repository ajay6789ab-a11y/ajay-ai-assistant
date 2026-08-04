# Flutter / plugin keep rules for release builds.

-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.embedding.** { *; }

# speech_to_text + platform recogniser
-keep class android.speech.** { *; }

# flutter_tts
-keep class android.speech.tts.** { *; }

# flutter_local_notifications (uses reflection for scheduled callbacks)
-keep class com.dexterous.** { *; }
-keepattributes *Annotation*

# Gson/JSON models used by plugins
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Keep line numbers for readable crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
