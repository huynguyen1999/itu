import Foundation
import iTuDomain

/// Result of a device Biome scan containing intervals, updated foreground state, and normalization stats.
public struct DeviceScanResult: Sendable {
    public let intervals: [ImportedUsageInterval]
    public let nextState: BiomeForegroundState?
    public let latestRecordDate: Date?
    public let stats: NormalizationStats
    public let scannedFilesCount: Int
    public let decodedFilesCount: Int

    public init(
        intervals: [ImportedUsageInterval],
        nextState: BiomeForegroundState? = nil,
        latestRecordDate: Date? = nil,
        stats: NormalizationStats = NormalizationStats(),
        scannedFilesCount: Int = 0,
        decodedFilesCount: Int = 0
    ) {
        self.intervals = intervals
        self.nextState = nextState
        self.latestRecordDate = latestRecordDate
        self.stats = stats
        self.scannedFilesCount = scannedFilesCount
        self.decodedFilesCount = decodedFilesCount
    }
}

/// Protocol defining a pluggable Screen Time usage provider.
public protocol ScreenTimeUsageSource: Sendable {
    /// Discovers connected/synced Apple devices.
    func discoverDevices() async throws -> [ScreenTimeDevice]

    /// Extracts normalized usage intervals for a specific device starting from a given date.
    func intervals(for device: ScreenTimeDevice, since watermark: Date?) async throws -> [ImportedUsageInterval]

    /// Stateful scan extracting intervals, carrying open foreground state across scans.
    func scanDevice(
        _ device: ScreenTimeDevice,
        since watermark: Date?,
        initialState: BiomeForegroundState?
    ) async throws -> DeviceScanResult
}

extension ScreenTimeUsageSource {
    public func intervals(for device: ScreenTimeDevice, since watermark: Date?) async throws -> [ImportedUsageInterval] {
        let result = try await scanDevice(device, since: watermark, initialState: nil)
        return result.intervals
    }
}
