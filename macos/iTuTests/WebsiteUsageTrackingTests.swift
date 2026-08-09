import XCTest
@testable import iTu

@MainActor
final class WebsiteUsageTrackingTests: XCTestCase {
    private func stateURL() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("browser-activity-\(UUID().uuidString).json")
    }

    private func writeState(_ url: URL, at date: Date, hostname: String? = "Example.COM", state: String = "active", connected: Bool = true, incognito: Bool = false) throws {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let state = BrowserActivityState(
            protocolVersion: BrowserActivityState.protocolVersion,
            browserBundleId: BrowserActivityState.edgeBundleID,
            sequence: 1,
            state: state,
            hostname: hostname,
            incognito: incognito,
            connected: connected,
            updatedAt: formatter.string(from: date)
        )
        try JSONEncoder().encode(state).write(to: url, options: .atomic)
    }

    func testOnlyFreshFrontmostNonIncognitoEdgeStateCreditsAndNormalizesHostname() throws {
        let url = stateURL()
        let start = Date(timeIntervalSince1970: 1_754_764_800)
        try writeState(url, at: start)
        let tracker = WebsiteUsageTracker(calendar: utcCalendar(), stateURL: url, frontmostBundleID: { BrowserActivityState.edgeBundleID })
        var summaries: [WebsiteUsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        tracker.start(at: start)
        tracker.tick(at: start)
        tracker.tick(at: start.addingTimeInterval(30))

        XCTAssertEqual(summaries.count, 1)
        XCTAssertEqual(summaries.first?.hostname, "example.com")
        XCTAssertEqual(summaries.first?.activeSeconds, 30)
        tracker.stop(at: start.addingTimeInterval(30))
    }

    func testStaleDisconnectedIncognitoAndNonEdgeStateDoNotCredit() throws {
        let url = stateURL()
        let start = Date(timeIntervalSince1970: 1_754_764_800)
        let tracker = WebsiteUsageTracker(calendar: utcCalendar(), stateURL: url, frontmostBundleID: { BrowserActivityState.edgeBundleID })
        var summaries: [WebsiteUsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        tracker.start(at: start)

        try writeState(url, at: start.addingTimeInterval(-91))
        tracker.tick(at: start)
        try writeState(url, at: start, connected: false)
        tracker.tick(at: start.addingTimeInterval(30))
        try writeState(url, at: start.addingTimeInterval(30), incognito: true)
        tracker.tick(at: start.addingTimeInterval(60))
        tracker.stop(at: start.addingTimeInterval(60))
        XCTAssertTrue(summaries.isEmpty)

        let other = WebsiteUsageTracker(calendar: utcCalendar(), stateURL: url, frontmostBundleID: { "com.apple.TextEdit" })
        other.start(at: start)
        other.tick(at: start)
        other.tick(at: start.addingTimeInterval(30))
        other.stop(at: start.addingTimeInterval(30))
    }

    func testIneligibleStateFinalizesCurrentHostnameBeforeClearing() throws {
        let url = stateURL()
        let start = Date(timeIntervalSince1970: 1_754_764_800)
        try writeState(url, at: start)
        let tracker = WebsiteUsageTracker(calendar: utcCalendar(), stateURL: url, frontmostBundleID: { BrowserActivityState.edgeBundleID })
        var summaries: [WebsiteUsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        tracker.start(at: start)
        tracker.tick(at: start)

        try writeState(url, at: start.addingTimeInterval(30), hostname: nil, state: "inactive")
        tracker.tick(at: start.addingTimeInterval(30))

        XCTAssertEqual(summaries.map(\.hostname), ["example.com"])
        XCTAssertEqual(summaries.map(\.activeSeconds), [30])
        tracker.stop(at: start.addingTimeInterval(60))
        XCTAssertEqual(summaries.map(\.activeSeconds), [30])
    }

    func testMidnightIsSplitAndPauseDoesNotBackfill() throws {
        let url = stateURL()
        let start = date("2026-08-09T23:59:30Z")
        try writeState(url, at: start)
        let tracker = WebsiteUsageTracker(calendar: utcCalendar(), stateURL: url, frontmostBundleID: { BrowserActivityState.edgeBundleID })
        var summaries: [WebsiteUsageSummary] = []
        tracker.onSummaryChanged = { summaries.append($0) }
        tracker.start(at: start)
        tracker.tick(at: start)
        tracker.tick(at: start.addingTimeInterval(90))

        XCTAssertEqual(summaries.map(\.localDate), ["2026-08-09", "2026-08-10"])
        XCTAssertEqual(summaries.map(\.activeSeconds), [30, 60])

        tracker.setPaused(true, at: start.addingTimeInterval(90))
        try writeState(url, at: start.addingTimeInterval(3_600))
        tracker.setPaused(false, at: start.addingTimeInterval(3_600))
        tracker.tick(at: start.addingTimeInterval(3_630))
        tracker.tick(at: start.addingTimeInterval(3_660))
        XCTAssertEqual(summaries.last?.activeSeconds, 30)
        tracker.stop(at: start.addingTimeInterval(3_660))
    }

    func testRestartDoesNotBackfillStateAge() throws {
        let url = stateURL()
        let start = date("2026-08-09T12:00:00Z")
        try writeState(url, at: start)
        let first = WebsiteUsageTracker(calendar: utcCalendar(), stateURL: url, frontmostBundleID: { BrowserActivityState.edgeBundleID })
        var firstSummaries: [WebsiteUsageSummary] = []
        first.onSummaryChanged = { firstSummaries.append($0) }
        first.start(at: start)
        first.tick(at: start)
        first.tick(at: start.addingTimeInterval(10))

        let second = WebsiteUsageTracker(calendar: utcCalendar(), stateURL: url, frontmostBundleID: { BrowserActivityState.edgeBundleID })
        var secondSummaries: [WebsiteUsageSummary] = []
        second.onSummaryChanged = { secondSummaries.append($0) }
        second.start(at: start.addingTimeInterval(3_600))
        try writeState(url, at: start.addingTimeInterval(3_600))
        second.tick(at: start.addingTimeInterval(3_600))
        second.tick(at: start.addingTimeInterval(3_630))
        XCTAssertEqual(firstSummaries.map(\.activeSeconds), [10])
        XCTAssertEqual(secondSummaries.map(\.activeSeconds), [30])
        first.stop(at: start.addingTimeInterval(10))
        second.stop(at: start.addingTimeInterval(3_630))
    }

    func testWebsiteTrackingDefaultsOff() {
        XCTAssertFalse(UsagePreferences().enabled)
        XCTAssertFalse(UsagePreferences().websiteTrackingEnabled)
    }

    func testWebsitePersistenceWatermarkUploadsOnlyNewSeconds() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "website-usage-test", baseURL: directory)
        let summary = WebsiteUsageSummary(
            localDate: "2026-08-09",
            browserBundleId: BrowserActivityState.edgeBundleID,
            browserDisplayName: "Microsoft Edge",
            hostname: "example.com",
            timezone: "UTC",
            activeSeconds: 30
        )
        _ = try await store.upsertWebsiteUsage(summary)
        let firstUpload = await store.websiteUsageSummariesToUpload()
        XCTAssertEqual(firstUpload.first?.activeSeconds, 30)
        _ = try await store.markWebsiteUsageUploaded([summary])
        var added = summary
        added.activeSeconds = 10
        _ = try await store.upsertWebsiteUsage(added)
        let pending = await store.pendingWebsiteUsageDeltas(from: nil, to: nil)
        XCTAssertEqual(pending.first?.activeSeconds, 10)
    }

    func testRangeDeletionRemovesMatchingWebsiteSummariesAndWatermarks() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "website-range-deletion-test", baseURL: directory)
        let before = websiteSummary(localDate: "2026-08-08", hostname: "before.example")
        let matching = websiteSummary(localDate: "2026-08-09", hostname: "matching.example")
        let after = websiteSummary(localDate: "2026-08-10", hostname: "after.example")
        for summary in [before, matching, after] {
            _ = try await store.upsertWebsiteUsage(summary)
        }
        _ = try await store.markWebsiteUsageUploaded([before, matching, after])

        let snapshot = try await store.deleteUsage(from: "2026-08-09", to: "2026-08-09")

        XCTAssertEqual(snapshot.websiteUsageSummaries.map(\.id), [before.id, after.id])
        XCTAssertNil(snapshot.websiteUsageUploadWatermarks[matching.id])
        XCTAssertEqual(snapshot.websiteUsageUploadWatermarks[before.id], before.activeSeconds)
        XCTAssertEqual(snapshot.websiteUsageUploadWatermarks[after.id], after.activeSeconds)
    }

    func testAllDeletionRemovesAllWebsiteSummariesAndWatermarks() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "website-all-deletion-test", baseURL: directory)
        let summary = websiteSummary(localDate: "2026-08-09", hostname: "example.com")
        _ = try await store.upsertWebsiteUsage(summary)
        _ = try await store.markWebsiteUsageUploaded([summary])

        let snapshot = try await store.deleteUsage(from: nil, to: nil)

        XCTAssertTrue(snapshot.websiteUsageSummaries.isEmpty)
        XCTAssertTrue(snapshot.websiteUsageUploadWatermarks.isEmpty)
    }

    private func websiteSummary(localDate: String, hostname: String) -> WebsiteUsageSummary {
        WebsiteUsageSummary(
            localDate: localDate,
            browserBundleId: BrowserActivityState.edgeBundleID,
            browserDisplayName: "Microsoft Edge",
            hostname: hostname,
            timezone: "UTC",
            activeSeconds: 30
        )
    }

    private func utcCalendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func date(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }
}
