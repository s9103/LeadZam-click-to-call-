package com.leadzam.clicktocall

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Background experience: a heads-up notification per request with a "Call" action.
 *
 * Why a notification instead of launching an activity? Since Android 10 apps in the background
 * are not allowed to start activities, and even where it is possible, yanking the user out of
 * whatever they are doing is hostile. A notification is the platform-sanctioned way to ask for
 * attention; the user chooses when to act.
 */
object NotificationHelper {
    private const val TAG = "NotificationHelper"
    private const val CHANNEL_ID = "dial_requests"
    private const val GROUP_KEY = "com.leadzam.clicktocall.DIAL_REQUESTS"
    private const val SUMMARY_ID = 1

    const val EXTRA_REQUEST_ID = "request_id"
    const val EXTRA_PHONE_NUMBER = "phone_number"

    /** Stable per-request id so two requests produce two notifications (not one replacing the other). */
    private fun notificationId(requestId: String) = 1000 + (requestId.hashCode() and 0x00FFFFFF)

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_channel_description)
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    @SuppressLint("MissingPermission") // guarded by areNotificationsEnabled(), which covers POST_NOTIFICATIONS
    fun show(context: Context, request: DialRequest) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) {
            // Android 13+ permission denied or notifications switched off. The request is still saved
            // and shown in the app the next time it is opened.
            Log.w(TAG, "Notifications disabled; request ${request.requestId} will only appear in the app")
            return
        }
        ensureChannel(context)

        val name = request.contactName ?: context.getString(R.string.unknown_contact)
        val text = "$name · ${request.phoneNumber}"

        val openApp = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                // A unique data URI makes each PendingIntent distinct (extras alone do not).
                data = Uri.parse("leadzam://request/${request.requestId}/open")
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val call = PendingIntent.getActivity(
            context, 0,
            Intent(context, DialTrampolineActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                data = Uri.parse("leadzam://request/${request.requestId}/call")
                putExtra(EXTRA_REQUEST_ID, request.requestId)
                putExtra(EXTRA_PHONE_NUMBER, request.phoneNumber)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        // Fires only when the USER swipes the notification away (not when we cancel it ourselves).
        val dismiss = PendingIntent.getBroadcast(
            context, 0,
            Intent(context, NotificationDismissReceiver::class.java).apply {
                data = Uri.parse("leadzam://request/${request.requestId}/dismiss")
                putExtra(EXTRA_REQUEST_ID, request.requestId)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.notification_title))
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setWhen(request.receivedAtMillis)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(openApp)
            .setDeleteIntent(dismiss)
            .addAction(0, context.getString(R.string.notification_action_call), call)
            .setGroup(GROUP_KEY)
            .build()

        manager.notify(notificationId(request.requestId), notification)
        postSummaryIfNeeded(context, manager)
    }

        /** Group multiple pending requests into one summary notification. */
    @SuppressLint("MissingPermission")
    private fun postSummaryIfNeeded(context: Context, manager: NotificationManagerCompat) {
        val pending = DialRequestRepository.pendingCount(context)

        if (pending < 2) {
            manager.cancel(SUMMARY_ID)
            return
        }

        val summary = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.notification_title))
            .setContentText(context.getString(R.string.notification_summary, pending))
            .setGroup(GROUP_KEY)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .setContentIntent(
                PendingIntent.getActivity(
                    context,
                    0,
                    Intent(context, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP
                    },
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                ),
            )
            .build()

        manager.notify(SUMMARY_ID, summary)
    }

    fun cancel(context: Context, requestId: String) {
        val manager = NotificationManagerCompat.from(context)
        manager.cancel(notificationId(requestId))
        postSummaryIfNeeded(context, manager)
    }

    fun cancelAll(context: Context) {
        NotificationManagerCompat.from(context).cancelAll()
    }
}
