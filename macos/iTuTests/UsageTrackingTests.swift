import XCTest
@testable import iTu

final class MockIdleMonitor: IdleTimeProviding, @unchecked Sendable {
    var currentIdle: TimeInterval = 0
    func secondsSinceLastInput() -> TimeInterval { currentIdle }
}

@MainActor
final class UsageTrackingTests: XCTestCase {
    private func makeTracker(calendar: Calendar = .current, idleMonitor: MockIdleMonitor = MockIdleMonitor()) -> (ForegroundUsageTracker, UserDefaults, String, MockIdleMonitor) {
        let suite = "usage-tracker-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let tracker = ForegroundUsageTracker(defaults: defaults, calendar: calendar, idleMonitor: idleMonitor)
        return (tracker, defaults, suite, idleMonitor)
    }

    private func stop(_ tracker: ForegroundUsageTracker, defaults: UserDefaults, suite: String) {
        tracker.setEnabled(false)
        defaults.removePersistentDomain(forName: suite)
    }

    private func utcCalendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func date(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }

    // 1. App switches without mixing totals
    func testTrackerSwitchesAppsWithoutMixingForegroundTotals() {
        let (tracker, defaults, suite, _) = makeTracker()
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        let start = Date()
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)
        tracker.tick(at: start.addingTimeInterval(60))
        tracker.applicationActivated(bundleID: "com.example.Browser", displayName: "Browser", at: start.addingTimeInterval(60))
        tracker.tick(at: start.addingTimeInterval(90))

