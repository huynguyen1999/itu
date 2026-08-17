import Foundation
import iTuDomain

enum IOSDestination: String, CaseIterable, Identifiable, Hashable {
    case home
    case plan
    case focus
    case calendar
    case habits
    case more
    case learn
    case gym
    case budget
    case growth
    case journal
    case matrix
    case statistics
    case health
    case notifications
    case conflicts
    case trash
    case profile
    case settings

    var id: String { rawValue }
    var title: String {
        switch self {
        case .home: "Home"
        case .plan: "Plan"
        case .focus: "Focus"
        case .calendar: "Calendar"
        case .habits: "Habits"
        case .more: "More"
        case .learn: "Learn"
        case .gym: "Gym"
        case .budget: "Budget"
        case .growth: "Growth"
        case .journal: "Journal"
        case .matrix: "Matrix"
        case .statistics: "Statistics"
        case .health: "Health"
        case .notifications: "Notifications"
        case .conflicts: "Conflicts"
        case .trash: "Trash"
        case .profile: "Profile"
        case .settings: "Settings"
        }
    }
    var systemImage: String {
        switch self {
        case .home: "house.fill"
        case .plan: "checklist"
        case .focus: "timer"
        case .calendar: "calendar"
        case .habits: "repeat.circle"
        case .more: "ellipsis.circle"
        case .learn: "graduationcap"
        case .gym: "figure.strengthtraining.traditional"
        case .budget: "wallet.pass"
        case .growth: "chart.line.uptrend.xyaxis"
        case .journal: "note.text"
        case .matrix: "square.grid.2x2"
        case .statistics: "chart.bar.xaxis"
        case .health: "heart.text.square"
        case .notifications: "bell.badge"
        case .conflicts: "arrow.triangle.2.circlepath"
        case .trash: "trash"
        case .profile: "person.crop.circle"
        case .settings: "gearshape"
        }
    }
}

struct IOSNavigationRequest: Identifiable, Equatable {
    let id: UUID
    let destination: IOSDestination

    init(destination: IOSDestination) {
        id = UUID()
        self.destination = destination
    }
}

enum IOSSyncPhase: String, Equatable {
    case offline
    case pending
    case syncing
    case upToDate = "up-to-date"
    case conflict
    case error

    var title: String {
        switch self {
        case .offline: "Offline"
        case .pending: "Pending"
        case .syncing: "Syncing"
        case .upToDate: "Up to date"
        case .conflict: "Needs attention"
        case .error: "Sync failed"
        }
    }
}

enum IOSMoreSection: String, CaseIterable, Identifiable {
    case tracking
    case learningAndGrowth
    case system

    var id: Self { self }

    var title: String {
        switch self {
        case .tracking: "Tracking"
        case .learningAndGrowth: "Learning & Growth"
        case .system: "System"
        }
    }
}

struct IOSCalendarTimelineItem: Identifiable, Equatable {
    let id: String
    let title: String
    let startAt: String
    let endAt: String?
    let isDue: Bool
}

extension IOSProductCalendar {
    static func date(from value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: value) { return date }

        let localFormatter = DateFormatter()
        localFormatter.locale = Locale(identifier: "en_US_POSIX")
        localFormatter.calendar = iTuCalendarSupport.calendar()
        localFormatter.timeZone = timezone
        localFormatter.dateFormat = "yyyy-MM-dd"
        return localFormatter.date(from: value)
    }

    static func timestamp(from date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func taskScheduleValidation(start: Date?, end: Date?) -> String? {
        guard let start, let end, end < start else { return nil }
        return "Scheduled end must be at or after scheduled start."
    }

    static func timeline(for tasks: [ProductivityTask], day: String) -> [IOSCalendarTimelineItem] {
        tasks.compactMap { task in
            let scheduledStart: String? = task.scheduledStartAt.flatMap { value in
                guard let date = date(from: value), dayString(date) == day else { return nil }
                return value
            }
            let dueAt: String? = task.dueAt.flatMap { value in
                guard let date = date(from: value), dayString(date) == day else { return nil }
                return value
            }
            guard let startAt = scheduledStart ?? dueAt else { return nil }
            return IOSCalendarTimelineItem(
                id: task.id,
                title: task.title,
                startAt: startAt,
                endAt: scheduledStart.flatMap { _ in task.scheduledEndAt },
                isDue: scheduledStart == nil
            )
        }
        .sorted {
            guard let left = date(from: $0.startAt), let right = date(from: $1.startAt) else {
                return $0.startAt < $1.startAt
            }
            return left < right
        }
    }
}
