import Foundation

actor UsageSessionStore {
    private let baseURL: URL
    private let accountID: String
    private let calendar: Calendar
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        accountID: String,
        baseURL: URL? = nil,
        calendar: Calendar = .current
    ) {
        self.accountID = accountID
        self.calendar = calendar
        let base = baseURL ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!.appendingPathComponent("iTu")
        self.baseURL = base.appendingPathComponent(accountID).appendingPathComponent("usage-sessions")
        
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        self.encoder = enc

        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        self.decoder = dec
    }

    private func ensureDirectoryExists() throws {
        if !FileManager.default.fileExists(atPath: baseURL.path) {
            try FileManager.default.createDirectory(at: baseURL, withIntermediateDirectories: true)
        }
    }

    func appendSegments(_ newSegments: [UsageTimelineSegment]) throws {
        guard !newSegments.isEmpty else { return }
        try ensureDirectoryExists()

        var grouped: [String: [UsageTimelineSegment]] = [:]
        for segment in newSegments {
            let dayKey = UsageDateFormatter.string(from: segment.startedAt, calendar: calendar)
            grouped[dayKey, default: []].append(segment)
        }

        for (dayKey, segments) in grouped {
            let fileURL = baseURL.appendingPathComponent("\(dayKey).json")
            var existing: [UsageTimelineSegment] = []
            if FileManager.default.fileExists(atPath: fileURL.path),
               let data = try? Data(contentsOf: fileURL),
               let decoded = try? decoder.decode([UsageTimelineSegment].self, from: data) {
                existing = decoded
            }
            existing.append(contentsOf: segments)
            let data = try encoder.encode(existing)
            try data.write(to: fileURL, options: .atomic)
        }
    }

    func segments(from startDate: String? = nil, to endDate: String? = nil) throws -> [UsageTimelineSegment] {
        guard FileManager.default.fileExists(atPath: baseURL.path) else { return [] }
        let files = (try? FileManager.default.contentsOfDirectory(at: baseURL, includingPropertiesForKeys: nil)) ?? []
        var results: [UsageTimelineSegment] = []

        for file in files where file.pathExtension == "json" {
            let dayKey = file.deletingPathExtension().lastPathComponent
            if let start = startDate, dayKey < start { continue }
            if let end = endDate, dayKey > end { continue }

            if let data = try? Data(contentsOf: file),
               let decoded = try? decoder.decode([UsageTimelineSegment].self, from: data) {
                results.append(contentsOf: decoded)
            }
        }
        return results.sorted { $0.startedAt < $1.startedAt }
    }

    func pruneSessions(keeping retentionDays: Int, now: Date = Date()) throws -> Int {
        guard FileManager.default.fileExists(atPath: baseURL.path) else { return 0 }
        let cutoffDate = calendar.date(byAdding: .day, value: -(retentionDays - 1), to: calendar.startOfDay(for: now)) ?? now
        let cutoffKey = UsageDateFormatter.string(from: cutoffDate, calendar: calendar)

        let files = (try? FileManager.default.contentsOfDirectory(at: baseURL, includingPropertiesForKeys: nil)) ?? []
        var deletedCount = 0

        for file in files where file.pathExtension == "json" {
            let dayKey = file.deletingPathExtension().lastPathComponent
            if dayKey < cutoffKey {
                try? FileManager.default.removeItem(at: file)
                deletedCount += 1
            }
        }
        return deletedCount
    }

    func deleteSessions(from fromDate: String? = nil, to toDate: String? = nil, all: Bool = false) throws -> Int {
        guard FileManager.default.fileExists(atPath: baseURL.path) else { return 0 }
        let files = (try? FileManager.default.contentsOfDirectory(at: baseURL, includingPropertiesForKeys: nil)) ?? []
        var deletedCount = 0

        for file in files where file.pathExtension == "json" {
            let dayKey = file.deletingPathExtension().lastPathComponent
            let shouldDelete: Bool
            if all || (fromDate == nil && toDate == nil) {
                shouldDelete = true
            } else {
                let afterFrom = fromDate == nil || dayKey >= fromDate!
                let beforeTo = toDate == nil || dayKey <= toDate!
                shouldDelete = afterFrom && beforeTo
            }

            if shouldDelete {
                try? FileManager.default.removeItem(at: file)
                deletedCount += 1
            }
        }
        return deletedCount
    }
}
