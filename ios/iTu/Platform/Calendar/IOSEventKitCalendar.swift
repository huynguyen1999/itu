import Combine
import EventKit
import Foundation
import iTuDomain

enum IOSEventKitAuthorizationState: Equatable {
    case notDetermined
    case denied
    case restricted
    case writeOnly
    case authorized

    init(status: EKAuthorizationStatus) {
        if #available(iOS 17.0, *) {
            switch status {
            case .fullAccess:
                self = .authorized
                return
            case .writeOnly:
                self = .writeOnly
                return
            default:
                break
            }
        }

        switch status {
        case .notDetermined: self = .notDetermined
        case .denied: self = .denied
        case .restricted: self = .restricted
        default: self = .authorized
        }
    }

    var title: String {
        switch self {
        case .notDetermined: "Not requested"
        case .denied: "Denied"
        case .restricted: "Restricted"
        case .writeOnly: "Write-only"
        case .authorized: "Allowed"
        }
    }

    var canRead: Bool { self == .authorized }
}

struct IOSEventKitCalendarEvent: Identifiable, Equatable {
    let id: String
    let title: String
    let startDate: Date
    let endDate: Date
    let isAllDay: Bool
    let calendarTitle: String

    init(event: EKEvent) {
        startDate = event.startDate
        endDate = event.endDate
        title = event.title ?? "Untitled event"
        isAllDay = event.isAllDay
        calendarTitle = event.calendar?.title ?? "Calendar"
        id = event.eventIdentifier ?? "\(title)|\(startDate.timeIntervalSince1970)|\(endDate.timeIntervalSince1970)"
    }
}

@MainActor
final class IOSEventKitCalendar: ObservableObject {
    @Published private(set) var authorizationState: IOSEventKitAuthorizationState
    @Published private(set) var events: [IOSEventKitCalendarEvent] = []
    @Published private(set) var errorMessage: String?
    @Published private(set) var isRequesting = false

    private let store: EKEventStore

    init(store: EKEventStore = EKEventStore()) {
        self.store = store
        authorizationState = IOSEventKitAuthorizationState(
            status: EKEventStore.authorizationStatus(for: .event)
        )
    }

    func refreshAuthorization() {
        authorizationState = IOSEventKitAuthorizationState(
            status: EKEventStore.authorizationStatus(for: .event)
        )
        if !authorizationState.canRead { events = [] }
    }

    func requestAccess() async {
        guard !isRequesting else { return }
        isRequesting = true
        errorMessage = nil
        defer { isRequesting = false }

        do {
            if #available(iOS 17.0, *) {
                _ = try await store.requestFullAccessToEvents()
            } else {
                _ = try await store.requestAccess(to: .event)
            }
            refreshAuthorization()
        } catch {
            refreshAuthorization()
            errorMessage = error.localizedDescription
        }
    }

    func loadEvents(for localDate: String) {
        guard authorizationState.canRead,
              let start = IOSProductCalendar.date(from: localDate),
              let end = iTuCalendarSupport.calendar().date(byAdding: .day, value: 1, to: start) else {
            events = []
            return
        }

        errorMessage = nil
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        events = store.events(matching: predicate)
            .map(IOSEventKitCalendarEvent.init(event:))
            .sorted { lhs, rhs in
                lhs.startDate == rhs.startDate ? lhs.endDate < rhs.endDate : lhs.startDate < rhs.startDate
            }
    }
}
