package com.ajay.assistant

import android.os.Bundle
import androidx.core.view.WindowCompat
import io.flutter.embedding.android.FlutterActivity

/**
 * Single-activity host for the Flutter UI.
 *
 * Enables edge-to-edge drawing so the app's dark gradient runs behind the
 * status and navigation bars (part of the futuristic look).
 */
class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        super.onCreate(savedInstanceState)
    }
}