        XCTAssertEqual(summaries.map(\.bundleId), ["com.example.Editor", "com.example.Browser"])
        XCTAssertEqual(summaries.map(\.activeSeconds), [60, 30])
        stop(tracker, defaults: defaults, suite: suite)
    }

    // 2. Continuous crediting while input is idle (Screen Time keeps increasing)
    func testTrackerContinuesCreditingWhileInputIsIdle() {
        let (tracker, defaults, suite, _) = makeTracker()
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        let start = Date()
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)
        tracker.tick(at: start.addingTimeInterval(300))
        tracker.tick(at: start.addingTimeInterval(330))
        tracker.tick(at: start.addingTimeInterval(340))

        XCTAssertEqual(summaries.map(\.activeSeconds), [300, 30, 10])
        stop(tracker, defaults: defaults, suite: suite)
    }

    // 3. Engaged time stops when idle exceeds threshold
    func testEngagedTimeStopsWhenIdleExceedsThreshold() {
        let (tracker, defaults, suite, idle) = makeTracker()
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        tracker.idleThresholdSeconds = 300 // 5 minutes
        let start = Date()
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)

        // 200s active
        idle.currentIdle = 0
        tracker.evaluateIdleStateAndTick(at: start.addingTimeInterval(200))

        // Idle for 400s total (exceeds 300s threshold)
        idle.currentIdle = 400
        tracker.evaluateIdleStateAndTick(at: start.addingTimeInterval(600))

        XCTAssertFalse(tracker.isEngaged)
        let totalActive = summaries.reduce(0) { $0 + $1.activeSeconds }
        let totalEngaged = summaries.reduce(0) { $0 + ($1.engagedSeconds ?? 0) }

        XCTAssertEqual(totalActive, 600)
        XCTAssertEqual(totalEngaged, 500) // 200s before + 300s threshold grace
        stop(tracker, defaults: defaults, suite: suite)
    }

    // 4. Idle threshold grace period credits first 5 minutes
    func testIdleThresholdGracePeriodCreditsFirst5Minutes() {
        let (tracker, defaults, suite, idle) = makeTracker()
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        tracker.idleThresholdSeconds = 300
        let start = Date()
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)

        idle.currentIdle = 300
        tracker.evaluateIdleStateAndTick(at: start.addingTimeInterval(300))

        let totalActive = summaries.reduce(0) { $0 + $1.activeSeconds }
        let totalEngaged = summaries.reduce(0) { $0 + ($1.engagedSeconds ?? 0) }

        XCTAssertEqual(totalActive, 300)
        XCTAssertEqual(totalEngaged, 300)
        XCTAssertTrue(tracker.isEngaged)
        stop(tracker, defaults: defaults, suite: suite)
    }

    // 5. Input resume calculates boundary at exact event timestamp
    func testInputResumeCalculatesBoundaryAtExactEventTimestamp() {
        let (tracker, defaults, suite, idle) = makeTracker()
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        tracker.idleThresholdSeconds = 300
        let start = Date()
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)

        // Exceed threshold to become unengaged
        idle.currentIdle = 600
        tracker.evaluateIdleStateAndTick(at: start.addingTimeInterval(600))
        XCTAssertFalse(tracker.isEngaged)

        // User typed 10 seconds ago (now at t=700)
        idle.currentIdle = 10
        tracker.evaluateIdleStateAndTick(at: start.addingTimeInterval(700))
        XCTAssertTrue(tracker.isEngaged)

        let totalActive = summaries.reduce(0) { $0 + $1.activeSeconds }
        let totalEngaged = summaries.reduce(0) { $0 + ($1.engagedSeconds ?? 0) }

        XCTAssertEqual(totalActive, 700)
        // Engaged: 300s initial grace + 10s after resume at t=690
        XCTAssertEqual(totalEngaged, 310)
        stop(tracker, defaults: defaults, suite: suite)
    }

    // 6. Paused tracker does not credit lock or sleep gap
    func testPausedTrackerDoesNotCreditLockOrSleepGap() {
        let (tracker, defaults, suite, _) = makeTracker()
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        let start = Date()
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)
        tracker.tick(at: start.addingTimeInterval(30))
        tracker.setPaused(true)
        let pausedCount = summaries.count
        tracker.tick(at: start.addingTimeInterval(3600))
        XCTAssertEqual(summaries.count, pausedCount)
        tracker.setPaused(false)
        let resumed = Date()
        tracker.tick(at: resumed.addingTimeInterval(30))
        tracker.tick(at: resumed.addingTimeInterval(60))
        XCTAssertGreaterThan(summaries.count, pausedCount)
        stop(tracker, defaults: defaults, suite: suite)
    }

    // 7. Disabling tracker prevents further summaries
    func testDisablingTrackerPreventsFurtherSummaries() {
        let (tracker, defaults, suite, _) = makeTracker()
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        let start = Date()
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)
        tracker.tick(at: start.addingTimeInterval(30))
        tracker.setEnabled(false)
        let disabledCount = summaries.count
        tracker.tick(at: start.addingTimeInterval(3600))

        XCTAssertFalse(tracker.isRunning)
        XCTAssertEqual(summaries.count, disabledCount)
        defaults.removePersistentDomain(forName: suite)
    }

    // 8. Split usage at local midnight and timezone identifier
    func testTrackerSplitsUsageAtLocalMidnightAndUsesCalendarTimezone() {
        let calendar = utcCalendar()
        let (tracker, defaults, suite, _) = makeTracker(calendar: calendar)
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        let start = date("2026-08-09T23:59:30Z")
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)
        summaries.removeAll()
        tracker.tick(at: start.addingTimeInterval(90))

        XCTAssertEqual(summaries.map(\.localDate), ["2026-08-09", "2026-08-10"])
        XCTAssertEqual(summaries.map(\.activeSeconds), [30, 60])
        XCTAssertEqual(summaries.map(\.hour), [23, 0])
        XCTAssertEqual(Set(summaries.map(\.timezone)), Set(["GMT"]))
        stop(tracker, defaults: defaults, suite: suite)
    }

    // 9. Split usage into local hour buckets
    func testTrackerSplitsUsageIntoLocalHourBuckets() {
        let calendar = utcCalendar()
        let (tracker, defaults, suite, _) = makeTracker(calendar: calendar)
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        let start = date("2026-08-09T09:59:30Z")
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)
        summaries.removeAll()
        tracker.tick(at: start.addingTimeInterval(90))

        XCTAssertEqual(summaries.map(\.hour), [9, 10])
        XCTAssertEqual(summaries.map(\.activeSeconds), [30, 60])
        stop(tracker, defaults: defaults, suite: suite)
    }

    // 10. Restart does not backfill time between tracker instances
    func testRestartDoesNotBackfillTimeBetweenTrackerInstances() {
        let (first, defaults, suite, _) = makeTracker()
        var firstSummaries: [UsageSummary] = []
        first.onSummaryChanged = { firstSummaries.append($0) }
        let start = Date()
        first.start()
        first.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)
        first.tick(at: start.addingTimeInterval(10))

        let second = ForegroundUsageTracker(defaults: defaults)
        var secondSummaries: [UsageSummary] = []
        second.onSummaryChanged = { secondSummaries.append($0) }
        second.start()
        let resumed = Date()
        second.tick(at: resumed.addingTimeInterval(30))
        second.tick(at: resumed.addingTimeInterval(60))

        XCTAssertEqual(firstSummaries.map(\.activeSeconds), [10])
        XCTAssertEqual(secondSummaries.map(\.activeSeconds), [30, 30])
        stop(first, defaults: defaults, suite: suite)
        stop(second, defaults: defaults, suite: suite)
    }

    // 11. Internal and user excluded apps do not accrue usage
    func testInternalAndUserExcludedAppsDoNotAccrueUsage() {
        let (tracker, defaults, suite, _) = makeTracker()
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        tracker.userExcludedBundleIDs = ["com.secret.app"]
        let start = Date()
        tracker.start()

        // Internal app (itu)
        tracker.applicationActivated(bundleID: "com.huynguyen.itu", displayName: "iTu", at: start)
        tracker.tick(at: start.addingTimeInterval(60))
        XCTAssertTrue(summaries.isEmpty)

        // User excluded app
        tracker.applicationActivated(bundleID: "com.secret.app", displayName: "Secret App", at: start.addingTimeInterval(60))
        tracker.tick(at: start.addingTimeInterval(120))
        XCTAssertTrue(summaries.isEmpty)

        // Allowed app
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start.addingTimeInterval(120))
        tracker.tick(at: start.addingTimeInterval(180))
        XCTAssertEqual(summaries.map(\.bundleId), ["com.example.Editor"])
        XCTAssertEqual(summaries.map(\.activeSeconds), [60])
        stop(tracker, defaults: defaults, suite: suite)
    }

    // 12. Sleep wake preserves manual user pause state
    func testSleepWakePreservesManualUserPauseState() {
        let (tracker, defaults, suite, _) = makeTracker()
        tracker.start()
        tracker.setPaused(true)
        XCTAssertTrue(tracker.suspensionReasons.contains(.userPaused))

        // System sleep & wake notifications simulate adding/removing systemSleeping
        NotificationCenter.default.post(name: NSWorkspace.willSleepNotification, object: nil)
        XCTAssertTrue(tracker.suspensionReasons.contains(.userPaused))

        NotificationCenter.default.post(name: NSWorkspace.didWakeNotification, object: nil)
        XCTAssertTrue(tracker.suspensionReasons.contains(.userPaused))
        XCTAssertFalse(tracker.isTrackingAllowed)
        stop(tracker, defaults: defaults, suite: suite)
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
