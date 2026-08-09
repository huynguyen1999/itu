import XCTest
@testable import iTu

@MainActor
final class UsageTrackingTests: XCTestCase {
    private func makeTracker(calendar: Calendar = .current) -> (ForegroundUsageTracker, UserDefaults, String) {
        let suite = "usage-tracker-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        return (ForegroundUsageTracker(defaults: defaults, calendar: calendar), defaults, suite)
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

    func testTrackerSwitchesAppsWithoutMixingForegroundTotals() {
        let (tracker, defaults, suite) = makeTracker()
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

    func testTrackerContinuesCreditingWhileInputIsIdle() {
        let (tracker, defaults, suite) = makeTracker()
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

    func testPausedTrackerDoesNotCreditLockOrSleepGap() {
        let (tracker, defaults, suite) = makeTracker()
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

    func testDisablingTrackerPreventsFurtherSummaries() {
        let (tracker, defaults, suite) = makeTracker()
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

    func testTrackerSplitsUsageAtLocalMidnightAndUsesCalendarTimezone() {
        let calendar = utcCalendar()
        let (tracker, defaults, suite) = makeTracker(calendar: calendar)
        var summaries: [UsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        let start = date("2026-08-09T23:59:30Z")
        tracker.start()
        tracker.applicationActivated(bundleID: "com.example.Editor", displayName: "Editor", at: start)
        summaries.removeAll() // Ignore the synthetic gap from the real clock to this fixed test date.
        tracker.tick(at: start.addingTimeInterval(90))

        XCTAssertEqual(summaries.map(\.localDate), ["2026-08-09", "2026-08-10"])
        XCTAssertEqual(summaries.map(\.activeSeconds), [30, 60])
        XCTAssertEqual(summaries.map(\.hour), [23, 0])
        XCTAssertEqual(Set(summaries.map(\.timezone)), Set(["GMT"]))
        stop(tracker, defaults: defaults, suite: suite)
    }

    func testTrackerSplitsUsageIntoLocalHourBuckets() {
        let calendar = utcCalendar()
        let (tracker, defaults, suite) = makeTracker(calendar: calendar)
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

    func testRestartDoesNotBackfillTimeBetweenTrackerInstances() {
        let (first, defaults, suite) = makeTracker()
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

    func testUsageSummaryPersistsAndOnlyChangedTotalsAreUploadable() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "usage-test", baseURL: directory)
        let summary = UsageSummary(localDate: "2026-08-09", bundleId: "com.example.Editor", displayName: "Editor", timezone: "UTC", activeSeconds: 30)
        _ = try await store.upsertUsage(summary)
        let initialPending = await store.usageSummariesToUpload()
        XCTAssertEqual(initialPending.first?.activeSeconds, 30)
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
    }

    func testUsageStatisticsShowsLocalDataWithoutDoubleCountingUploadedSeconds() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "usage-statistics-test", baseURL: directory)
        let initial = UsageSummary(localDate: "2026-08-09", bundleId: "com.example.Editor", displayName: "Editor", timezone: "UTC", activeSeconds: 30)
        _ = try await store.upsertUsage(initial)

        let local = await store.usageSummaries(from: "2026-08-09", to: "2026-08-09")
        XCTAssertEqual(UsageStatistics.aggregating(local).totalActiveSeconds, 30)

        _ = try await store.markUsageUploaded([initial])
        _ = try await store.upsertUsage(UsageSummary(localDate: "2026-08-09", bundleId: "com.example.Editor", displayName: "Editor", timezone: "UTC", activeSeconds: 10))
        let pending = await store.pendingUsageDeltas(from: "2026-08-09", to: "2026-08-09")
        let server = UsageStatistics(
            totalActiveSeconds: 30,
            topApps: [UsageTopApp(bundleId: "com.example.Editor", displayName: "Editor", activeSeconds: 30)],
            daily: [UsageDailyTotal(localDate: "2026-08-09", activeSeconds: 30)],
            dailyApps: [UsageDailyApp(localDate: "2026-08-09", bundleId: "com.example.Editor", displayName: "Editor", activeSeconds: 30)]
        )
        let merged = server.adding(pending)

        XCTAssertEqual(pending.map(\.activeSeconds), [10])
        XCTAssertEqual(merged.totalActiveSeconds, 40)
        XCTAssertEqual(merged.topApps.first?.activeSeconds, 40)
        XCTAssertEqual(merged.daily.first?.activeSeconds, 40)
        XCTAssertEqual(merged.dailyApps.first?.activeSeconds, 40)
    }

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
}
