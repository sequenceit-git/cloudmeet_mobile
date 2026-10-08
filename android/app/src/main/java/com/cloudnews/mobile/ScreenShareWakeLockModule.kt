package com.cloudnews.mobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScreenShareWakeLockModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var wakeLock: PowerManager.WakeLock? = null
    private var partialWakeLock: PowerManager.WakeLock? = null

    override fun getName(): String = "ScreenShareWakeLock"

    @ReactMethod
    fun acquireWakeLock() {
        currentActivity?.runOnUiThread {
            currentActivity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        try {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            if (wakeLock == null && powerManager != null) {
                @Suppress("DEPRECATION")
                wakeLock = powerManager.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                    "CloudNews:ScreenShareWakeLock"
                )
                wakeLock?.setReferenceCounted(false)
            }
            if (wakeLock?.isHeld != true) {
                wakeLock?.acquire(4 * 60 * 60 * 1000L) // 4 hours safe maximum duration
            }

            if (partialWakeLock == null && powerManager != null) {
                partialWakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "CloudNews:ScreenSharePartialWakeLock"
                )
                partialWakeLock?.setReferenceCounted(false)
            }
            if (partialWakeLock?.isHeld != true) {
                partialWakeLock?.acquire(4 * 60 * 60 * 1000L)
            }

            // Update foreground service notification to Zoom-style screen sharing notification
            MeetingForegroundService.startService(
                reactApplicationContext,
                "云讯 / CloudNews",
                "正在共享屏幕 · 屏幕共享进行中 / Screen sharing is active"
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun requestOverlayPermission() {
        // Safe no-op: native MediaProjection directly captures screen without redirecting to system settings
    }

    @ReactMethod
    fun releaseWakeLock() {
        android.util.Log.i("ScreenCapture-Diag", "[WakeLock] ScreenShareWakeLockModule.releaseWakeLock() - releasing wake locks and restoring meeting notification")
        try {
            currentActivity?.runOnUiThread {
                try {
                    currentActivity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } catch (e: Exception) {
                    // Ignore window flags cleanup if activity is tearing down
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        try {
            if (partialWakeLock?.isHeld == true) {
                partialWakeLock?.release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        try {
            // Restore default meeting foreground notification
            MeetingForegroundService.startService(
                reactApplicationContext,
                "云讯会议 / CloudNews Meeting",
                "通话中 · 麦克风与音频已保持开启 / Meeting active · Mic & audio running"
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun stopScreenShare() {
        android.util.Log.i("ScreenCapture-Diag", "[WakeLock] ScreenShareWakeLockModule.stopScreenShare() - releasing wake lock only")
        releaseWakeLock()
    }

    @ReactMethod
    fun startMeetingForeground(title: String?, subtitle: String?) {
        MeetingForegroundService.startService(reactApplicationContext, title, subtitle)
    }

    @ReactMethod
    fun stopMeetingForeground() {
        MeetingForegroundService.stopService(reactApplicationContext)
    }
}
