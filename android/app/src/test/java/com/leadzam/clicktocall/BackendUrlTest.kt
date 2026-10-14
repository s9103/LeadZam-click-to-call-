package com.leadzam.clicktocall

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BackendUrlTest {
    @Test
    fun acceptsHttpAndHttpsAndStripsTrailingSlash() {
        assertEquals("http://192.168.1.10:3000", BackendUrl.normalize(" http://192.168.1.10:3000/ "))
        assertEquals("https://example.com", BackendUrl.normalize("https://example.com"))
        assertEquals("http://10.0.2.2:3000", BackendUrl.normalize("http://10.0.2.2:3000"))
    }

    @Test
    fun rejectsEverythingElse() {
        assertNull(BackendUrl.normalize(""))
        assertNull(BackendUrl.normalize("   "))
        assertNull(BackendUrl.normalize("192.168.1.10:3000"))
        assertNull(BackendUrl.normalize("ftp://example.com"))
        assertNull(BackendUrl.normalize("http://"))
        assertNull(BackendUrl.normalize("not a url"))
    }
}
