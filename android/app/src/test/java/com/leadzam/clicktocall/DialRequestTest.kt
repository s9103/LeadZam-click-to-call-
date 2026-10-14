package com.leadzam.clicktocall

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class DialRequestTest {

    private fun payload(
        type: String? = "dial_request",
        phone: String? = "+919876543210",
        name: String? = "Rahul Sharma",
        id: String? = "req-1",
    ): Map<String, String> = buildMap {
        type?.let { put("type", it) }
        phone?.let { put("phoneNumber", it) }
        name?.let { put("contactName", it) }
        id?.let { put("requestId", it) }
    }

    @Test
    fun parsesAValidPayload() {
        val request = DialRequest.fromData(payload(), nowMillis = 1_000L)!!
        assertEquals("req-1", request.requestId)
        assertEquals("+919876543210", request.phoneNumber)
        assertEquals("Rahul Sharma", request.contactName)
        assertEquals(1_000L, request.receivedAtMillis)
        assertEquals(RequestStatus.PENDING, request.status)
    }

    @Test
    fun ignoresMessagesThatAreNotDialRequests() {
        assertNull(DialRequest.fromData(payload(type = "something_else"), 0))
        assertNull(DialRequest.fromData(payload(type = null), 0))
        assertNull(DialRequest.fromData(emptyMap(), 0))
    }

    @Test
    fun rejectsMissingOrInvalidNumbers() {
        assertNull(DialRequest.fromData(payload(phone = null), 0))
        assertNull(DialRequest.fromData(payload(phone = ""), 0))
        assertNull(DialRequest.fromData(payload(phone = "98-ABC-12"), 0))
        assertNull(DialRequest.fromData(payload(phone = "123"), 0))
        assertNull(DialRequest.fromData(payload(phone = "+1234567890123456"), 0))
    }

    @Test
    fun neverLetsUssdOrMmiCodesReachTheDialer() {
        assertNull(DialRequest.sanitizePhoneNumber("*#06#"))
        assertNull(DialRequest.sanitizePhoneNumber("*21*9876543210#"))
        assertNull(DialRequest.sanitizePhoneNumber("9876543210#"))
        assertNull(DialRequest.sanitizePhoneNumber("9876543210;123"))
        assertNull(DialRequest.sanitizePhoneNumber("++919876543210"))
        assertNull(DialRequest.sanitizePhoneNumber("98765+43210"))
    }

    @Test
    fun normalizesFormattedNumbers() {
        assertEquals("+919876543210", DialRequest.sanitizePhoneNumber("+91 98765 43210"))
        assertEquals("9876543210", DialRequest.sanitizePhoneNumber(" (987) 654-3210 "))
    }

    @Test
    fun contactNameIsOptionalAndCleaned() {
        assertNull(DialRequest.fromData(payload(name = null), 0)!!.contactName)
        assertNull(DialRequest.fromData(payload(name = "   "), 0)!!.contactName)
        assertEquals("Rahul Sharma", DialRequest.fromData(payload(name = " Rahul\n  Sharma "), 0)!!.contactName)
        assertEquals(80, DialRequest.fromData(payload(name = "x".repeat(200)), 0)!!.contactName!!.length)
    }

    @Test
    fun missingRequestIdGetsAGeneratedOne() {
        val request = DialRequest.fromData(payload(id = null), 0)
        assertNotNull(request)
        assertEquals(false, request!!.requestId.isBlank())
    }

    @Test
    fun survivesAJsonRoundTrip() {
        val original = DialRequest("id", "+919876543210", "Rahul", 42L, RequestStatus.DISMISSED)
        assertEquals(original, DialRequest.fromJson(original.toJson()))

        val noName = DialRequest("id2", "9876543210", null, 7L)
        assertEquals(noName, DialRequest.fromJson(noName.toJson()))
    }
}
