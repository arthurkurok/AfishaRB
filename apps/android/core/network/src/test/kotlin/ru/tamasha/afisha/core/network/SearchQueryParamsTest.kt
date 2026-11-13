package ru.tamasha.afisha.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.WhenPreset

class SearchQueryParamsTest {

    @Test
    fun `свой диапазон дат важнее пресета`() {
        val p = SearchQueryParams.from(SearchFilters(whenPreset = WhenPreset.Today, dateFrom = "2026-11-07", dateTo = "2026-11-08"))
        assertNull(p.whenCode)
        assertEquals("2026-11-07", p.dateFrom)
        assertEquals("2026-11-08", p.dateTo)
    }

    @Test
    fun `режим с ребёнком 5 лет — знак не выше 0+`() {
        val p = SearchQueryParams.from(SearchFilters(childAge = 5))
        assertEquals(5, p.age)
        assertEquals(0, p.ageRatingMax)
    }

    @Test
    fun `только бесплатное отменяет порог цены`() {
        val p = SearchQueryParams.from(SearchFilters(freeOnly = true, priceMax = 500))
        assertEquals(true, p.free)
        assertNull(p.priceMax)
    }

    @Test
    fun `рядом со мной заменяет город и задаёт радиус`() {
        val p = SearchQueryParams.from(SearchFilters(municipalities = setOf("ufa"), near = "54.7,55.9"))
        assertNull(p.municipality)
        assertEquals("54.7,55.9", p.near)
        assertEquals(10.0, p.radiusKm)
    }

    @Test
    fun `пустой запрос не отправляется`() {
        assertNull(SearchQueryParams.from(SearchFilters(query = "   ")).q)
    }
}
