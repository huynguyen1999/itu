@preconcurrency import DeviceActivity
import ExtensionKit
import Foundation
import ManagedSettings
import SwiftUI
import iTuDomain

private enum IOSDeviceActivityReportBridge {
    static let appGroupIdentifier = "group.com.itu.ios"
    static let fileName = "device-activity-report-v1.json"

    static func fileURL(fileManager: FileManager = .default) -> URL? {
        fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(fileName)
    }
}

@main
struct iTuDeviceActivityReportExtension: DeviceActivityReportExtension {
    var body: some DeviceActivityReportScene {
        IOSDeviceActivityReport { _ in
            Color.clear
        }
    }
}

extension DeviceActivityReport.Context {
    static let iTuUsage = Self("iTu Usage")
}

struct IOSDeviceActivityReport: @preconcurrency DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .iTuUsage
    let content: (DeviceActivityReportSnapshot) -> Color

    func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> DeviceActivityReportSnapshot {
        var windows: Set<DeviceActivityUsageWindow> = []
        var applications: [String: DeviceActivityReportApplication] = [:]
        var websites: [String: DeviceActivityReportWebsite] = [:]
        let calendar = iTuCalendarSupport.calendar()

        for await activityData in data {
            for await segment in activityData.activitySegments {
                let components = calendar.dateComponents([.year, .month, .day, .hour], from: segment.dateInterval.start)
                guard let year = components.year, let month = components.month, let day = components.day, let hour = components.hour else { continue }
                let window = DeviceActivityUsageWindow(
                    localDate: String(format: "%04d-%02d-%02d", year, month, day),
                    hour: hour
                )
                windows.insert(window)

                for await category in segment.categories {
                    for await application in category.applications {
                        guard let bundleId = application.application.bundleIdentifier, !bundleId.isEmpty else { continue }
                        let key = "\(window.localDate)|\(window.hour)|\(bundleId)"
                        let existing = applications[key]
                        applications[key] = DeviceActivityReportApplication(
                            window: window,
                            bundleId: bundleId,
                            displayName: application.application.localizedDisplayName ?? bundleId,
                            activeSeconds: (existing?.activeSeconds ?? 0) + max(0, Int(application.totalActivityDuration.rounded())),
                            pickups: (existing?.pickups ?? 0) + max(0, application.numberOfPickups),
                            notifications: (existing?.notifications ?? 0) + max(0, application.numberOfNotifications)
                        )
                    }

                    for await webDomain in category.webDomains {
                        guard let hostname = webDomain.webDomain.domain, !hostname.isEmpty else { continue }
                        let key = "\(window.localDate)|\(window.hour)|\(hostname)"
                        let existing = websites[key]
                        websites[key] = DeviceActivityReportWebsite(
                            window: window,
                            hostname: hostname,
                            activeSeconds: (existing?.activeSeconds ?? 0) + max(0, Int(webDomain.totalActivityDuration.rounded()))
                        )
                    }
                }
            }
        }

        let snapshot = DeviceActivityReportSnapshot(
            capturedAt: ISO8601DateFormatter().string(from: Date()),
            windows: windows.sorted { $0.localDate == $1.localDate ? $0.hour < $1.hour : $0.localDate < $1.localDate },
            applications: applications.values.sorted { $0.bundleId == $1.bundleId ? $0.window.hour < $1.window.hour : $0.bundleId < $1.bundleId },
            websites: websites.values.sorted { $0.hostname == $1.hostname ? $0.window.hour < $1.window.hour : $0.hostname < $1.hostname }
        )
        if let fileURL = IOSDeviceActivityReportBridge.fileURL() {
            try? DeviceActivityReportSnapshotStore(fileURL: fileURL).save(snapshot)
        }
        return snapshot
    }
}
