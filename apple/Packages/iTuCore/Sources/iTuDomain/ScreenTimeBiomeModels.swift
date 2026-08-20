import Foundation
import CryptoKit

/// Represents a remote synced Apple device discovered from local Biome sync metadata.
public struct ScreenTimeDevice: Codable, Equatable, Identifiable, Sendable {
    public let deviceIdentifier: String
    public let name: String?
    public let model: String?
    public let platform: String?
    public let isMe: Bool
    public let lastSyncDate: Date?

    public var id: String { deviceIdentifier }
    public var displayName: String {
        if let name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return name
        }
        if isMe {
            return "This Mac"
        }
        if platform == "iOS" {
            return "iPhone"
        }
        return model ?? "Apple Device"
    }

    public init(
        deviceIdentifier: String,
        name: String? = nil,
        model: String? = nil,
        platform: String? = nil,
        isMe: Bool = false,
        lastSyncDate: Date? = nil
    ) {
        self.deviceIdentifier = deviceIdentifier
        self.name = name
        self.model = model
        self.platform = platform
        self.isMe = isMe
        self.lastSyncDate = lastSyncDate
    }
}

/// Normalized app usage interval imported from iOS/iPadOS Biome SEGB records on macOS.
public struct ImportedUsageInterval: Codable, Equatable, Identifiable, Sendable {
    public let eventId: String
    public let source: UsageSource
    public let sourceDeviceId: String
    public let sourceDeviceName: String?
    public let bundleId: String
    public let displayName: String
    public let startedAt: Date
    public let endedAt: Date
    public let durationSeconds: Int
    public let observedAt: Date

    public var id: String { eventId }

    public init(
        eventId: String,
        source: UsageSource = .screenTimeBiome,
        sourceDeviceId: String,
        sourceDeviceName: String? = nil,
        bundleId: String,
        displayName: String,
        startedAt: Date,
        endedAt: Date,
        durationSeconds: Int,
        observedAt: Date = Date()
    ) {
        self.eventId = eventId
        self.source = source
        self.sourceDeviceId = sourceDeviceId
        self.sourceDeviceName = sourceDeviceName
        self.bundleId = bundleId
        self.displayName = displayName
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.durationSeconds = durationSeconds
        self.observedAt = observedAt
    }

