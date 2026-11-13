import AfishaKit
import CoreLocation
import Observation

/// Геопозиция для «Рядом со мной». Запрашивается только по действию пользователя
/// (кнопка «Рядом»), точность — «приблизительная» достаточна для радиуса 1–30 км.
@MainActor
@Observable
final class LocationService: NSObject {
    private(set) var coordinate: Coordinate?
    private(set) var authorization: CLAuthorizationStatus
    private(set) var isLocating = false

    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private var continuation: CheckedContinuation<Coordinate?, Never>?

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    var isDenied: Bool { authorization == .denied || authorization == .restricted }

    /// Запросить разрешение (если нужно) и текущую точку. `nil` — отказ или ошибка.
    func requestLocation() async -> Coordinate? {
        if isDenied { return nil }
        if continuation != nil { return coordinate }
        isLocating = true
        defer { isLocating = false }
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            if manager.authorizationStatus == .notDetermined {
                manager.requestWhenInUseAuthorization()
            } else {
                manager.requestLocation()
            }
        }
    }

    private func finish(_ value: Coordinate?) {
        if let value { coordinate = value }
        continuation?.resume(returning: value)
        continuation = nil
    }
}

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorization = status
            guard self.continuation != nil else { return }
            switch status {
            case .authorizedWhenInUse, .authorizedAlways: self.manager.requestLocation()
            case .denied, .restricted: self.finish(nil)
            default: break
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let value = Coordinate(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
        Task { @MainActor in self.finish(value) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        Task { @MainActor in self.finish(nil) }
    }
}
