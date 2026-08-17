import DeviceActivity
import Foundation

final class DeviceActivityMonitorExtension: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        publish(event: "interval-started", activity: activity)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        publish(event: "interval-ended", activity: activity)
    }

    private func publish(event: String, activity: DeviceActivityName) {
        let defaults = UserDefaults(suiteName: "group.com.itu.ios")
        defaults?.set(activity.rawValue, forKey: "deviceActivity.monitor.activity")
        defaults?.set(event, forKey: "deviceActivity.monitor.event")
        defaults?.set(Date(), forKey: "deviceActivity.monitor.updatedAt")
    }
}
