package com.cloudnews.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class MeetingForegroundService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null

    companion object {
        const val CHANNEL_ID = "cloudnews_ongoing_meeting_channel"
        const val NOTIFICATION_ID = 90210
        const val ACTION_START = "com.cloudnews.mobile.ACTION_START_MEETING_SERVICE"
        const val ACTION_STOP = "com.cloudnews.mobile.ACTION_STOP_MEETING_SERVICE"
        const val EXTRA_TITLE = "extra_meeting_title"
        const val EXTRA_SUBTITLE = "extra_meeting_subtitle"

        fun startService(context: Context, title: String? = null, subtitle: String? = null) {
            val intent = Intent(context, MeetingForegroundService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_SUBTITLE, subtitle)
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(context, intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        fun stopService(context: Context) {
            android.util.Log.e("ScreenCapture-Diag", "[SCREEN_CAPTURE_STOP_CALLER] reason=MeetingForegroundService.stopService()", Throwable("MeetingForegroundService.stopService call stack"))
            val intent = Intent(context, MeetingForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            try {
                context.startService(intent)
            } catch (e: Exception) {
                // startService might fail if app already in background, harmless
            }
            try {
                context.stopService(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // Explicitly remove meeting notification ID
            try {
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                notificationManager?.cancel(NOTIFICATION_ID)
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // Explicitly stop WebRTC MediaProjectionService and dismiss screen sharing notifications
            stopMediaProjectionService(context)
        }

        /**
         * Explicitly stops WebRTC's MediaProjectionService and dismisses
         * any lingering "Screen sharing / You are currently sharing your screen" notifications.
         */
        fun stopMediaProjectionService(context: Context) {
            android.util.Log.e("ScreenCapture-Diag", "[SCREEN_CAPTURE_STOP_CALLER] reason=MeetingForegroundService.stopMediaProjectionService()", Throwable("MeetingForegroundService.stopMediaProjectionService call stack"))
            // 1. Abort via WebRTC's MediaProjectionService.abort() helper
            try {
                com.oney.WebRTCModule.MediaProjectionService.abort(context)
            } catch (t: Throwable) {
                // WebRTC class may be missing or abort failed
            }

            // 2. Send stopService intent to com.oney.WebRTCModule.MediaProjectionService
            try {
                val intent = Intent(context, com.oney.WebRTCModule.MediaProjectionService::class.java)
                context.stopService(intent)
            } catch (t: Throwable) {
                // Ignore
            }

            // 3. Immediately dismiss any active notification belonging to OngoingConferenceChannel or matching screen share text
            dismissMediaProjectionNotifications(context)

            // 4. Also perform a delayed dismiss (250ms) to ensure asynchronous OS teardown notifications are cleaned up
            try {
                Handler(Looper.getMainLooper()).postDelayed({
                    dismissMediaProjectionNotifications(context)
                }, 250L)
            } catch (e: Exception) {
                // Ignore
            }
        }

        fun dismissMediaProjectionNotifications(context: Context) {
            try {
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                    ?: return

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val activeNotifications = notificationManager.activeNotifications
                    activeNotifications?.forEach { sbn ->
                        val channelId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) sbn.notification.channelId else null
                        val title = sbn.notification.extras?.getCharSequence(NotificationCompat.EXTRA_TITLE)?.toString() ?: ""
                        val text = sbn.notification.extras?.getCharSequence(NotificationCompat.EXTRA_TEXT)?.toString() ?: ""

                        val isMediaProjectionChannel = channelId == "OngoingConferenceChannel"
                        val isScreenShareText = title.contains("Screen sharing", ignoreCase = true) ||
                                title.contains("正在共享屏幕", ignoreCase = true) ||
                                title.contains("Screen share", ignoreCase = true) ||
                                text.contains("sharing your screen", ignoreCase = true) ||
                                text.contains("正在共享屏幕", ignoreCase = true)

                        if ((isMediaProjectionChannel || isScreenShareText) && sbn.id != NOTIFICATION_ID) {
                            notificationManager.cancel(sbn.tag, sbn.id)
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            cleanupAndStop()
            return START_NOT_STICKY
        }

        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "云讯会议 / CloudNews Meeting"
        val subtitle = intent?.getStringExtra(EXTRA_SUBTITLE) ?: "通话中 · 麦克风与音频已保持开启 / Meeting active · Mic & audio running"

        createNotificationChannel()

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            this.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        }

        val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val pendingIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingIntentFlags)

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                }
                val isScreenShareActive = (title.contains("共享屏幕") || subtitle.contains("共享屏幕") || subtitle.contains("Screen sharing"))
                if (isScreenShareActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                }
                startForeground(NOTIFICATION_ID, notification, type)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            // Fallback for devices with restrictive foreground service policies
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            } catch (fallbackErr: Exception) {
                fallbackErr.printStackTrace()
            }
        }

        acquireWakeLock()

        // START_NOT_STICKY ensures the OS does not auto-recreate the service when swiped away or closed
        return START_NOT_STICKY
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
                wakeLock = powerManager?.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "CloudNews:MeetingForegroundWakeLock"
                )
                wakeLock?.setReferenceCounted(false)
            }
            if (wakeLock?.isHeld != true) {
                wakeLock?.acquire(6 * 60 * 60 * 1000L) // 6 hours
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Meeting in Progress",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows an ongoing notification while a CloudNews meeting is active to keep audio and screen share running in the background."
                setShowBadge(false)
            }
            notificationManager?.createNotificationChannel(channel)
        }
    }

    private fun cleanupAndStop() {
        releaseWakeLock()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            notificationManager?.cancel(NOTIFICATION_ID)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        stopMediaProjectionService(this)
        stopSelf()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        cleanupAndStop()
    }

    override fun onDestroy() {
        cleanupAndStop()
        super.onDestroy()
    }
}
