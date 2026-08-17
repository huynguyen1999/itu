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

    /// Computes a deterministic SHA-256 event ID based on device, bundle, and start/end epoch seconds.
    public static func deterministicEventID(
        sourceDeviceId: String,
        bundleId: String,
        startedAt: Date,
        endedAt: Date
    ) -> String {
        let startEpoch = Int64(startedAt.timeIntervalSince1970)
        let endEpoch = Int64(endedAt.timeIntervalSince1970)
        let rawKey = "SCREEN_TIME_BIOME|\(sourceDeviceId)|\(bundleId)|\(startEpoch)|\(endEpoch)"
        let digest = SHA256.hash(data: Data(rawKey.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
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
    public var lastError: String?
    public var scannedFileCount: Int
    public var decodedEventCount: Int
    public var stitchedIntervalCount: Int

    public init(
        sourceDeviceId: String,
        lastRecordAt: Date? = nil,
        lastImportAt: Date? = nil,
        parserVersion: String = "1.0",
        lastError: String? = nil,
        scannedFileCount: Int = 0,
        decodedEventCount: Int = 0,
        stitchedIntervalCount: Int = 0
    ) {
        self.sourceDeviceId = sourceDeviceId
        self.lastRecordAt = lastRecordAt
        self.lastImportAt = lastImportAt
        self.parserVersion = parserVersion
        self.lastError = lastError
        self.scannedFileCount = scannedFileCount
        self.decodedEventCount = decodedEventCount
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
    public var lastError: String?

    public init(
        fullDiskAccessGranted: Bool = false,
        isConnected: Bool = false,
        syncedDevices: [ScreenTimeDevice] = [],
        lastScanAt: Date? = nil,
        lastRecordAt: Date? = nil,
        pendingUploadCount: Int = 0,
        totalImportedCount: Int = 0,
        lastError: String? = nil
    ) {
        self.fullDiskAccessGranted = fullDiskAccessGranted
        self.isConnected = isConnected
        self.syncedDevices = syncedDevices
        self.lastScanAt = lastScanAt
        self.lastRecordAt = lastRecordAt
        self.pendingUploadCount = pendingUploadCount
        self.totalImportedCount = totalImportedCount
        self.lastError = lastError
    }
}
