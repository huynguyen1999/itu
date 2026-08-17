import Foundation

enum IOSDeepLink: Equatable {
    case home
    case plan
    case focus(sessionID: String?)
    case habits
    case more
    case learn
    case gym
    case budget
    case growth
    case journal
    case matrix
    case statistics
    case notifications
    case conflicts
    case trash
    case profile
    case settings

    init?(url: URL) {
        guard url.scheme?.lowercased() == "itu" else { return nil }
        let host = url.host?.lowercased()
        let path = url.pathComponents.dropFirst().filter { $0 != "/" }
        switch host {
        case "home", "today": self = .home
        case "plan": self = .plan
        case "habits": self = .habits
        case "more": self = .more
        case "learn": self = .learn
        case "gym": self = .gym
        case "budget": self = .budget
        case "growth": self = .growth
        case "journal": self = .journal
        case "matrix": self = .matrix
        case "statistics": self = .statistics
        case "notifications": self = .notifications
        case "conflicts": self = .conflicts
        case "trash": self = .trash
        case "profile": self = .profile
        case "settings": self = .settings
        case "focus": self = .focus(sessionID: path.first)
        default: return nil
        }
    }

    var destinationRawValue: String {
        switch self {
        case .home: "home"
        case .plan: "plan"
        case .focus: "focus"
        case .habits: "habits"
        case .more: "more"
        case .learn: "learn"
        case .gym: "gym"
        case .budget: "budget"
        case .growth: "growth"
        case .journal: "journal"
        case .matrix: "matrix"
        case .statistics: "statistics"
        case .notifications: "notifications"
        case .conflicts: "conflicts"
        case .trash: "trash"
        case .profile: "profile"
        case .settings: "settings"
        }
    }
}
