import Foundation
import iTuDomain

/// Concrete implementation of ScreenTimeUsageSource reading from macOS Biome App.InFocus streams.
public final class BiomeScreenTimeSource: ScreenTimeUsageSource, @unchecked Sendable {
    public init() {}

    public func discoverDevices() async throws -> [ScreenTimeDevice] {
        try BiomeDeviceDiscovery.discoverDevices()
    }

    public func intervals(
        for device: ScreenTimeDevice,
        since watermark: Date?
    ) async throws -> [ImportedUsageInterval] {
        let readResult = try BiomeAppInFocusReader.readEvents(
            for: device.deviceIdentifier,
            since: watermark
        )
        return BiomeUsageNormalizer.normalize(
            events: readResult.events,
            for: device
        )
    }
}
