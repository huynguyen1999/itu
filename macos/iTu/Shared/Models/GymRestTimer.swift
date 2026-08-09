import Foundation

struct GymRestTimer: Equatable, Sendable {
    private(set) var startedAt: Date?
    private(set) var duration: TimeInterval = 0

    var isRunning: Bool { startedAt != nil && remaining > 0 }
    var remaining: TimeInterval {
        guard let startedAt else { return 0 }
        return max(0, duration - Date().timeIntervalSince(startedAt))
    }

    mutating func start(seconds: Int) {
        duration = TimeInterval(max(0, seconds)); startedAt = Date()
    }

    mutating func stop() { startedAt = nil; duration = 0 }
}
