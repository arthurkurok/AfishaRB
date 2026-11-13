import AfishaKit
import AfishaUI
import SafariServices
import SwiftUI
import UIKit
import WidgetKit

/// Встроенный браузер для билетов и источников: пользователь не покидает приложение,
/// а продавец билетов видит обычный сайт (без WebView для основного контента).
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let configuration = SFSafariViewController.Configuration()
        configuration.entersReaderIfAvailable = false
        let controller = SFSafariViewController(url: url, configuration: configuration)
        controller.preferredControlTintColor = UIColor(Tokens.Palette.accent.color)
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

/// Обёртка URL для `.sheet(item:)`.
struct IdentifiedURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Перезагрузка виджетов после смены города или языка.
enum WidgetRefresher {
    static func reload() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}

/// Маршрут до площадки: Яндекс Карты, 2ГИС или Apple Карты (03 §1.5, п. 5).
enum MapsRoute: String, CaseIterable, Identifiable {
    case yandex, dgis, apple

    var id: String { rawValue }

    func url(to coordinate: Coordinate, name: String) -> URL? {
        let lat = coordinate.latitude, lon = coordinate.longitude
        switch self {
        case .yandex:
            return URL(string: "https://yandex.ru/maps/?rtext=~\(lat),\(lon)&rtt=auto")
        case .dgis:
            return URL(string: "https://2gis.ru/routeSearch/rsType/car/to/\(lon),\(lat)")
        case .apple:
            let query = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
            return URL(string: "https://maps.apple.com/?daddr=\(lat),\(lon)&q=\(query)")
        }
    }
}
