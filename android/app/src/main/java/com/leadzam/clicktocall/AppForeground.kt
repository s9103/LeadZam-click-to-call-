package com.leadzam.clicktocall

/**
 * Tracks whether our UI is currently visible. MainActivity flips this in onStart/onStop.
 *
 * The messaging service reads it from a background thread, hence @Volatile. It is how we
 * decide between "foreground": update the in-app list, and "background": post a notification.
 * The app has a single user-visible activity, so a boolean is enough (no counter needed).
 */
object AppForeground {
    @Volatile
    var isVisible: Boolean = false
}
