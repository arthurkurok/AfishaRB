import AfishaKit
import AfishaStore
import Foundation
import Observation
import SwiftData

/// Простой DI-контейнер (docs/08-mobile.md §3.1: без фреймворков). Создаётся один раз при старте
/// и передаётся вниз через окружение SwiftUI.
@MainActor
@Observable
final class AppEnvironment {
    let settings: AppSettings
    let service: any AfishaService
    let store: OfflineStore
    let reference: ReferenceData
    let location: LocationService
    let router: Router
    let calendar: CalendarService

    let home: HomeModel
    let search: SearchModel
    let guide: GuideModel

    init(settings: AppSettings, service: any AfishaService, store: OfflineStore) {
        self.settings = settings
        self.service = service
        self.store = store
        reference = ReferenceData(service: service, cache: store)
        location = LocationService()
        router = Router()
        calendar = CalendarService()
        home = HomeModel(service: service, cache: store)
        search = SearchModel(service: service, filters: SearchFilters(when: .week, municipalities: [settings.municipalityID]))
        guide = GuideModel(service: service)
    }

    /// Рабочая конфигурация: API из Info.plist, база SwiftData на диске.
    static func live() -> AppEnvironment {
        let store: OfflineStore
        do {
            store = OfflineStore(container: try AfishaStoreSchema.makeContainer())
        } catch {
            // База повреждена или не открылась — работаем без офлайн-кэша, но приложение запускается
            store = try! OfflineStore.inMemory()
        }
        return AppEnvironment(settings: AppSettings(), service: LiveAfishaService(), store: store)
    }

    /// Координата для «рядом»: только если пользователь разрешил геопозицию.
    var nearCoordinate: Coordinate? { location.coordinate ?? settings.lastLocation }

    var guideContext: GuideContext {
        GuideContext(language: settings.language, municipalityID: settings.municipalityID, near: location.coordinate)
    }

    /// Название выбранного города на текущем языке.
    var cityName: String {
        reference.municipality(id: settings.municipalityID)?.name
            ?? settings.municipalityName
            ?? settings.localizer("city.choose")
    }

    func selectCity(_ municipality: Municipality) {
        settings.municipalityID = municipality.id
        settings.municipalityName = municipality.name
        search.filters.municipalities = [municipality.id]
        WidgetRefresher.reload()
    }
}
