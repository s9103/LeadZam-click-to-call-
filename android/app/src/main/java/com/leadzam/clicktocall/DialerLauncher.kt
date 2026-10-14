package com.leadzam.clicktocall

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Opens the native dialer with the number pre-filled.
 *
 * ACTION_DIAL (not ACTION_CALL): the dialer opens and the USER presses the call button. That
 * needs no CALL_PHONE permission and guarantees we never place a call without a user action.
 */
object DialerLauncher {
    fun buildIntent(phoneNumber: String): Intent =
        // fromParts encodes the "+" correctly for the tel: scheme.
        Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", phoneNumber, null))

    /** Returns false if the device has no app that can handle dialing (e.g. some tablets). */
    fun open(context: Context, phoneNumber: String): Boolean {
        val intent = buildIntent(phoneNumber)
        if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }
}
