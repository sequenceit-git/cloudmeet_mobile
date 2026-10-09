package com.cloudnews.mobile

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import java.lang.ref.WeakReference

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  companion object {
      private const val TAG = "MainActivity-Diag"

      @Volatile
      private var activeActivityRef: WeakReference<MainActivity>? = null

      fun getActiveActivity(): MainActivity? = activeActivityRef?.get()
  }

  private var userLeaveHintAtMs: Long = 0L

  /**
   * Keep React Native host running smoothly when entering or in Picture-in-Picture mode.
   * By default, React Native suspends JS execution, event delivery, and timers on onHostPause().
   * In PiP, the Activity remains visible on screen, so React host must stay resumed.
   */
  private fun resumeReactHostForPip() {
      try {
          (application as? ReactApplication)?.reactNativeHost?.reactInstanceManager?.let { manager ->
              manager.onHostResume(this, this)
              Log.d(TAG, "[RESUME_REACT_HOST_SUCCESS] React host resumed for PiP")
          }
      } catch (t: Throwable) {
          Log.w(TAG, "[RESUME_REACT_HOST_FAILED] ${t.message}")
      }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    val currentTaskId = taskId
    val instanceId = System.identityHashCode(this)
    val intentAction = intent?.action
    val intentFlags = intent?.flags?.let { Integer.toHexString(it) } ?: "none"

    Log.d(
        TAG,
        "[ON_CREATE] (NEW_ACTIVITY) taskId=$currentTaskId, instance=$instanceId, action=$intentAction, flags=0x$intentFlags, savedInstanceState=${savedInstanceState != null}"
    )

    // Set the theme to AppTheme BEFORE super.onCreate to support
    // coloring the background, status bar, and navigation bar for expo-splash-screen.
    setTheme(R.style.AppTheme)

    // CRITICAL ANDROID LIFECYCLE RULE:
    // super.onCreate MUST ALWAYS be called to satisfy Android's internal mCalled requirement.
    // If super.onCreate is skipped before finish()/return, Android throws SuperNotCalledException
    // resulting in an immediate process crash ("--------- beginning of crash").
    super.onCreate(null)

    // Explicitly guarantee FLAG_SECURE is cleared so that Cloud News
    // app screens, controls, and menus are never blacked out during screen sharing.
    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)

    // Check 1: Classic Android launcher bug where launching from Home/Launcher creates a duplicate activity in same task
    if (!isTaskRoot) {
        val launchIntent = intent
        val action = launchIntent?.action
        if (launchIntent != null && launchIntent.hasCategory(Intent.CATEGORY_LAUNCHER) && Intent.ACTION_MAIN == action) {
            Log.w(
                TAG,
                "[DUPLICATE_PREVENTED_NOT_TASK_ROOT] Finishing duplicate MainActivity instance created by launcher: taskId=$currentTaskId, instance=$instanceId"
            )
            finish()
            return
        }
    }

    // Check 2: Cross-task duplication check (e.g. Activity is in PiP pinned stack and launcher/Recents starts a new MainActivity in standard stack)
    val existingActivity = activeActivityRef?.get()
    if (existingActivity != null && existingActivity != this && !existingActivity.isFinishing && !existingActivity.isDestroyed) {
        val existingTaskId = existingActivity.taskId
        val existingInstanceId = System.identityHashCode(existingActivity)
        val isExistingInPip = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) existingActivity.isInPictureInPictureMode else false

        Log.w(
            TAG,
            "[DUPLICATE_ACTIVITY_DETECTED] A new MainActivity instance ($instanceId in task $currentTaskId) was spawned while active instance ($existingInstanceId in task $existingTaskId, inPip=$isExistingInPip) is alive! Performing task handoff..."
        )

        // 1. Move the existing PiP/meeting task to the front and request fullscreen expansion
        try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            am?.moveTaskToFront(existingTaskId, ActivityManager.MOVE_TASK_WITH_HOME)
            Log.d(TAG, "[TASK_HANDOFF_SUCCESS] moveTaskToFront requested for existing task $existingTaskId")
        } catch (e: Throwable) {
            Log.e(TAG, "[TASK_HANDOFF_ERROR] moveTaskToFront failed: ${e.message}", e)
        }

        // 2. Deliver the incoming intent to the existing activity so deep links or actions are preserved
        val incomingIntent = intent
        if (incomingIntent != null) {
            try {
                existingActivity.runOnUiThread {
                    try {
                        existingActivity.onNewIntent(incomingIntent)
                    } catch (t: Throwable) {
                        Log.w(TAG, "[TASK_HANDOFF_INTENT] onNewIntent dispatch error: ${t.message}")
                    }
                }
            } catch (t: Throwable) {
                Log.w(TAG, "[TASK_HANDOFF_DISPATCH] runOnUiThread error: ${t.message}")
            }
        }

        // 3. Cleanly finish and remove the duplicate temporary task from Recents without touching the active session
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask()
        } else {
            finish()
        }
        return
    }

    // Set this instance as the single active activity
    activeActivityRef = WeakReference(this)
    // Manifest must not lock portrait: a fixed orientation makes Samsung cancel
    // PiP immediately (true then false) and the meeting looks paused.
    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT

    // Ensure PiP auto-enter is strictly disabled until an active meeting begins
    PictureInPictureModule.applyPipParams(this)
  }

  /**
   * Called when an existing singleTask activity receives a new intent
   * (e.g. from launcher, Recent Apps, notifications, or deep links).
   */
  override fun onNewIntent(intent: Intent?) {
      val currentTaskId = taskId
      val instanceId = System.identityHashCode(this)
      val intentAction = intent?.action
      val intentFlags = intent?.flags?.let { Integer.toHexString(it) } ?: "none"
      val inPip = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) isInPictureInPictureMode else false

      Log.d(
          TAG,
          "[ON_NEW_INTENT] (REUSING_EXISTING_ACTIVITY) taskId=$currentTaskId, instance=$instanceId, action=$intentAction, flags=0x$intentFlags, inPip=$inPip"
      )

      super.onNewIntent(intent)
      setIntent(intent)
      // Note: Do NOT call startActivity targeting this from inside onNewIntent!
      // Android is already in the process of delivering the intent and reordering/expanding the window.
  }

  override fun onResume() {
      super.onResume()
      val inPip = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) isInPictureInPictureMode else false
      Log.d(TAG, "[ON_RESUME] taskId=$taskId, instance=${System.identityHashCode(this)}, inPip=$inPip")
  }

  override fun onPause() {
      val inPip = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) isInPictureInPictureMode else false
      val enteringPip = PictureInPictureModule.canEnterPip() && (System.currentTimeMillis() - userLeaveHintAtMs < 3000L)
      Log.d(TAG, "[ON_PAUSE] taskId=$taskId, instance=${System.identityHashCode(this)}, inPip=$inPip, enteringPip=$enteringPip")
      super.onPause()
      if (inPip || enteringPip) {
          // React Native by default pauses JS execution & timers on onHostPause().
          // When entering or in Picture-in-Picture mode, the Activity is still visible to the user.
          // We resume the React host so JS timers (call duration), UI updates, and LiveKit tracks continue running smoothly.
          resumeReactHostForPip()
      }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
   * Called when the user presses Home or leaves the app.
   * On Android 12+ (API 31+), setAutoEnterEnabled(true) manages the PiP transition seamlessly.
   * On Android 8.0 - 11 (< API 31), enterPipMode is called explicitly here.
   */
  override fun onUserLeaveHint() {
      userLeaveHintAtMs = System.currentTimeMillis()
      val alreadyInPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode
      val canPip = PictureInPictureModule.canEnterPip()
      Log.d(
          TAG,
          "[ON_USER_LEAVE_HINT] taskId=$taskId, instance=${System.identityHashCode(this)}, canEnterPip=$canPip, alreadyInPip=$alreadyInPip"
      )
      if (canPip) {
          // Immediately notify JS and native view hierarchy that PiP is entering
          // BEFORE Android animates and snapshots the window for the mini window!
          PictureInPictureModule.suppressChrome(this)
          PictureInPictureModule.onModeChanged(this, true)
          resumeReactHostForPip()
          if (!alreadyInPip && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
              PictureInPictureModule.enterPipMode(this)
          }
      }
      super.onUserLeaveHint()
  }

  /**
   * Notify JS/React Native when Picture-in-Picture mode is entered or exited.
   * Only the 2-arg API 26+ override is used so configuration changes do not
   * emit a duplicate false event that aborts PiP from JS.
   */
  override fun onPictureInPictureModeChanged(
      isInPictureInPictureMode: Boolean,
      newConfig: Configuration
  ) {
      super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
      Log.d(
          TAG,
          "[ON_PIP_MODE_CHANGED] taskId=$taskId, instance=${System.identityHashCode(this)}, isInPictureInPictureMode=$isInPictureInPictureMode"
      )
      if (isInPictureInPictureMode) {
          resumeReactHostForPip()
          window.decorView.post {
              try {
                  window.decorView.requestLayout()
                  window.decorView.invalidate()
              } catch (t: Throwable) {}
          }
      }
      PictureInPictureModule.onModeChanged(this, isInPictureInPictureMode)
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * If meeting is active without screen share, enter PiP instead of closing.
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }

  override fun onDestroy() {
      Log.d(TAG, "[ON_DESTROY] taskId=$taskId, instance=${System.identityHashCode(this)}, isFinishing=$isFinishing")
      if (activeActivityRef?.get() == this) {
          activeActivityRef = null
          try {
              if (isFinishing) {
                  MeetingForegroundService.stopService(this)
              }
          } catch (e: Exception) {
              e.printStackTrace()
          }
      }
      super.onDestroy()
  }
}
