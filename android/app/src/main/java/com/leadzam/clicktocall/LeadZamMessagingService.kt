package com.leadzam.clicktocall

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Entry point for everything FCM sends to this device.
 *
 * Because the backend sends DATA-ONLY messages, [onMessageReceived] is invoked in BOTH cases:
 * app in the foreground and app in the background/killed (high-priority messages get a short
 * execution window to run this). That is what lets us choose the UX ourselves.
 */
class LeadZamMessagingService : FirebaseMessagingService() {

    /** FCM rotates tokens occasionally; keep the backend in sync if the user already registered. */
    override fun onNewToken(token: String) {
        Settings.saveToken(this, token)
        val baseUrl = Settings.backendUrl(this) ?: return
        BackendClient.registerDevice(baseUrl, token, Settings.deviceName(this)) { result ->
            result.onFailure { Log.w(TAG, "Re-registering refreshed token failed: ${it.message}") }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val request = DialRequest.fromData(message.data, System.currentTimeMillis())
        if (request == null) {
            // Wrong type or an invalid number: ignore. Never log the number itself (PII).
            Log.w(TAG, "Ignoring FCM message that is not a valid dial_request (keys=${message.data.keys})")
            return
        }

        // FCM can redeliver; the repository de-duplicates by requestId.
        if (!DialRequestRepository.add(this, request)) {
            Log.i(TAG, "Duplicate request ${request.requestId} ignored")
            return
        }

        // Tell the CRM the phone has the request (this is what turns the dashboard to "Received").
        BackendClient.sendAck(this, request.requestId, BackendClient.ACK_RECEIVED)

        if (AppForeground.isVisible) {
            // Foreground: the open screen updates itself through the repository listener.
            // No notification and nothing launched over what the user is doing.
            Log.i(TAG, "Request ${request.requestId} received in foreground")
        } else {
            NotificationHelper.show(this, request)
            Log.i(TAG, "Request ${request.requestId} received in background, notification posted")
        }
    }

    private companion object {
        const val TAG = "LeadZamFcm"
    }
}
