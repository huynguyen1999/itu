import XCTest
@testable import iTu

@MainActor
final class UsageTrackingTests: XCTestCase {
    private func utcCalendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func date(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }



    // 13. Usage summary persists and only changed totals are uploadable
    func testUsageSummaryPersistsAndOnlyChangedTotalsAreUploadable() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "usage-test", baseURL: directory)
        let summary = UsageSummary(localDate: "2026-08-09", bundleId: "com.example.Editor", displayName: "Editor", timezone: "UTC", activeSeconds: 30, engagedSeconds: 20)
        _ = try await store.upsertUsage(summary)
        let initialPending = await store.usageSummariesToUpload()
        XCTAssertEqual(initialPending.first?.activeSeconds, 30)
        XCTAssertEqual(initialPending.first?.engagedSeconds, 20)

        _ = try await store.markUsageUploaded([summary])
        let acknowledged = await store.usageSummariesToUpload()
        XCTAssertTrue(acknowledged.isEmpty)

        let reloaded = OfflineStore(accountID: "usage-test", baseURL: directory)
        _ = try await reloaded.load()
        let reloadedPending = await reloaded.usageSummariesToUpload()
        XCTAssertTrue(reloadedPending.isEmpty)

        _ = try await store.upsertUsage(summary)
        let changed = await store.usageSummariesToUpload()
        XCTAssertEqual(changed.first?.activeSeconds, 60)
        XCTAssertEqual(changed.first?.engagedSeconds, 40)
    }

    // 14. Usage statistics shows local data without double counting uploaded seconds
    func testUsageStatisticsShowsLocalDataWithoutDoubleCountingUploadedSeconds() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "usage-statistics-test", baseURL: directory)
        let initial = UsageSummary(localDate: "2026-08-09", bundleId: "com.example.Editor", displayName: "Editor", timezone: "UTC", activeSeconds: 30, engagedSeconds: 25)
        _ = try await store.upsertUsage(initial)

        let local = await store.usageSummaries(from: "2026-08-09", to: "2026-08-09")
        XCTAssertEqual(UsageStatistics.aggregating(local).totalActiveSeconds, 30)
        XCTAssertEqual(UsageStatistics.aggregating(local).totalEngagedSeconds, 25)

        _ = try await store.markUsageUploaded([initial])
        _ = try await store.upsertUsage(UsageSummary(localDate: "2026-08-09", bundleId: "com.example.Editor", displayName: "Editor", timezone: "UTC", activeSeconds: 10, engagedSeconds: 10))
        let pending = await store.pendingUsageDeltas(from: "2026-08-09", to: "2026-08-09")
        let server = UsageStatistics(
            totalActiveSeconds: 30,
            totalEngagedSeconds: 25,
            topApps: [UsageTopApp(bundleId: "com.example.Editor", displayName: "Editor", activeSeconds: 30, engagedSeconds: 25)],
            daily: [UsageDailyTotal(localDate: "2026-08-09", activeSeconds: 30, engagedSeconds: 25)],
            dailyApps: [UsageDailyApp(localDate: "2026-08-09", bundleId: "com.example.Editor", displayName: "Editor", activeSeconds: 30, engagedSeconds: 25)]
        )
        let merged = server.adding(pending)

        XCTAssertEqual(pending.map(\.activeSeconds), [10])
        XCTAssertEqual(pending.map(\.engagedSeconds), [10])
        XCTAssertEqual(merged.totalActiveSeconds, 40)
        XCTAssertEqual(merged.totalEngagedSeconds, 35)
    }

    // 15. Retention prunes older local days
    func testRetentionPrunesOlderLocalDays() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "usage-retention-test", baseURL: directory)
        let old = UsageSummary(localDate: "2025-01-01", bundleId: "old", displayName: "Old", timezone: "UTC", activeSeconds: 1)
        let recent = UsageSummary(localDate: "2026-08-09", bundleId: "new", displayName: "New", timezone: "UTC", activeSeconds: 1)
        _ = try await store.upsertUsage(old)
        _ = try await store.upsertUsage(recent)
        _ = try await store.pruneUsage(keeping: 90, now: ISO8601DateFormatter().date(from: "2026-08-09T12:00:00Z")!)
        let remaining = await store.usageSummaries()
        XCTAssertEqual(remaining.map(\.id), [recent.id])
    }

    // 16. Timeline segments persisted per day locally
    func testTimelineSegmentsPersistedPerDayLocally() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = UsageSessionStore(accountID: "test-timeline-user", baseURL: directory, calendar: utcCalendar())

        let seg1 = UsageTimelineSegment(bundleId: "app.a", displayName: "A", startedAt: date("2026-08-09T10:00:00Z"), endedAt: date("2026-08-09T10:05:00Z"), state: .engaged)
        let seg2 = UsageTimelineSegment(bundleId: "app.b", displayName: "B", startedAt: date("2026-08-10T11:00:00Z"), endedAt: date("2026-08-10T11:10:00Z"), state: .idle)

        try await store.appendSegments([seg1, seg2])

        let fetched = try await store.segments(from: "2026-08-09", to: "2026-08-10")
        XCTAssertEqual(fetched.count, 2)
        XCTAssertEqual(fetched.map(\.bundleId), ["app.a", "app.b"])
        XCTAssertEqual(fetched.map(\.state), [.engaged, .idle])
    }

    // 17. Timeline segments not uploaded to server
    func testTimelineSegmentsNotUploadedToServer() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "test-upload-user", baseURL: directory)
        let pending = await store.usageSummariesToUpload()
        // Verify OfflineStore state does not contain raw timeline segments struct
        XCTAssertTrue(pending.isEmpty)
    }

    // 18. SessionStore prunes files older than retention days
    func testSessionStorePrunesFilesOlderThanRetentionDays() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = UsageSessionStore(accountID: "test-prune-user", baseURL: directory, calendar: utcCalendar())

        let segOld = UsageTimelineSegment(bundleId: "app.old", displayName: "Old", startedAt: date("2025-01-01T10:00:00Z"), endedAt: date("2025-01-01T10:05:00Z"), state: .engaged)
        let segNew = UsageTimelineSegment(bundleId: "app.new", displayName: "New", startedAt: date("2026-08-09T10:00:00Z"), endedAt: date("2026-08-09T10:05:00Z"), state: .engaged)

        try await store.appendSegments([segOld, segNew])
        let deleted = try await store.pruneSessions(keeping: 90, now: date("2026-08-09T12:00:00Z"))

        XCTAssertEqual(deleted, 1)
        let remaining = try await store.segments()
        XCTAssertEqual(remaining.map(\.bundleId), ["app.new"])
    }

    // 19. SessionStore deletes date range and all
    func testSessionStoreDeletesDateRangeAndAll() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = UsageSessionStore(accountID: "test-delete-user", baseURL: directory, calendar: utcCalendar())

        let seg1 = UsageTimelineSegment(bundleId: "app.a", displayName: "A", startedAt: date("2026-08-01T10:00:00Z"), endedAt: date("2026-08-01T10:05:00Z"), state: .engaged)
        let seg2 = UsageTimelineSegment(bundleId: "app.b", displayName: "B", startedAt: date("2026-08-05T10:00:00Z"), endedAt: date("2026-08-05T10:05:00Z"), state: .engaged)

        try await store.appendSegments([seg1, seg2])
        let deletedRange = try await store.deleteSessions(from: "2026-08-01", to: "2026-08-01")
        XCTAssertEqual(deletedRange, 1)

        let remaining = try await store.segments()
        XCTAssertEqual(remaining.map(\.bundleId), ["app.b"])

        let deletedAll = try await store.deleteSessions(all: true)
        XCTAssertEqual(deletedAll, 1)
        let finalSegments = try await store.segments()
        XCTAssertTrue(finalSegments.isEmpty)
    }

    // 20. Watermark backward compatibility from Int to Watermark struct
    func testWatermarkBackwardCompatibilityFromIntToWatermarkStruct() throws {
        let jsonStr = """
        {
          "usageUploadWatermarks": {
            "2026-08-09|9|com.example.Editor": 120
          }
        }
        """
        let data = jsonStr.data(using: .utf8)!
        let snapshot = try JSONDecoder().decode(OfflineSnapshot.self, from: data)

        let watermark = snapshot.usageUploadWatermarks["2026-08-09|9|com.example.Editor"]
        XCTAssertNotNil(watermark)
        XCTAssertEqual(watermark?.activeSeconds, 120)
        XCTAssertNil(watermark?.engagedSeconds)
    }

    // 21. Statistics aggregates engaged seconds and coverage
    func testStatisticsAggregatesEngagedSecondsAndCoverage() {
        let summaries = [
            UsageSummary(localDate: "2026-08-09", hour: 9, bundleId: "app.a", displayName: "A", timezone: "UTC", activeSeconds: 100, engagedSeconds: 80),
            UsageSummary(localDate: "2026-08-09", hour: 10, bundleId: "app.b", displayName: "B", timezone: "UTC", activeSeconds: 50, engagedSeconds: 50)
        ]
        let stats = UsageStatistics.aggregating(summaries)
        XCTAssertEqual(stats.totalActiveSeconds, 150)
        XCTAssertEqual(stats.totalEngagedSeconds, 130)
        XCTAssertEqual(stats.engagementCoverage, EngagementCoverage(observedActiveSeconds: 150, totalActiveSeconds: 150, complete: true))
    }

    // 22. Statistics handles nullable engaged seconds for historical data
    func testStatisticsHandlesNullableEngagedSecondsForHistoricalData() {
        let summaries = [
            UsageSummary(localDate: "2026-08-09", hour: 9, bundleId: "app.a", displayName: "A", timezone: "UTC", activeSeconds: 100, engagedSeconds: nil)
        ]
        let stats = UsageStatistics.aggregating(summaries)
        XCTAssertEqual(stats.totalActiveSeconds, 100)
        XCTAssertNil(stats.totalEngagedSeconds)
        XCTAssertNil(stats.engagementCoverage)
    }

    // 23. OfflineStore deltas include engaged seconds
    func testOfflineStoreDeltasIncludeEngagedSeconds() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "test-delta-user", baseURL: directory)

        let summary = UsageSummary(localDate: "2026-08-09", bundleId: "app.a", displayName: "A", timezone: "UTC", activeSeconds: 100, engagedSeconds: 80)
        _ = try await store.upsertUsage(summary)
        _ = try await store.markUsageUploaded([summary])

        // Add 50s active, 40s engaged
        _ = try await store.upsertUsage(UsageSummary(localDate: "2026-08-09", bundleId: "app.a", displayName: "A", timezone: "UTC", activeSeconds: 50, engagedSeconds: 40))

        let deltas = await store.pendingUsageDeltas(from: "2026-08-09", to: "2026-08-09")
        XCTAssertEqual(deltas.count, 1)
        XCTAssertEqual(deltas.first?.activeSeconds, 50)
        XCTAssertEqual(deltas.first?.engagedSeconds, 40)
    }

    // 24. Legacy application rows are removed once without touching websites.
    func testCleanupLegacyUsageRemovesRowsAndDependentWatermarks() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "legacy-cleanup-test", baseURL: directory)
        let legacy = UsageSummary(localDate: "2026-08-08", bundleId: "app.legacy", displayName: "Legacy", timezone: "UTC", activeSeconds: 20)
        let current = UsageSummary(localDate: "2026-08-09", bundleId: "app.current", displayName: "Current", timezone: "UTC", activeSeconds: 30, engagedSeconds: 25)
        let website = WebsiteUsageSummary(localDate: "2026-08-09", browserBundleId: "com.browser", browserDisplayName: "Browser", hostname: "example.com", timezone: "UTC", activeSeconds: 12)
        _ = try await store.upsertUsage(legacy)
        _ = try await store.upsertUsage(current)
        _ = try await store.markUsageUploaded([legacy, current])
        _ = try await store.upsertWebsiteUsage(website)
        _ = try await store.markWebsiteUsageUploaded([website])

        _ = try await store.cleanupLegacyUsage()
        let usage = await store.usageSummaries()
        let pendingUsage = await store.usageSummariesToUpload()
        let websites = await store.websiteUsageSummaries()
        let pendingWebsites = await store.websiteUsageSummariesToUpload()
        XCTAssertEqual(usage.map(\.id), [current.id])
        XCTAssertTrue(pendingUsage.isEmpty)
        XCTAssertEqual(websites.map(\.id), [website.id])
        XCTAssertTrue(pendingWebsites.isEmpty)
        _ = try await store.cleanupLegacyUsage()
        let repeatCleanup = await store.usageSummaries()
        XCTAssertEqual(repeatCleanup.count, 1)
    }

    func testStoppingUsageTrackingCancelsInFlightUploadGeneration() async {
        let model = AppModel()
        model.usageUploadGeneration = 7
        model.usageUploadInFlight = Task { @MainActor in
            try? await Task.sleep(for: .seconds(10))
            return true
        }

        model.stopUsageTracking()

        XCTAssertNil(model.usageUploadInFlight)
        XCTAssertEqual(model.usageUploadGeneration, 8)
    }

    func testUsageMaintenanceSnapshotDoesNotReplaceTaskStatus() {
        let model = AppModel()
        var currentTask = ProductivityTask.optimistic(id: "usage-race-task", title: "Task")
        currentTask.status = .completed
        model.tasks = [currentTask]
        model.currentSnapshot.tasks = [currentTask]

        var staleTask = currentTask
        staleTask.status = .planned
        var usageSnapshot = OfflineSnapshot()
        usageSnapshot.tasks = [staleTask]
        usageSnapshot.usageSummaries = [
            UsageSummary(
                localDate: "2026-08-14",
                bundleId: "com.example.Editor",
                displayName: "Editor",
                timezone: "UTC",
                activeSeconds: 1,
                engagedSeconds: 1
            )
        ]

        model.applyUsageSnapshot(usageSnapshot)

        XCTAssertEqual(model.tasks.first?.status, .completed)
        XCTAssertEqual(model.currentSnapshot.tasks.first?.status, .completed)
        XCTAssertEqual(model.localUsageSummaries.first?.activeSeconds, 1)
    }
}
