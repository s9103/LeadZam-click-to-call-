package com.leadzam.clicktocall

import android.content.Context

/**
 * The two things a user can do with a request. Shared by the in-app buttons, the notification
 * action (via DialTrampolineActivity) and the swipe-to-dismiss receiver, so the behaviour
 * (update local state, tell the backend) is identical everywhere.
 */
object DialRequestActions {

    /** Opens the dialer; only marks the request as handled if a dialer actually opened. */
    fun openDialer(context: Context, requestId: String, phoneNumber: String): Boolean {
        val opened = DialerLauncher.open(context, phoneNumber)
        if (opened) {
            DialRequestRepository.updateStatus(context, requestId, RequestStatus.DIALER_OPENED)
            BackendClient.sendAck(context, requestId, BackendClient.ACK_DIALER_OPENED)
            NotificationHelper.cancel(context, requestId)
        }
        return opened
    }

    /** User ignored/dismissed the request. Never overrides a request that already opened the dialer. */
    fun dismiss(context: Context, requestId: String) {
        val request = DialRequestRepository.find(context, requestId) ?: return
        if (request.status != RequestStatus.PENDING) return
        DialRequestRepository.updateStatus(context, requestId, RequestStatus.DISMISSED)
        BackendClient.sendAck(context, requestId, BackendClient.ACK_DISMISSED)
        NotificationHelper.cancel(context, requestId)
    }
}