    /// Computes a deterministic SHA-256 event ID based on device, bundle, start/end epoch seconds, and normalization version.
    public static func deterministicEventID(
        sourceDeviceId: String,
        bundleId: String,
        startedAt: Date,
        endedAt: Date,
        version: Int = 2
    ) -> String {
        let startEpoch = Int64(startedAt.timeIntervalSince1970)
        let endEpoch = Int64(endedAt.timeIntervalSince1970)
        let rawKey = "SCREEN_TIME_BIOME_V\(version)|\(sourceDeviceId)|\(bundleId)|\(startEpoch)|\(endEpoch)"
        let digest = SHA256.hash(data: Data(rawKey.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

/// Represents active foreground session state carried across incremental Biome scans.
public struct BiomeForegroundState: Codable, Equatable, Sendable {
    public let bundleId: String
    public let startedAt: Date
    public let sourceEventFingerprint: String

    public init(bundleId: String, startedAt: Date, sourceEventFingerprint: String) {
        self.bundleId = bundleId
        self.startedAt = startedAt
        self.sourceEventFingerprint = sourceEventFingerprint
    }
}

/// Normalization and stitching statistics recorded per scan.
public struct NormalizationStats: Codable, Equatable, Sendable {
    public var rawEventCount: Int = 0
    public var duplicatesDroppedCount: Int = 0
    public var systemBoundariesCount: Int = 0
    public var strayEventsCount: Int = 0
    public var intervalsProducedCount: Int = 0

    public init(
        rawEventCount: Int = 0,
        duplicatesDroppedCount: Int = 0,
        systemBoundariesCount: Int = 0,
        strayEventsCount: Int = 0,
        intervalsProducedCount: Int = 0
    ) {
        self.rawEventCount = rawEventCount
        self.duplicatesDroppedCount = duplicatesDroppedCount
        self.systemBoundariesCount = systemBoundariesCount
        self.strayEventsCount = strayEventsCount
        self.intervalsProducedCount = intervalsProducedCount
    }
}

/// Upload state for durable outbox records.
public enum ScreenTimeUploadState: String, Codable, Sendable {
    case pending
    case uploaded
}

/// Persistent record in the local outbox.
public struct ScreenTimeOutboxItem: Codable, Equatable, Identifiable, Sendable {
    public let eventId: String
    public let sourceDeviceId: String
    public let sourceDeviceName: String?
    public let bundleId: String
    public let displayName: String
    public let startedAt: Date
    public let endedAt: Date
    public let durationSeconds: Int
    public var uploadState: ScreenTimeUploadState
    public let createdAt: Date

    public var id: String { eventId }

    public init(
        eventId: String,
        sourceDeviceId: String,
        sourceDeviceName: String? = nil,
        bundleId: String,
        displayName: String,
        startedAt: Date,
        endedAt: Date,
        durationSeconds: Int,
        uploadState: ScreenTimeUploadState = .pending,
        createdAt: Date = Date()
    ) {
        self.eventId = eventId
        self.sourceDeviceId = sourceDeviceId
        self.sourceDeviceName = sourceDeviceName
        self.bundleId = bundleId
        self.displayName = displayName
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.durationSeconds = durationSeconds
        self.uploadState = uploadState
        self.createdAt = createdAt
    }

    public var asImportedUsageInterval: ImportedUsageInterval {
        ImportedUsageInterval(
            eventId: eventId,
            source: .screenTimeBiome,
            sourceDeviceId: sourceDeviceId,
            sourceDeviceName: sourceDeviceName,
            bundleId: bundleId,
            displayName: displayName,
            startedAt: startedAt,
            endedAt: endedAt,
            durationSeconds: durationSeconds,
            observedAt: createdAt
        )
    }
}

/// Persistent watermark cursor per synced remote device.
public struct ScreenTimeImportCursor: Codable, Equatable, Sendable {
    public let sourceDeviceId: String
    public var lastRecordAt: Date?
    public var lastImportAt: Date?
    public var parserVersion: String
    public var normalizationVersion: Int
    public var lastRebuildAt: Date?
    public var openForegroundState: BiomeForegroundState?
    public var lastError: String?
    public var scannedFileCount: Int
    public var decodedEventCount: Int
    public var duplicatesDroppedCount: Int
    public var strayEventsCount: Int
    public var stitchedIntervalCount: Int

    public init(
        sourceDeviceId: String,
        lastRecordAt: Date? = nil,
        lastImportAt: Date? = nil,
        parserVersion: String = "2.0",
        normalizationVersion: Int = 2,
        lastRebuildAt: Date? = nil,
        openForegroundState: BiomeForegroundState? = nil,
        lastError: String? = nil,
        scannedFileCount: Int = 0,
        decodedEventCount: Int = 0,
        duplicatesDroppedCount: Int = 0,
        strayEventsCount: Int = 0,
        stitchedIntervalCount: Int = 0
    ) {
        self.sourceDeviceId = sourceDeviceId
        self.lastRecordAt = lastRecordAt
        self.lastImportAt = lastImportAt
        self.parserVersion = parserVersion
        self.normalizationVersion = normalizationVersion
        self.lastRebuildAt = lastRebuildAt
        self.openForegroundState = openForegroundState
        self.lastError = lastError
        self.scannedFileCount = scannedFileCount
        self.decodedEventCount = decodedEventCount
        self.duplicatesDroppedCount = duplicatesDroppedCount
        self.strayEventsCount = strayEventsCount
        self.stitchedIntervalCount = stitchedIntervalCount
    }
}

/// Runtime status exposed to Settings UI and diagnostics.
public struct ScreenTimeImportStatus: Codable, Equatable, Sendable {
    public var fullDiskAccessGranted: Bool
    public var isConnected: Bool
    public var syncedDevices: [ScreenTimeDevice]
    public var lastScanAt: Date?
    public var lastRecordAt: Date?
    public var pendingUploadCount: Int
    public var totalImportedCount: Int
    public var normalizationVersion: Int
    public var lastRebuildAt: Date?
    public var openForegroundApps: [String]
    public var duplicatesDroppedCount: Int
    public var strayEventsCount: Int
    public var lastError: String?

    public init(
        fullDiskAccessGranted: Bool = false,
        isConnected: Bool = false,
        syncedDevices: [ScreenTimeDevice] = [],
        lastScanAt: Date? = nil,
        lastRecordAt: Date? = nil,
        pendingUploadCount: Int = 0,
        totalImportedCount: Int = 0,
        normalizationVersion: Int = 2,
        lastRebuildAt: Date? = nil,
        openForegroundApps: [String] = [],
        duplicatesDroppedCount: Int = 0,
        strayEventsCount: Int = 0,
        lastError: String? = nil
    ) {
        self.fullDiskAccessGranted = fullDiskAccessGranted
        self.isConnected = isConnected
        self.syncedDevices = syncedDevices
        self.lastScanAt = lastScanAt
        self.lastRecordAt = lastRecordAt
        self.pendingUploadCount = pendingUploadCount
        self.totalImportedCount = totalImportedCount
        self.normalizationVersion = normalizationVersion
        self.lastRebuildAt = lastRebuildAt
        self.openForegroundApps = openForegroundApps
        self.duplicatesDroppedCount = duplicatesDroppedCount
        self.strayEventsCount = strayEventsCount
        self.lastError = lastError
    }
}

/// Selection scope for device filtering in Screen Time reporting.
public enum UsageDeviceScope: Equatable, Hashable, Sendable {
    case all
    case device(id: String, name: String?)

    public var id: String {
        switch self {
        case .all: return "all"
        case .device(let id, _): return id
        }
    }

    public var displayName: String {
        switch self {
        case .all: return "All Devices"
        case .device(_, let name): return name ?? "Device"
        }
    }
}

public struct ScreenTimeHourlyBucket: Codable, Equatable, Sendable, Identifiable {
    public let hour: Int
    public let screenTimeSeconds: Int
    public var id: Int { hour }

    public init(hour: Int, screenTimeSeconds: Int) {
        self.hour = hour
        self.screenTimeSeconds = screenTimeSeconds
    }
}

public struct ScreenTimeDailyBucket: Codable, Equatable, Sendable, Identifiable {
    public let localDate: String
    public let screenTimeSeconds: Int
    public var id: String { localDate }

    public init(localDate: String, screenTimeSeconds: Int) {
        self.localDate = localDate
        self.screenTimeSeconds = screenTimeSeconds
    }
}

public struct ScreenTimeDeviceSummary: Codable, Equatable, Sendable, Identifiable {
    public let deviceId: String
    public let name: String?
    public let platform: String?
    public let screenTimeSeconds: Int
    public var id: String { deviceId }

    public init(deviceId: String, name: String? = nil, platform: String? = nil, screenTimeSeconds: Int = 0) {
        self.deviceId = deviceId
        self.name = name
        self.platform = platform
        self.screenTimeSeconds = screenTimeSeconds
    }
}

public struct ScreenTimeAppStatistic: Codable, Equatable, Sendable, Identifiable {
    public let bundleId: String
    public let displayName: String
    public let activeSeconds: Int
    public let iconHash: String?
    public let iconUrl: String?
    public var id: String { bundleId }

    public init(bundleId: String, displayName: String, activeSeconds: Int, iconHash: String? = nil, iconUrl: String? = nil) {
        self.bundleId = bundleId
        self.displayName = displayName
        self.activeSeconds = activeSeconds
        self.iconHash = iconHash
        self.iconUrl = iconUrl
    }
}

public struct ScreenTimeHourlyAppStatistic: Codable, Equatable, Sendable, Identifiable {
    public let localDate: String
    public let hour: Int
    public let bundleId: String
    public let displayName: String
    public let activeSeconds: Int
    public var id: String { "\(localDate)|\(hour)|\(bundleId)" }

    public init(localDate: String, hour: Int, bundleId: String, displayName: String, activeSeconds: Int) {
        self.localDate = localDate
        self.hour = hour
        self.bundleId = bundleId
        self.displayName = displayName
        self.activeSeconds = activeSeconds
    }
}

public struct ScreenTimeDailyAppStatistic: Codable, Equatable, Sendable, Identifiable {
    public let localDate: String
    public let bundleId: String
    public let displayName: String
    public let activeSeconds: Int
    public var id: String { "\(localDate)|\(bundleId)" }

    public init(localDate: String, bundleId: String, displayName: String, activeSeconds: Int) {
        self.localDate = localDate
        self.bundleId = bundleId
        self.displayName = displayName
        self.activeSeconds = activeSeconds
    }
}

public struct ScreenTimeCoverage: Codable, Equatable, Sendable {
    public let intervalCount: Int
    public let firstEventAt: String?
    public let lastEventAt: String?

    public init(intervalCount: Int = 0, firstEventAt: String? = nil, lastEventAt: String? = nil) {
        self.intervalCount = intervalCount
        self.firstEventAt = firstEventAt
        self.lastEventAt = lastEventAt
    }
}

public struct ScreenTimeStatistics: Codable, Equatable, Sendable {
    public let from: String
    public let to: String
    public let timezone: String
    public let selectedDeviceScope: String
    public let screenTimeSeconds: Int
    public let hourlyScreenTime: [ScreenTimeHourlyBucket]
    public let dailyScreenTime: [ScreenTimeDailyBucket]
    public let apps: [ScreenTimeAppStatistic]
    public let hourlyApps: [ScreenTimeHourlyAppStatistic]
    public let dailyApps: [ScreenTimeDailyAppStatistic]
    public let devices: [ScreenTimeDeviceSummary]
    public let coverage: ScreenTimeCoverage

    public init(
        from: String,
        to: String,
        timezone: String,
        selectedDeviceScope: String = "all",
        screenTimeSeconds: Int = 0,
        hourlyScreenTime: [ScreenTimeHourlyBucket] = [],
        dailyScreenTime: [ScreenTimeDailyBucket] = [],
        apps: [ScreenTimeAppStatistic] = [],
        hourlyApps: [ScreenTimeHourlyAppStatistic] = [],
        dailyApps: [ScreenTimeDailyAppStatistic] = [],
        devices: [ScreenTimeDeviceSummary] = [],
        coverage: ScreenTimeCoverage = ScreenTimeCoverage(intervalCount: 0)
    ) {
        self.from = from
        self.to = to
        self.timezone = timezone
        self.selectedDeviceScope = selectedDeviceScope
        self.screenTimeSeconds = screenTimeSeconds
        self.hourlyScreenTime = hourlyScreenTime
        self.dailyScreenTime = dailyScreenTime
        self.apps = apps
        self.hourlyApps = hourlyApps
        self.dailyApps = dailyApps
        self.devices = devices
        self.coverage = coverage
    }
}

extension ScreenTimeStatistics {
    public var asUsageStatistics: UsageStatistics {
        let totalActive = self.screenTimeSeconds
        let top = self.apps.map { app in
            UsageTopApp(
                bundleId: app.bundleId,
                displayName: app.displayName,
                activeSeconds: app.activeSeconds,
                engagedSeconds: nil
            )
        }
        let dailyTotals = self.dailyScreenTime.map { d in
            UsageDailyTotal(
                localDate: d.localDate,
                activeSeconds: d.screenTimeSeconds,
                engagedSeconds: nil
            )
        }
        let dailyAppStats = self.dailyApps.map { da in
            UsageDailyApp(
                localDate: da.localDate,
                bundleId: da.bundleId,
                displayName: da.displayName,
                activeSeconds: da.activeSeconds,
                engagedSeconds: nil
            )
        }
        let hourlyAppStats = self.hourlyApps.map { ha in
            UsageHourlyApp(
                localDate: ha.localDate,
                hour: ha.hour,
                bundleId: ha.bundleId,
                displayName: ha.displayName,
                activeSeconds: ha.activeSeconds,
                engagedSeconds: nil
            )
        }
        return UsageStatistics(
            totalActiveSeconds: totalActive,
            totalEngagedSeconds: nil,
            engagementCoverage: nil,
            topApps: top,
            daily: dailyTotals,
            dailyApps: dailyAppStats,
            hourlyApps: hourlyAppStats
        )
    }
}

extension ImportedUsageInterval {
    public func asUsageSummaries(timeZone: TimeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? .current) -> [UsageSummary] {
        guard durationSeconds > 0, startedAt < endedAt else { return [] }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let spanMs = max(1000, endedAt.timeIntervalSince(startedAt) * 1000)
        var slices: [UsageSummary] = []
        var cursor = startedAt
        var allocatedSeconds = 0

        while cursor < endedAt {
            let nextHourInterval = calendar.dateInterval(of: .hour, for: cursor)?.end ?? cursor.addingTimeInterval(3600)
            let segmentEnd = min(endedAt, nextHourInterval)
            let segmentMs = segmentEnd.timeIntervalSince(cursor) * 1000
            let dateKey = String(format: "%04d-%02d-%02d", calendar.component(.year, from: cursor), calendar.component(.month, from: cursor), calendar.component(.day, from: cursor))
            let hour = calendar.component(.hour, from: cursor)
            let sliceSeconds = max(0, Int(round((segmentMs / spanMs) * Double(durationSeconds))))

            if sliceSeconds > 0 {
                slices.append(UsageSummary(
                    localDate: dateKey,
                    hour: hour,
                    bundleId: bundleId,
                    displayName: displayName,
                    timezone: timeZone.identifier,
                    activeSeconds: sliceSeconds,
                    source: .screenTimeBiome,
                    deviceId: sourceDeviceId
                ))
                allocatedSeconds += sliceSeconds
            }
            cursor = segmentEnd
        }
        let diff = durationSeconds - allocatedSeconds
        if diff != 0, !slices.isEmpty {
            slices[slices.count - 1].activeSeconds = max(0, slices[slices.count - 1].activeSeconds + diff)
        }
        return slices.filter { $0.activeSeconds > 0 }
    }
}
