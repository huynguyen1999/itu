import Foundation
import UserNotifications
import iTuDomain

private final class IOSNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    var onTap: ((IOSDestination) -> Void)?

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let destination = response.notification.request.content.userInfo["destination"] as? String
        completionHandler()
        guard let destination, let destination = IOSDestination(rawValue: destination) else { return }
        Task { @MainActor [weak self] in
            self?.onTap?(destination)
        }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}

enum IOSNotificationAuthorizationState: Equatable {
    case notDetermined
    case denied
    case authorized
    case provisional
    case ephemeral

    var title: String {
        switch self {
        case .notDetermined: "Not requested"
        case .denied: "Denied"
        case .authorized: "Allowed"
        case .provisional: "Allowed quietly"
        case .ephemeral: "Temporary"
        }
    }

    var canSchedule: Bool { self == .authorized || self == .provisional || self == .ephemeral }
    var canRequest: Bool { self == .notDetermined }
}

@MainActor
final class IOSLocalNotificationScheduler {
    static let shared = IOSLocalNotificationScheduler()

    private let center = UNUserNotificationCenter.current()
    private let delegate = IOSNotificationDelegate()
    private let taskPrefix = "com.itu.task-reminder."
    private let focusPrefix = "com.itu.focus-completion."
    private var syncGeneration = 0

    private init() {
        center.delegate = delegate
    }

    func setNavigationHandler(_ handler: @escaping (IOSDestination) -> Void) {
        delegate.onTap = handler
    }

    func authorizationState() async -> IOSNotificationAuthorizationState {
        switch await center.notificationSettings().authorizationStatus {
        case .notDetermined: .notDetermined
        case .denied: .denied
        case .authorized: .authorized
        case .provisional: .provisional
        case .ephemeral: .ephemeral
        @unknown default: .denied
        }
    }

    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func sync(tasks: [ProductivityTask], activeFocus: FocusSession?) async {
        syncGeneration += 1
        let runGeneration = syncGeneration

        let managedIDs = await center.pendingNotificationRequests()
            .map(\.identifier)
            .filter { $0.hasPrefix(taskPrefix) || $0.hasPrefix(focusPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: managedIDs)
        guard runGeneration == syncGeneration, (await authorizationState()).canSchedule else { return }

        var requests = tasks.flatMap(taskRequests(for:)).sorted { $0.0 < $1.0 }.prefix(63).map(\.1)
        if let focusRequest = focusRequest(for: activeFocus) {
            requests.append(focusRequest)
        }
        for request in requests {
            guard runGeneration == syncGeneration, !Task.isCancelled else { return }
            try? await center.add(request)
        }
    }

    private func taskRequests(for task: ProductivityTask) -> [(Date, UNNotificationRequest)] {
        guard task.status != .completed, task.status != .canceled, let reminders = task.reminders else { return [] }
        return reminders.compactMap { reminder in
            guard reminder.status == "SCHEDULED" || reminder.status == "SNOOZED",
                  let date = IOSProductCalendar.date(from: reminder.remindAt), date > Date() else { return nil }
            let content = UNMutableNotificationContent()
            content.title = task.title
            content.body = "Task reminder"
            content.sound = .default
            content.userInfo = ["destination": "plan", "taskID": task.id]
            return (date, UNNotificationRequest(
                identifier: taskPrefix + reminder.id,
                content: content,
                trigger: calendarTrigger(for: date)
            ))
        }
    }

    private func focusRequest(for session: FocusSession?) -> UNNotificationRequest? {
        guard let session,
              session.status == .active,
              session.mode == .countdown,
              let plannedSeconds = session.plannedSeconds,
              let startedAt = IOSProductCalendar.date(from: session.startedAt),
              let completionAt = Calendar.current.date(
                  byAdding: .second,
                  value: plannedSeconds + session.accumulatedPauseSecs,
                  to: startedAt),
              completionAt > Date() else { return nil }

        let content = UNMutableNotificationContent()
        content.title = "Focus complete"
        content.body = session.customTitle ?? session.taskTitleSnapshot ?? "Focus session"
        content.sound = .default
        content.userInfo = ["destination": "focus", "focusSessionID": session.id]
        return UNNotificationRequest(
            identifier: focusPrefix + session.id,
            content: content,
            trigger: calendarTrigger(for: completionAt)
        )
    }

    private func calendarTrigger(for date: Date) -> UNCalendarNotificationTrigger {
        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        return UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
    }
}
