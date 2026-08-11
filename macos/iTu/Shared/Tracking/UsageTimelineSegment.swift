import Foundation

struct UsageTimelineSegment: Codable, Equatable, Identifiable, Sendable {
    enum State: String, Codable, Equatable, Sendable {
        case engaged = "ENGAGED"
        case idle = "IDLE"
    }

    let id: UUID
    let bundleId: String
    let displayName: String
    let startedAt: Date
    let endedAt: Date
    let state: State
    let timezone: String

    var durationSeconds: TimeInterval {
        max(0, endedAt.timeIntervalSince(startedAt))
    }

    init(
        id: UUID = UUID(),
        bundleId: String,
        displayName: String,
        startedAt: Date,
        endedAt: Date,
        state: State,
        timezone: String = TimeZone.current.identifier
    ) {
        self.id = id
        self.bundleId = bundleId
        self.displayName = displayName
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.state = state
        self.timezone = timezone
    }
}
