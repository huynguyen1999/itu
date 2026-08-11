import ApplicationServices
import Foundation

protocol IdleTimeProviding: Sendable {
    func secondsSinceLastInput() -> TimeInterval
}

final class CoreGraphicsIdleMonitor: IdleTimeProviding {
    func secondsSinceLastInput() -> TimeInterval {
        let anyInputType = CGEventType(rawValue: ~0)!
        let seconds = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyInputType)
        return max(0, seconds)
    }
}
