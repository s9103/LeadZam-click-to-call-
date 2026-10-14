package com.leadzam.clicktocall

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Minimal HTTP client (plain HttpURLConnection, no extra dependencies) for the two calls the
 * app makes to the demo backend: device registration and request acknowledgements.
 *
 * All calls run on one background thread. Acknowledgements are best-effort: if the backend is
 * unreachable the call flow still works, the dashboard just keeps showing "accepted by FCM".
 */
object BackendClient {
    private const val TAG = "BackendClient"
    private const val TIMEOUT_MS = 5_000

    const val ACK_RECEIVED = "received"
    const val ACK_DIALER_OPENED = "dialer_opened"
    const val ACK_DISMISSED = "dismissed"

    private val executor: ExecutorService = Executors.newSingleThreadExecutor()

    /** [onResult] is called on the background thread: switch to the UI thread before touching views. */
    fun registerDevice(
        baseUrl: String,
        token: String,
        deviceName: String,
        onResult: (Result<Unit>) -> Unit,
    ) {
        executor.execute {
            val result = runCatching {
                postJson(
                    "$baseUrl/api/device",
                    JSONObject().put("token", token).put("deviceName", deviceName),
                )
            }
            onResult(result)
        }
    }

    /** Fire-and-forget acknowledgement; silently skipped if no backend URL was configured. */
    fun sendAck(context: Context, requestId: String, status: String) {
        val baseUrl = Settings.backendUrl(context) ?: return
        executor.execute {
            try {
                postJson(
                    "$baseUrl/api/ack",
                    JSONObject().put("requestId", requestId).put("status", status),
                )
            } catch (e: Exception) {
                Log.w(TAG, "Ack '$status' for $requestId not delivered: ${e.message}")
            }
        }
    }

    @Throws(IOException::class)
    private fun postJson(url: String, body: JSONObject) {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }

            val code = connection.responseCode
            if (code !in 200..299) {
                val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() }
                throw IOException(describeError(code, errorBody))
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun describeError(code: Int, body: String?): String {
        val message = try {
            JSONObject(body ?: "").getJSONObject("error").getString("message")
        } catch (e: Exception) {
            null
        }
        return message ?: "Server responded with HTTP $code"
    }
}
