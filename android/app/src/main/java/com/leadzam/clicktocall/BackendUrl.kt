package com.leadzam.clicktocall

import java.net.URI

/** Pure helper (JVM-testable) for the backend URL the user types into the app. */
object BackendUrl {
    /** Returns the URL without a trailing slash, or null if it is not a usable http(s) URL. */
    fun normalize(raw: String): String? {
        val trimmed = raw.trim().trimEnd('/')
        if (trimmed.isEmpty()) return null
        val uri = try {
            URI(trimmed)
        } catch (e: Exception) {
            return null
        }
        val scheme = uri.scheme ?: return null
        if (scheme != "http" && scheme != "https") return null
        if (uri.host.isNullOrEmpty()) return null
        return trimmed
    }
}
