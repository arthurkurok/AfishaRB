package ru.tamasha.afisha.core.designsystem

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import ru.tamasha.afisha.core.designsystem.component.EventCard
import ru.tamasha.afisha.core.designsystem.component.StatusBadge
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.Availability
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.DisplayStatus
import ru.tamasha.afisha.core.model.EventSummary
import ru.tamasha.afisha.core.model.Freshness
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.OccurrenceStatus
import ru.tamasha.afisha.core.model.Price
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.Venue
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/** Compose UI-тесты на JVM (Robolectric): доступность карточки и статусов. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [36])
class EventCardTest {

    @get:Rule
    val rule = createComposeRule()

    // Понедельник, 2 ноября 2026, 12:00 по Уфе
    private val clock = RegionClock(clock = Clock.fixed(Instant.parse("2026-11-02T07:00:00Z"), ZoneOffset.UTC))

    private val occurrence = Occurrence(
        id = "o1",
        event = EventSummary(
            id = "e1",
            title = "Спектакль «Буратино»",
            summary = "",
            categories = listOf(Category.Theatre),
            tags = emptySet(),
            ageRating = 0,
            pushkinCard = true,
            price = Price(BigDecimal("400.00"), BigDecimal("800.00"), isFree = false),
            image = null,
            organization = null,
        ),
        venue = Venue("v1", "Театр кукол", null, null, "ufa", "Уфа"),
        startsAt = "2026-11-07T11:00:00+05:00",
        endsAt = null,
        isRange = false,
        status = OccurrenceStatus.Scheduled,
        statusReason = null,
        previousStartsAt = null,
        availability = Availability.FewLeft,
        ticketUrl = null,
        moreDates = 2,
        distanceKm = null,
        reasons = emptyList(),
        freshness = Freshness.Fresh,
    )

    @Test
    fun `карточка читается одной фразой и открывается`() {
        rule.setContent {
            AfishaTheme(darkTheme = false, regionClock = clock) {
                EventCard(occurrence, isFavorite = false, onClick = {}, onFavoriteChange = {})
            }
        }
        rule.onNodeWithContentDescription(
            "Спектакль «Буратино», 0+, суббота 7 ноября, 11:00, Театр кукол, от 400 рублей, осталось мало билетов",
        ).assertHasClickAction()
            .assert(SemanticsMatcher.keyIsDefined(SemanticsActions.CustomActions))
    }

    @Test
    fun `в тёмной теме и на башкирском фраза тоже одна`() {
        rule.setContent {
            AfishaTheme(darkTheme = true, language = AppLanguage.Ba, regionClock = clock) {
                EventCard(occurrence.copy(availability = Availability.Unknown), isFavorite = true, onClick = {}, onFavoriteChange = {})
            }
        }
        rule.onNodeWithContentDescription("Спектакль «Буратино», 0+, шәмбе 7 ноябрь, 11:00, Театр кукол, 400 һумдан башлап").assertExists()
    }

    @Test
    fun `статус показан текстом, не только цветом`() {
        rule.setContent {
            AfishaTheme(regionClock = clock) { StatusBadge(DisplayStatus.Cancelled) }
        }
        rule.onNodeWithText("Отменено").assertExists()
    }

    @Test
    @Config(qualifiers = "ba")
    fun `строки статусов есть на башкирском`() {
        rule.setContent {
            AfishaTheme(language = AppLanguage.Ba, regionClock = clock) { StatusBadge(DisplayStatus.FewLeft) }
        }
        rule.onNodeWithText("Билеттар аҙ ҡалды").assertExists()
    }
}
