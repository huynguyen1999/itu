import Foundation
import iTuDomain
import iTuNetworking

/// Orchestrator for Biome device discovery, interval extraction, local durable outbox storage, and backend synchronization.
public actor BiomeImportCoordinator {
    private let source: ScreenTimeUsageSource
    private let stateStore: BiomeImportStateStore
    private let apiClientProvider: (@Sendable () async -> APIClient?)?
    private let macSyncDeviceIdProvider: (@Sendable () async -> String?)?

    private var isImporting = false
    public private(set) var status = ScreenTimeImportStatus()

    public init(
        source: ScreenTimeUsageSource = BiomeScreenTimeSource(),
        stateStore: BiomeImportStateStore = BiomeImportStateStore(),
        apiClientProvider: (@Sendable () async -> APIClient?)? = nil,
        macSyncDeviceIdProvider: (@Sendable () async -> String?)? = nil
    ) {
        self.source = source
        self.stateStore = stateStore
        self.apiClientProvider = apiClientProvider
        self.macSyncDeviceIdProvider = macSyncDeviceIdProvider
    }

    /// Checks the current system permissions and device status without triggering a full scan.
    public func checkStatus() async -> ScreenTimeImportStatus {
        let fdaGranted = BiomeDeviceDiscovery.hasFullDiskAccess()
        var discovered: [ScreenTimeDevice] = []

        if fdaGranted {
            discovered = (try? await source.discoverDevices()) ?? []
        }

        let pendingCount = await stateStore.pendingCount()
        let totalCount = await stateStore.totalImportedCount()

        status = ScreenTimeImportStatus(
            fullDiskAccessGranted: fdaGranted,
            isConnected: !discovered.isEmpty,
            syncedDevices: discovered,
            lastScanAt: status.lastScanAt,
            lastRecordAt: status.lastRecordAt,
            pendingUploadCount: pendingCount,
            totalImportedCount: totalCount,
            lastError: fdaGranted ? nil : "Full Disk Access required to read Screen Time metadata"
        )
        return status
    }

    /// Performs a single cycle of device discovery, SEGB stream parsing, durable persistence, and backend upload.
    @discardableResult
    public func runOnce() async -> ScreenTimeImportStatus {
        guard !isImporting else { return status }
        isImporting = true
        defer { isImporting = false }

        let fdaGranted = BiomeDeviceDiscovery.hasFullDiskAccess()
        guard fdaGranted else {
            status.fullDiskAccessGranted = false
            status.lastError = "Full Disk Access is required"
            return status
        }
        status.fullDiskAccessGranted = true

        var discoveredDevices: [ScreenTimeDevice] = []
        var latestRecordDate: Date? = status.lastRecordAt

        do {
            discoveredDevices = try await source.discoverDevices()
            status.syncedDevices = discoveredDevices
            status.isConnected = !discoveredDevices.isEmpty

            for device in discoveredDevices {
                let existingCursor = await stateStore.cursor(for: device.deviceIdentifier)
                // Default initial watermark: 7 days ago
                let watermark = existingCursor?.lastRecordAt ?? Calendar.current.date(byAdding: .day, value: -7, to: Date())

                let intervals = try await source.intervals(for: device, since: watermark)
                _ = await stateStore.saveIntervalsToOutbox(intervals)

                // Update cursor
                let deviceLatestRecord = intervals.map(\.endedAt).max()
                if let deviceLatestRecord {
                    if latestRecordDate == nil || deviceLatestRecord > latestRecordDate! {
                        latestRecordDate = deviceLatestRecord
                    }
                }

                var newCursor = existingCursor ?? ScreenTimeImportCursor(sourceDeviceId: device.deviceIdentifier)
                newCursor.lastImportAt = Date()
                if let deviceLatestRecord {
                    newCursor.lastRecordAt = max(newCursor.lastRecordAt ?? .distantPast, deviceLatestRecord)
                }
                newCursor.stitchedIntervalCount += intervals.count
                newCursor.lastError = nil
                await stateStore.saveCursor(newCursor)
            }

            // Flush outbox to backend API if client and device ID are available
            await flushPendingOutbox()

            // Prune uploaded entries older than 30 days
            await stateStore.pruneUploaded(olderThanDays: 30)

            status.lastScanAt = Date()
            status.lastRecordAt = latestRecordDate
            status.pendingUploadCount = await stateStore.pendingCount()
            status.totalImportedCount = await stateStore.totalImportedCount()
            status.lastError = nil

        } catch {
            status.lastError = error.localizedDescription
        }

        return status
    }

    /// Resets the watermark cursor for all devices to 7 days ago and performs a full scan.
    public func reimportLast7Days() async -> ScreenTimeImportStatus {
        let devices = (try? await source.discoverDevices()) ?? []
        for device in devices {
            await stateStore.resetCursor(for: device.deviceIdentifier, lookbackDays: 7)
        }
        await stateStore.clearOutbox()
        return await runOnce()
    }

    /// Returns all local outbox intervals for offline aggregation and preview.
    public func allOutboxIntervals() async -> [ImportedUsageInterval] {
        await stateStore.allOutboxItems().map(\.asImportedUsageInterval)
    }

    private func flushPendingOutbox() async {
        guard let apiClient = await apiClientProvider?(),
              let macDeviceId = await macSyncDeviceIdProvider?(),
              !macDeviceId.isEmpty else {
            return
        }

        // Ensure this Mac collector device is registered on the backend
        _ = try? await apiClient.registerSyncDevice(deviceId: macDeviceId, cursor: "")

        let pendingItems = await stateStore.pendingOutboxItems()
        guard !pendingItems.isEmpty else { return }

        // Process in batches of up to 500 items
        let batchSize = 500
        for i in stride(from: 0, to: pendingItems.count, by: batchSize) {
            let chunk = Array(pendingItems[i..<min(i + batchSize, pendingItems.count)])
            let intervals = chunk.map(\.asImportedUsageInterval)

            do {
                try await apiClient.uploadScreenTimeEvents(intervals, collectorDeviceId: macDeviceId)
                await stateStore.markUploaded(eventIds: chunk.map(\.eventId))
            } catch {
                #if DEBUG
                print("[BiomeImport] Upload failed for batch: \(error)")
                #endif
                break
            }
        }
    }
}
