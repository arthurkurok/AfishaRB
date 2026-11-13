import AfishaUI
import SwiftUI
import WidgetKit

/// Расширение виджетов «Тамаши». Набор: «Сегодня рядом» (S/M).
/// Следующие по плану (08 §3.1): «Моё следующее событие», «Подборка недели».
@main
struct AfishaWidgetsBundle: WidgetBundle {
    init() {
        AfishaFonts.register()
    }

    var body: some Widget {
        TodayNearbyWidget()
    }
}
