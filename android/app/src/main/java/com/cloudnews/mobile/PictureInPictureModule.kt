package com.cloudnews.mobile

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Android Picture-in-Picture for an active meeting.
 *
 * Enter once, from the activity leave hint. Do not update PictureInPictureParams
 * or the React tree while the window is opening — Samsung cancels PiP when either
 * happens, and the meeting looks paused with the full controls crammed into the bubble.
 *
 * Meeting chrome is marked nativeID="meeting-chrome" and hidden on the UI thread
 * inside the mode-changed callback, before the next draw.
 */
class PictureInPictureModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "PictureInPictureModule"
        const val EVENT_PIP_MODE_CHANGED = "onPipModeChanged"
        private const val TAG = "PiP-Module"
        private const val CHROME_ID = "meeting-chrome"

        @Volatile
        var isInMeeting: Boolean = false
            private set

        @Volatile
        var isScreenSharing: Boolean = false
            private set

        @Volatile
        var isScreenSharingStarting: Boolean = false
            private set

        @Volatile
        private var entering: Boolean = false

        private var instance: PictureInPictureModule? = null
        private val mainHandler = Handler(Looper.getMainLooper())

        fun canEnterPip(): Boolean = isInMeeting && !isScreenSharing && !isScreenSharingStarting

        fun suppressChrome(activity: Activity?) {
            if (activity == null || activity.isFinishing || activity.isDestroyed) return
            activity.runOnUiThread { setChromeHidden(activity, true) }
        }

        fun onModeChanged(activity: Activity, inPip: Boolean) {
            if (inPip) {
                entering = false
                setChromeHidden(activity, true)
                scheduleChromeHidePulse(activity)
                instance?.emit(true)
                return
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode) {
                setChromeHidden(activity, true)
                return
            }
            mainHandler.postDelayed({
                if (activity.isFinishing || activity.isDestroyed) return@postDelayed
                val still = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode
                if (still) {
                    setChromeHidden(activity, true)
                    return@postDelayed
                }
                setChromeHidden(activity, false)
                instance?.emit(false)
            }, 350)
        }

        fun enterPipMode(activity: Activity?, width: Int = 9, height: Int = 16): Boolean {
            if (activity == null || activity.isFinishing || activity.isDestroyed) return false
            if (!canEnterPip()) {
                Log.d(TAG, "enter skipped: not in a meeting, or screen share is active")
                return false
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
            if (entering || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode)) {
                return true
            }
            if (!activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
                return false
            }

            return try {
                entering = true
                setChromeHidden(activity, true)
                val ratioW = if (width <= 0) 9 else width
                val ratioH = if (height <= 0) 16 else height
                val builder = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(ratioW, ratioH))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    builder.setAutoEnterEnabled(false)
                    builder.setSeamlessResizeEnabled(true)
                }
                val entered = activity.enterPictureInPictureMode(builder.build())
                Log.d(TAG, "enter result=$entered")
                if (!entered) entering = false
                entered
            } catch (e: Exception) {
                entering = false
                Log.e(TAG, "enter failed", e)
                false
            }
        }

        fun applyPipParams(activity: Activity?) {
            if (activity == null || activity.isFinishing || activity.isDestroyed) return
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val inPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode
            if (inPip || entering) return

            try {
                activity.requestedOrientation = if (isInMeeting) {
                    ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                } else {
                    ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                }
            } catch (e: Exception) {
                Log.w(TAG, "orientation: ${e.message}")
            }

            if (!canEnterPip()) return
            try {
                val builder = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(9, 16))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    builder.setAutoEnterEnabled(false)
                    builder.setSeamlessResizeEnabled(true)
                }
                activity.setPictureInPictureParams(builder.build())
            } catch (e: Exception) {
                Log.w(TAG, "setPictureInPictureParams: ${e.message}")
            }
        }

        private fun scheduleChromeHidePulse(activity: Activity) {
            val delays = longArrayOf(0L, 80L, 200L, 400L, 800L, 1600L)
            for (delay in delays) {
                mainHandler.postDelayed({
                    if (activity.isFinishing || activity.isDestroyed) return@postDelayed
                    val inPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode
                    if (inPip || entering) {
                        setChromeHidden(activity, true)
                    }
                }, delay)
            }
        }

        private fun setChromeHidden(activity: Activity, hidden: Boolean) {
            val root = activity.window?.decorView ?: return
            walk(root, hidden)
        }

        private fun walk(view: View, hidden: Boolean) {
            val tag = view.getTag(com.facebook.react.R.id.view_tag_native_id) as? String
            if (tag != null && (tag == CHROME_ID || tag.startsWith("$CHROME_ID-"))) {
                view.visibility = if (hidden) View.GONE else View.VISIBLE
            }
            if (view is ViewGroup) {
                for (i in 0 until view.childCount) {
                    walk(view.getChildAt(i), hidden)
                }
            }
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = MODULE_NAME

    override fun invalidate() {
        super.invalidate()
        if (instance == this) instance = null
    }

    @ReactMethod
    fun enterPictureInPicture(width: Int, height: Int, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Current activity is null")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.reject("E_NOT_SUPPORTED", "Picture-in-Picture requires Android 8.0 or higher")
            return
        }
        activity.runOnUiThread {
            promise.resolve(enterPipMode(activity, width, height))
        }
    }

    @ReactMethod
    fun setPipConfig(inMeeting: Boolean, screenSharing: Boolean) {
        isInMeeting = inMeeting
        if (!isScreenSharingStarting) isScreenSharing = screenSharing
        val activity = currentActivity ?: return
        activity.runOnUiThread { applyPipParams(activity) }
    }

    @ReactMethod
    fun prepareScreenShare(starting: Boolean) {
        isScreenSharingStarting = starting
        isScreenSharing = starting
        val activity = currentActivity ?: return
        activity.runOnUiThread { applyPipParams(activity) }
    }

    @ReactMethod
    fun isPipSupported(promise: Promise) {
        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            reactApplicationContext.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        promise.resolve(supported)
    }

    @ReactMethod
    fun isInPipMode(promise: Promise) {
        val inPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
            (currentActivity?.isInPictureInPictureMode == true)
        promise.resolve(inPip)
    }

    @ReactMethod
    fun suppressMeetingChrome() {
        val activity = currentActivity ?: return
        suppressChrome(activity)
    }

    @ReactMethod
    fun maximize() {
        val activity = currentActivity ?: return
        activity.runOnUiThread {
            try {
                val intent = android.content.Intent(activity, activity.javaClass).apply {
                    flags = android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                Log.w(TAG, "maximize: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun emit(inPip: Boolean) {
        reactApplicationContext.runOnJSQueueThread {
            try {
                val params = Arguments.createMap().apply {
                    putBoolean("isInPictureInPictureMode", inPip)
                }
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_PIP_MODE_CHANGED, params)
            } catch (e: Exception) {
                Log.w(TAG, "emit: ${e.message}")
            }
        }
    }
}
