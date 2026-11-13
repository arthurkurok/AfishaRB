import AfishaKit
import EventKit
import EventKitUI
import SwiftUI
import UIKit

/// Добавление сеанса в календарь через EventKit.
///
/// Используется системный экран `EKEventEditViewController`: с iOS 17 он не требует доступа к
/// календарю — пользователь сам подтверждает событие, приложение не читает его календари (ПДн, 09).
@MainActor
final class CalendarService {
    let store = EKEventStore()

    /// Черновик события календаря для сеанса.
    func draft(title: String, session: some SessionFields, summary: String?, webURL: URL?) -> EKEvent {
        let event = EKEvent(eventStore: store)
        event.title = title
        let start = session.startDate ?? Date()
        event.startDate = start
        // Выставка «до 30 ноября» — в календарь ставим только день начала на час, иначе событие на месяц
        if session.isRange {
            event.endDate = start.addingTimeInterval(2 * 3600)
        } else {
            event.endDate = session.endDate.flatMap { $0 > start && $0.timeIntervalSince(start) < 12 * 3600 ? $0 : nil }
                ?? start.addingTimeInterval(2 * 3600)
        }
        event.timeZone = Region.timeZone
        if let venue = session.venue {
            event.location = [venue.name, venue.address].compactMap { $0 }.joined(separator: ", ")
            if let coordinate = venue.coordinate {
                let structured = EKStructuredLocation(title: venue.name)
                structured.geoLocation = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
                event.structuredLocation = structured
            }
        }
        event.url = webURL
        event.notes = summary
        // Напоминание за 3 часа (как push-напоминание, 08 §5)
        event.addAlarm(EKAlarm(relativeOffset: -3 * 3600))
        return event
    }
}

/// Системный экран создания события календаря.
struct CalendarEventEditor: UIViewControllerRepresentable {
    let event: EKEvent
    let store: EKEventStore
    let onFinish: (EKEventEditViewAction) -> Void

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let controller = EKEventEditViewController()
        controller.eventStore = store
        controller.event = event
        controller.editViewDelegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: EKEventEditViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let onFinish: (EKEventEditViewAction) -> Void

        init(onFinish: @escaping (EKEventEditViewAction) -> Void) {
            self.onFinish = onFinish
        }

        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
            onFinish(action)
        }
    }
}
