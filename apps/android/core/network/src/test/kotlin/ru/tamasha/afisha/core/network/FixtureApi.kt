package ru.tamasha.afisha.core.network

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf

/** Ответы живого API, сохранённые в src/test/resources/fixtures (см. README модуля). */
internal fun fixture(name: String): String =
    requireNotNull(FixtureApi::class.java.getResource("/fixtures/$name")) { "Нет фикстуры $name" }.readText()

internal class FixtureApi(
    private val handler: suspend MockRequestHandleScope.(HttpRequestData) -> HttpResponseData,
) {
    val requests = mutableListOf<HttpRequestData>()
    val engine = MockEngine { request ->
        requests += request
        handler(request)
    }
    val api = GeneratedAfishaApi(baseUrl = "http://test.local", engine = engine)

    companion object {
        fun serving(file: String, status: HttpStatusCode = HttpStatusCode.OK) = FixtureApi {
            respond(fixture(file), status, headersOf(HttpHeaders.ContentType, "application/json"))
        }
    }
}
