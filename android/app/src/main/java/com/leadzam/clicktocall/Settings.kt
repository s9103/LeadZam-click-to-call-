package com.leadzam.clicktocall

import android.content.Context
import android.os.Build

/** Tiny SharedPreferences wrapper for the few values the demo needs to remember. */
object Settings {
    private const val PREFS = "settings"
    private const val KEY_TOKEN = "fcm_token"
    private const val KEY_BACKEND_URL = "backend_url"
    private const val KEY_DEVICE_NAME = "device_name"

    /** 10.0.2.2 is how the Android emulator reaches the host machine's localhost. */
    const val DEFAULT_BACKEND_URL = "http://10.0.2.2:3000"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun token(context: Context): String? = prefs(context).getString(KEY_TOKEN, null)
    fun saveToken(context: Context, token: String) =
        prefs(context).edit().putString(KEY_TOKEN, token).apply()

    /** Null until the user has registered once; the service uses this to auto re-register on token refresh. */
    fun backendUrl(context: Context): String? = prefs(context).getString(KEY_BACKEND_URL, null)
    fun saveBackendUrl(context: Context, url: String) =
        prefs(context).edit().putString(KEY_BACKEND_URL, url).apply()

    fun deviceName(context: Context): String =
        prefs(context).getString(KEY_DEVICE_NAME, null) ?: Build.MODEL
    fun saveDeviceName(context: Context, name: String) =
        prefs(context).edit().putString(KEY_DEVICE_NAME, name).apply()
}
