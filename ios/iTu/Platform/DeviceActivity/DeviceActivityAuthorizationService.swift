import Combine
import Foundation

// FamilyControls and DeviceActivity are intentionally disabled for personal
// development teams. Restore the framework implementation when the required
// Apple capabilities and provisioning profiles are available.

enum IOSDeviceActivityAuthorizationState: Equatable {
    case disabled

    var title: String { "Disabled for personal development" }
}

@MainActor
final class IOSDeviceActivityAuthorizationService: ObservableObject {
    @Published private(set) var state: IOSDeviceActivityAuthorizationState = .disabled
    @Published private(set) var errorMessage: String?
    @Published private(set) var isRequesting = false

    func refresh() {
        state = .disabled
    }

    func requestAuthorization() async {
        state = .disabled
    }
}

enum IOSDeviceActivityMonitoring {
    static let activityIdentifier = "com.itu.ios.daily"

    static func isMonitoring() -> Bool { false }

    static func start() throws {
        throw IOSDeviceActivityError.disabled
    }

    static func stop() {}
}

private enum IOSDeviceActivityError: LocalizedError {
    case disabled

    var errorDescription: String? {
        "Screen Time monitoring is disabled for personal development teams."
    }
}

struct IOSDeviceActivityMonitorStatus: Equatable {
    let activityName: String
    let event: String
    let updatedAt: Date
}

enum IOSDeviceActivityMonitorStatusStore {
    static let groupIdentifier = "group.com.itu.ios"
    static let activityKey = "deviceActivity.monitor.activity"
    static let eventKey = "deviceActivity.monitor.event"
    static let updatedAtKey = "deviceActivity.monitor.updatedAt"

    static func load(defaults: UserDefaults? = UserDefaults(suiteName: groupIdentifier)) -> IOSDeviceActivityMonitorStatus? {
        guard let defaults,
              let activityName = defaults.string(forKey: activityKey),
              let event = defaults.string(forKey: eventKey),
              let updatedAt = defaults.object(forKey: updatedAtKey) as? Date else { return nil }
        return IOSDeviceActivityMonitorStatus(activityName: activityName, event: event, updatedAt: updatedAt)
    }
}
