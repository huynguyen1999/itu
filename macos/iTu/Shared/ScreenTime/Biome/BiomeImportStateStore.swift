import Foundation
import iTuDomain

/// Actor responsible for local durable storage of Screen Time import cursors and outbox intervals.
public actor BiomeImportStateStore {
    private let stateDirectory: URL
    private let cursorsFileURL: URL
    private let outboxFileURL: URL

    private var cursors: [String: ScreenTimeImportCursor] = [:]
    private var outbox: [String: ScreenTimeOutboxItem] = [:]
    private var isLoaded = false

    public init(storageDirectory: URL? = nil) {
        if let storageDirectory {
            self.stateDirectory = storageDirectory
        } else {
            let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            self.stateDirectory = appSupport.appendingPathComponent("iTu/screentime", isDirectory: true)
        }
        self.cursorsFileURL = stateDirectory.appendingPathComponent("cursors.json")
        self.outboxFileURL = stateDirectory.appendingPathComponent("outbox.json")
    }

    private func ensureLoaded() {
        guard !isLoaded else { return }
        isLoaded = true

        let fileManager = FileManager.default
        if !fileManager.fileExists(atPath: stateDirectory.path) {
            try? fileManager.createDirectory(at: stateDirectory, withIntermediateDirectories: true)
        }

        // Load cursors
        if let data = try? Data(contentsOf: cursorsFileURL),
           let decoded = try? JSONDecoder().decode([String: ScreenTimeImportCursor].self, from: data) {
            self.cursors = decoded
        }

        // Load outbox
        if let data = try? Data(contentsOf: outboxFileURL),
           let decoded = try? JSONDecoder().decode([String: ScreenTimeOutboxItem].self, from: data) {
            self.outbox = decoded
            pruneInvalidTimestamps()
        }
    }

    private func persistCursors() {
        guard let data = try? JSONEncoder().encode(cursors) else { return }
        try? data.write(to: cursorsFileURL, options: .atomic)
    }

    private func persistOutbox() {
        guard let data = try? JSONEncoder().encode(outbox) else { return }
        try? data.write(to: outboxFileURL, options: .atomic)
    }

    public func cursor(for deviceId: String) -> ScreenTimeImportCursor? {
        ensureLoaded()
        return cursors[deviceId]
    }

    public func saveCursor(_ cursor: ScreenTimeImportCursor) {
        ensureLoaded()
        cursors[cursor.sourceDeviceId] = cursor
        persistCursors()
    }

    public func resetCursor(for deviceId: String, lookbackDays: Int = 7) {
        ensureLoaded()
        let resetDate = Calendar.current.date(byAdding: .day, value: -lookbackDays, to: Date())
        var current = cursors[deviceId] ?? ScreenTimeImportCursor(sourceDeviceId: deviceId)
        current.lastRecordAt = resetDate
        current.lastImportAt = nil
        current.lastError = nil
        cursors[deviceId] = current
        persistCursors()
    }

    public func saveIntervalsToOutbox(_ intervals: [ImportedUsageInterval]) -> Int {
        ensureLoaded()
        var insertedCount = 0

        for interval in intervals {
            if outbox[interval.eventId] == nil {
                outbox[interval.eventId] = ScreenTimeOutboxItem(
                    eventId: interval.eventId,
                    sourceDeviceId: interval.sourceDeviceId,
                    sourceDeviceName: interval.sourceDeviceName,
                    bundleId: interval.bundleId,
                    displayName: interval.displayName,
                    startedAt: interval.startedAt,
                    endedAt: interval.endedAt,
                    durationSeconds: interval.durationSeconds,
                    uploadState: .pending,
                    createdAt: Date()
                )
                insertedCount += 1
            }
        }

        if insertedCount > 0 {
            persistOutbox()
        }
        return insertedCount
    }

    public func pendingOutboxItems() -> [ScreenTimeOutboxItem] {
        ensureLoaded()
        return outbox.values
            .filter { $0.uploadState == .pending }
            .sorted { $0.startedAt < $1.startedAt }
    }

    public func allOutboxItems() -> [ScreenTimeOutboxItem] {
        ensureLoaded()
        return outbox.values.sorted { $0.startedAt < $1.startedAt }
    }

    public func markUploaded(eventIds: [String]) {
        ensureLoaded()
        var changed = false
        for id in eventIds {
            if var item = outbox[id], item.uploadState != .uploaded {
                item.uploadState = .uploaded
                outbox[id] = item
                changed = true
            }
        }
        if changed {
            persistOutbox()
        }
    }

    public func pendingCount() -> Int {
        ensureLoaded()
        return outbox.values.filter { $0.uploadState == .pending }.count
    }

    public func totalImportedCount() -> Int {
        ensureLoaded()
        return outbox.count
    }

    public func clearOutbox() {
        ensureLoaded()
        outbox.removeAll()
        persistOutbox()
    }

    public func pruneInvalidTimestamps() {
        let maxValidFuture = Date().addingTimeInterval(86400 * 2)
        let minValidPast = Date(timeIntervalSince1970: 1577836800) // 2020-01-01
        let initialCount = outbox.count
        outbox = outbox.filter { _, item in
            if BiomeUsageNormalizer.isSystemExcluded(bundleId: item.bundleId) {
                return false
            }
            return item.startedAt >= minValidPast && item.startedAt <= maxValidFuture
        }
        if outbox.count != initialCount {
            persistOutbox()
        }
    }

    public func pruneUploaded(olderThanDays: Int = 30) {
        ensureLoaded()
        let cutoff = Calendar.current.date(byAdding: .day, value: -olderThanDays, to: Date()) ?? Date()
        let initialCount = outbox.count
        outbox = outbox.filter { _, item in
            if item.uploadState == .uploaded && item.endedAt < cutoff {
                return false
            }
            return true
        }
        if outbox.count != initialCount {
            persistOutbox()
        }
    }
}
