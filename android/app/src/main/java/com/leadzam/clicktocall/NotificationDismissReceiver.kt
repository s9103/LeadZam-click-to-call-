package com.leadzam.clicktocall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Runs when the user swipes a call-request notification away: records the request as dismissed. */
class NotificationDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val requestId = intent.getStringExtra(NotificationHelper.EXTRA_REQUEST_ID) ?: return
        DialRequestActions.dismiss(context, requestId)
    }
}
