package com.leadzam.clicktocall

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Stores received call requests (newest first), persisted in SharedPreferences so a request
 * that arrived while the app was closed is still there when the user opens it.
 *
 * Both the FCM service (background thread) and the UI (main thread) use this, so all access is
 * guarded by [lock]. Listeners are always called on the main thread.
 */
object DialRequestRepository {
    fun interface Listener {
        fun onChanged()
    }

    private const val PREFS_NAME = "dial_requests"
    private const val KEY_ITEMS = "items"
    private const val MAX_ITEMS = 50

    private val lock = Any()
    private var cache: MutableList<DialRequest>? = null
    private val listeners = CopyOnWriteArraySet<Listener>()
    private val mainHandler = Handler(Looper.getMainLooper())

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun all(context: Context): List<DialRequest> = synchronized(lock) { items(context).toList() }

    fun find(context: Context, requestId: String): DialRequest? =
        synchronized(lock) { items(context).firstOrNull { it.requestId == requestId } }

    fun pendingCount(context: Context): Int =
        synchronized(lock) { items(context).count { it.status == RequestStatus.PENDING } }

    /** Returns false (and stores nothing) if this requestId was already received, e.g. an FCM redelivery. */
    fun add(context: Context, request: DialRequest): Boolean {
        val added = synchronized(lock) {
            val list = items(context)
            if (list.any { it.requestId == request.requestId }) {
                false
            } else {
                list.add(0, request)
                while (list.size > MAX_ITEMS) list.removeAt(list.lastIndex)
                persist(context, list)
                true
            }
        }
        if (added) notifyChanged()
        return added
    }

    /** Returns true if the request existed and its status actually changed. */
    fun updateStatus(context: Context, requestId: String, status: RequestStatus): Boolean {
        val changed = synchronized(lock) {
            val list = items(context)
            val index = list.indexOfFirst { it.requestId == requestId }
            if (index < 0 || list[index].status == status) {
                false
            } else {
                list[index] = list[index].copy(status = status)
                persist(context, list)
                true
            }
        }
        if (changed) notifyChanged()
        return changed
    }

    private fun notifyChanged() {
        mainHandler.post { listeners.forEach { it.onChanged() } }
    }

    private fun items(context: Context): MutableList<DialRequest> {
        cache?.let { return it }
        val loaded = load(context)
        cache = loaded
        return loaded
    }

    private fun load(context: Context): MutableList<DialRequest> {
        val raw = prefs(context).getString(KEY_ITEMS, null) ?: return mutableListOf()
        return try {
            val array = JSONArray(raw)
            MutableList(array.length()) { DialRequest.fromJson(array.getJSONObject(it)) }
        } catch (e: Exception) {
            // Corrupt data must never crash the FCM service: start fresh.
            mutableListOf()
        }
    }

    private fun persist(context: Context, list: List<DialRequest>) {
        val array = JSONArray()
        list.forEach { array.put(it.toJson()) }
        prefs(context).edit().putString(KEY_ITEMS, array.toString()).apply()
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
