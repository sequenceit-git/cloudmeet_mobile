package com.cloudnews.mobile

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class PictureInPictureModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "PictureInPictureModule"
        const val EVENT_PIP_MODE_CHANGED = "onPipModeChanged"

        @Volatile
        var isInMeeting: Boolean = false
            private set

        @Volatile
        var isScreenSharing: Boolean = false
            private set

        @Volatile
        var isScreenSharingStarting: Boolean = false
            private set

        /**
         * PiP is permitted when participant is actively in a meeting
         * AND no screen sharing (local or remote) is active or being prepared.
         */
        fun canEnterPip(): Boolean = isInMeeting && !isScreenSharing && !isScreenSharingStarting

        private var instance: PictureInPictureModule? = null

        fun notifyPipModeChanged(isInPipMode: Boolean) {
            instance?.sendPipEvent(isInPipMode)
        }

        fun enterPipMode(activity: Activity?, width: Int = 9, height: Int = 16): Boolean {
            if (activity == null || activity.isFinishing || activity.isDestroyed) return false
            if (!canEnterPip()) return false
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false

            val pm = activity.packageManager
            if (!pm.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
                return false
            }

            return try {
                val clampedWidth = if (width <= 0) 9 else width
                val clampedHeight = if (height <= 0) 16 else height
                val rational = Rational(clampedWidth, clampedHeight)

                val builder = PictureInPictureParams.Builder()
                    .setAspectRatio(rational)

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    builder.setAutoEnterEnabled(canEnterPip())
                }

                activity.enterPictureInPictureMode(builder.build())
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = MODULE_NAME

    override fun invalidate() {
        super.invalidate()
        if (instance == this) {
            instance = null
        }
    }

    @ReactMethod
    fun enterPictureInPicture(width: Int, height: Int, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Current activity is null")
            return
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.reject("E_NOT_SUPPORTED", "Picture-in-Picture requires Android 8.0 (API 26) or higher")
            return
        }

        val pm = reactApplicationContext.packageManager
        if (!pm.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            promise.reject("E_NOT_SUPPORTED", "Device does not support Picture-in-Picture")
            return
        }

        try {
            activity.runOnUiThread {
                val success = enterPipMode(activity, width, height)
                promise.resolve(success)
            }
        } catch (e: Exception) {
            promise.reject("E_PIP_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun setPipConfig(inMeeting: Boolean, screenSharing: Boolean) {
        isInMeeting = inMeeting
        if (!isScreenSharingStarting) {
            isScreenSharing = screenSharing
        }

        val activity = currentActivity ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                activity.runOnUiThread {
                    if (!activity.isFinishing && !activity.isDestroyed) {
                        val builder = PictureInPictureParams.Builder()
                            .setAspectRatio(Rational(9, 16))
                            .setAutoEnterEnabled(canEnterPip())
                        activity.setPictureInPictureParams(builder.build())
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    @ReactMethod
    fun prepareScreenShare(starting: Boolean) {
        isScreenSharingStarting = starting
        isScreenSharing = starting
        val activity = currentActivity ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                activity.runOnUiThread {
                    if (!activity.isFinishing && !activity.isDestroyed) {
                        val builder = PictureInPictureParams.Builder()
                            .setAspectRatio(Rational(9, 16))
                            .setAutoEnterEnabled(canEnterPip())
                        activity.setPictureInPictureParams(builder.build())
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    @ReactMethod
    fun isPipSupported(promise: Promise) {
        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                reactApplicationContext.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        promise.resolve(supported)
    }

    @ReactMethod
    fun isInPipMode(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val inPip = currentActivity?.isInPictureInPictureMode ?: false
            promise.resolve(inPip)
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun maximize() {
        val activity = currentActivity ?: return
        activity.runOnUiThread {
            try {
                val intent = android.content.Intent(activity, activity.javaClass).apply {
                    flags = android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // Required for React Native event emitter listener registration
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun sendPipEvent(isInPipMode: Boolean) {
        reactApplicationContext.runOnJSQueueThread {
            try {
                val params = Arguments.createMap().apply {
                    putBoolean("isInPictureInPictureMode", isInPipMode)
                }
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_PIP_MODE_CHANGED, params)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
