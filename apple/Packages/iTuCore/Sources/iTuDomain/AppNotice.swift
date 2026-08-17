import Foundation

public enum NoticeLevel: String, Sendable {
    case info
    case success
    case warning
    case error
}

public enum NoticePresentation: String, Sendable {
    case toast
    case inline
    case blockingDecision
}

public struct AppNotice: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let level: NoticeLevel
    public let presentation: NoticePresentation
    public let title: String
    public let message: String?
    public let timestamp: Date

    public init(
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

    public static func == (lhs: AppNotice, rhs: AppNotice) -> Bool {
        lhs.id == rhs.id
    }
}
