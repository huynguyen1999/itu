import Foundation
import iTuDomain

/// Concrete implementation of ScreenTimeUsageSource reading from macOS Biome App.InFocus streams.
public final class BiomeScreenTimeSource: ScreenTimeUsageSource, @unchecked Sendable {
    public init() {}

    public func discoverDevices() async throws -> [ScreenTimeDevice] {
        try BiomeDeviceDiscovery.discoverDevices()
    }

    public func scanDevice(
        _ device: ScreenTimeDevice,
        since watermark: Date?,
        initialState: BiomeForegroundState? = nil
    ) async throws -> DeviceScanResult {
        let readResult = try BiomeAppInFocusReader.readEvents(
            for: device,
            since: watermark
        )
        let (intervals, nextState, stats) = BiomeUsageNormalizer.normalize(
            events: readResult.events,
            for: device,
            initialState: initialState
        )
        let latestRecordDate = readResult.events.map(\.timestamp).max() ?? intervals.map(\.endedAt).max()

        return DeviceScanResult(
            intervals: intervals,
            nextState: nextState,
            latestRecordDate: latestRecordDate,
            stats: stats,
            scannedFilesCount: readResult.scannedFilesCount,
            decodedFilesCount: readResult.decodedFilesCount
        )
    }
}
