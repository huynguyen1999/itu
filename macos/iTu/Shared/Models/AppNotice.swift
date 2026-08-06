import Foundation

enum NoticeLevel: String, Sendable {
    case info
    case success
    case warning
    case error
}

enum NoticePresentation: String, Sendable {
    case toast
    case inline
    case blockingDecision
}

/// Structured user-facing application notice replacing global blocking alerts.
struct AppNotice: Identifiable, Equatable, Sendable {
    let id: UUID
    let level: NoticeLevel
    let presentation: NoticePresentation
    let title: String
    let message: String?
    let timestamp: Date

    init(
        id: UUID = UUID(),
        level: NoticeLevel = .info,
        presentation: NoticePresentation = .toast,
        title: String,
        message: String? = nil,
        timestamp: Date = Date()
    ) {
        self.id = id
        self.level = level
        self.presentation = presentation
        self.title = title
        self.message = message
        self.timestamp = timestamp
    }

    static func == (lhs: AppNotice, rhs: AppNotice) -> Bool {
        lhs.id == rhs.id
    }
}
