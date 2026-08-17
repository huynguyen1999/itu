import Foundation

public struct DeviceActivityUsageWindow: Codable, Equatable, Hashable, Sendable {
    public let localDate: String
    public let hour: Int

    public init(localDate: String, hour: Int) {
        self.localDate = localDate
        self.hour = hour
    }
}

public struct DeviceActivityReportApplication: Codable, Equatable, Sendable {
    public let window: DeviceActivityUsageWindow
    public let bundleId: String
    public let displayName: String
    public let activeSeconds: Int
    public let pickups: Int
    public let notifications: Int

    public init(
        window: DeviceActivityUsageWindow,
        bundleId: String,
        displayName: String,
        activeSeconds: Int,
        pickups: Int = 0,
        notifications: Int = 0
    ) {
        self.window = window
        self.bundleId = bundleId
        self.displayName = displayName
        self.activeSeconds = activeSeconds
        self.pickups = pickups
        self.notifications = notifications
    }
}

public struct DeviceActivityReportWebsite: Codable, Equatable, Sendable {
    public let window: DeviceActivityUsageWindow
    public let hostname: String
    public let activeSeconds: Int

    public init(window: DeviceActivityUsageWindow, hostname: String, activeSeconds: Int) {
        self.window = window
        self.hostname = hostname
        self.activeSeconds = activeSeconds
    }
}

public struct DeviceActivityReportSnapshot: Codable, Equatable, Sendable {
    public let capturedAt: String
    public let windows: [DeviceActivityUsageWindow]
    public let applications: [DeviceActivityReportApplication]
    public let websites: [DeviceActivityReportWebsite]

    public init(
        capturedAt: String,
        windows: [DeviceActivityUsageWindow],
        applications: [DeviceActivityReportApplication],
        websites: [DeviceActivityReportWebsite]
    ) {
        self.capturedAt = capturedAt
        self.windows = windows
        self.applications = applications
        self.websites = websites
    }
}

public struct DeviceActivityReportSnapshotStore: Sendable {
    public let fileURL: URL

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    public func load() throws -> DeviceActivityReportSnapshot {
        let data = try Data(contentsOf: fileURL)
        return try JSONDecoder().decode(DeviceActivityReportSnapshot.self, from: data)
    }

    public func save(_ snapshot: DeviceActivityReportSnapshot) throws {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: fileURL, options: .atomic)
    }
}
