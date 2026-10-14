package com.leadzam.clicktocall

import org.json.JSONObject
import java.util.UUID

enum class RequestStatus { PENDING, DIALER_OPENED, DISMISSED }

/**
 * A "please call this number" request that arrived from the CRM via FCM.
 *
 * This class is pure Kotlin (no Android framework types) so parsing and validation can be
 * unit tested on the JVM.
 */
data class DialRequest(
    val requestId: String,
    val phoneNumber: String,
    val contactName: String?,
    val receivedAtMillis: Long,
    val status: RequestStatus = RequestStatus.PENDING,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("requestId", requestId)
        .put("phoneNumber", phoneNumber)
        .put("contactName", contactName ?: JSONObject.NULL)
        .put("receivedAtMillis", receivedAtMillis)
        .put("status", status.name)

    companion object {
        const val TYPE_DIAL_REQUEST = "dial_request"
        private const val MAX_NAME_LENGTH = 80
        private const val MIN_DIGITS = 7
        private const val MAX_DIGITS = 15
        private val ALLOWED_PHONE_CHARS = Regex("^\\+?[0-9\\s\\-().]+$")

        /**
         * Builds a request from an FCM data payload, or returns null if it is not a valid
         * dial request. Anything unexpected is ignored rather than crashing the service.
         */
        fun fromData(data: Map<String, String>, nowMillis: Long): DialRequest? {
            if (data["type"] != TYPE_DIAL_REQUEST) return null
            val phone = sanitizePhoneNumber(data["phoneNumber"]) ?: return null
            val name = data["contactName"]
                ?.replace(Regex("\\p{Cntrl}"), " ")
                ?.replace(Regex("\\s+"), " ")
                ?.trim()
                ?.take(MAX_NAME_LENGTH)
                ?.takeIf { it.isNotEmpty() }
            val id = data["requestId"]?.trim()?.takeIf { it.isNotEmpty() } ?: UUID.randomUUID().toString()
            return DialRequest(id, phone, name, nowMillis)
        }

        /**
         * The backend already validates, but the app re-validates because FCM data is
         * untrusted input as far as the device is concerned. Only digits and an optional
         * leading "+" survive, so a payload can never put a USSD/MMI code like "*#06#" or
         * "*21*123#" into the dialer.
         */
        fun sanitizePhoneNumber(raw: String?): String? {
            val trimmed = raw?.trim() ?: return null
            if (trimmed.isEmpty() || !ALLOWED_PHONE_CHARS.matches(trimmed)) return null
            val digits = trimmed.filter { it.isDigit() }
            if (digits.length !in MIN_DIGITS..MAX_DIGITS) return null
            return (if (trimmed.startsWith("+")) "+" else "") + digits
        }

        fun fromJson(obj: JSONObject): DialRequest = DialRequest(
            requestId = obj.getString("requestId"),
            phoneNumber = obj.getString("phoneNumber"),
            contactName = if (obj.isNull("contactName")) null else obj.getString("contactName"),
            receivedAtMillis = obj.getLong("receivedAtMillis"),
            status = runCatching { RequestStatus.valueOf(obj.getString("status")) }
                .getOrDefault(RequestStatus.PENDING),
        )
    }
}
