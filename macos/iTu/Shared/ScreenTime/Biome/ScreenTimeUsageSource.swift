import Foundation
import iTuDomain

/// Protocol defining a pluggable Screen Time usage provider.
public protocol ScreenTimeUsageSource: Sendable {
    /// Discovers connected/synced Apple devices.
    func discoverDevices() async throws -> [ScreenTimeDevice]

    /// Extracts normalized usage intervals for a specific device starting from a given date.
    func intervals(for device: ScreenTimeDevice, since watermark: Date?) async throws -> [ImportedUsageInterval]
}
