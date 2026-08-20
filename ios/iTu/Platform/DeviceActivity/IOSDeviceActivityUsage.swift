import Foundation
import iTuDomain

struct IOSDeviceActivityUsageImport: Sendable {
    let windows: Set<DeviceActivityUsageWindow>
    let applications: [UsageSummary]
}

enum IOSDeviceActivityUsageNormalizer {
    static func normalize(
        _ snapshot: DeviceActivityReportSnapshot,
        deviceID: String,
        timezone: String = iTuCalendarSupport.timezone.identifier
    ) -> IOSDeviceActivityUsageImport {
        let applications = snapshot.applications.compactMap { application -> UsageSummary? in
            guard !application.bundleId.isEmpty, application.activeSeconds > 0 else { return nil }
            return UsageSummary(
                localDate: application.window.localDate,
                hour: application.window.hour,
                bundleId: application.bundleId,
                displayName: application.displayName.isEmpty ? application.bundleId : application.displayName,
                timezone: timezone,
                activeSeconds: application.activeSeconds,
                source: .deviceActivity,
                deviceId: deviceID,
                pickups: application.pickups,
                notifications: application.notifications
            )
        }
        return IOSDeviceActivityUsageImport(
            windows: Set(snapshot.windows),
            applications: applications
        )
    }
}

enum IOSDeviceActivityReportBridge {
    static let fileName = "device-activity-report-v1.json"

    static func fileURL(fileManager: FileManager = .default) -> URL? {
        fileManager.containerURL(forSecurityApplicationGroupIdentifier: IOSAppGroup.identifier)?
            .appendingPathComponent(fileName)
    }

    static func load() -> DeviceActivityReportSnapshot? {
        guard let fileURL = fileURL() else { return nil }
        return try? DeviceActivityReportSnapshotStore(fileURL: fileURL).load()
    }
}
