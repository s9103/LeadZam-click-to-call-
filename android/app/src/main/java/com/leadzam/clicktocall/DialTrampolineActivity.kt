package com.leadzam.clicktocall

import android.app.Activity
import android.os.Bundle
import android.widget.Toast

/**
 * Invisible activity behind the notification's "Call" button.
 *
 * It exists so we can record "dialer opened" (local state + backend ack) and then hand over to
 * the native dialer. It has no UI and finishes immediately. Starting an activity from an
 * activity is fine on Android 12+; what is restricted is a broadcast receiver or service
 * starting one in response to a notification tap (a "notification trampoline").
 */
class DialTrampolineActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val requestId = intent.getStringExtra(NotificationHelper.EXTRA_REQUEST_ID)
        // Re-validate: never pass an unchecked string to the dialer.
        val phone = DialRequest.sanitizePhoneNumber(intent.getStringExtra(NotificationHelper.EXTRA_PHONE_NUMBER))

        if (requestId != null && phone != null) {
            if (!DialRequestActions.openDialer(this, requestId, phone)) {
                Toast.makeText(this, R.string.error_no_dialer, Toast.LENGTH_LONG).show()
            }
        }
        finish()
    }
}
