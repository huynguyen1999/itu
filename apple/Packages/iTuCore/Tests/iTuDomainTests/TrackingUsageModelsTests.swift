import XCTest
@testable import iTuDomain

final class TrackingUsageModelsTests: XCTestCase {
    func testBudgetFlexibleNumbersAndReportDefaults() throws {
        let limit = try JSONDecoder().decode(
            CategoryBudgetLimitModel.self,
            from: #"{"id":"limit-1","monthlyBudgetId":"budget-1","categoryId":"cat-1","limit":"125.50"}"#.data(using: .utf8)!
        )
        XCTAssertEqual(limit.limit, 125.5)

        let budget = try JSONDecoder().decode(
            MonthlyBudgetModel.self,
            from: #"{"id":"budget-1","userId":"user-1","period":"2026-08"}"#.data(using: .utf8)!
        )
        XCTAssertNil(budget.overallLimit)
        XCTAssertTrue(budget.categoryLimits.isEmpty)

        let stats = try JSONDecoder().decode(
            BudgetStatisticsModel.self,
            from: #"{"from":"2026-08-01","to":"2026-08-31","spent":"10.25","expenseCount":1,"previousSpent":8,"changeAmount":"2.25"}"#.data(using: .utf8)!
        )
        XCTAssertEqual(stats.spent, 10.25)
        XCTAssertTrue(stats.trend.isEmpty)
    }

    func testGymNestedCodableRoundTrip() throws {
        let set = WorkoutSetModel(
            id: "set-1", workoutExerciseId: "entry-1", sortOrder: 0, type: "NORMAL",
            reps: 8, weight: 40, durationSeconds: nil, distanceMeters: nil, rpe: 7,
            completedAt: "2026-08-17T10:00:00Z"
        )
        let entry = WorkoutExerciseModel(
            id: "entry-1", workoutEntryId: "workout-1", exerciseId: "exercise-1",
            sortOrder: 0, note: nil, restSeconds: 120, exercise: nil, sets: [set]
        )
        let workout = WorkoutModel(
            id: "workout-1", userId: "user-1", title: "Push", status: "COMPLETED",
            startedAt: "2026-08-17T09:00:00Z", endedAt: "2026-08-17T10:00:00Z",
            durationMinutes: 60, exercises: [entry], version: 1, deletedAt: nil
        )

        XCTAssertEqual(try JSONDecoder().decode(WorkoutModel.self, from: JSONEncoder().encode(workout)), workout)
    }

    func testUsageAggregationPreferencesAndBrowserDisplay() throws {
        let preferences = UsagePreferences()
        XCTAssertFalse(preferences.enabled)
        XCTAssertEqual(preferences.retentionDays, 90)

        let summaries = [
            UsageSummary(localDate: "2026-08-17", hour: 9, bundleId: "app.a", displayName: "A", timezone: "UTC", activeSeconds: 30, engagedSeconds: 20),
            UsageSummary(localDate: "2026-08-17", hour: 10, bundleId: "app.a", displayName: "A", timezone: "UTC", activeSeconds: 10)
        ]
        let statistics = UsageStatistics.aggregating(summaries)
        XCTAssertEqual(statistics.totalActiveSeconds, 40)
        XCTAssertEqual(statistics.totalEngagedSeconds, 20)
        XCTAssertEqual(statistics.engagementCoverage?.observedActiveSeconds, 30)
        XCTAssertEqual(statistics.topApps.first?.activeSeconds, 40)

        let browser = try JSONDecoder().decode(
            WebsiteUsageBrowserTotal.self,
            from: #"{"browserBundleId":"com.google.Chrome","activeSeconds":12}"#.data(using: .utf8)!
        )
        XCTAssertEqual(browser.browserDisplayName, "Google Chrome")
        let fallback = try JSONDecoder().decode(
            WebsiteUsageBrowserTotal.self,
            from: #"{"browserBundleId":"unknown.browser","activeSeconds":1}"#.data(using: .utf8)!
        )
        XCTAssertEqual(fallback.browserDisplayName, "Browser")
    }

    func testLegacyUsagePayloadDefaultsSourceAndHour() throws {
        let app = try JSONDecoder().decode(
            UsageSummary.self,
            from: #"{"localDate":"2026-08-17","bundleId":"app.a","displayName":"A","timezone":"UTC","activeSeconds":30}"#.data(using: .utf8)!
        )
        XCTAssertEqual(app.source, .macOSForeground)
        XCTAssertEqual(app.hour, -1)
        XCTAssertNil(app.deviceId)
        XCTAssertNil(app.pickups)
        XCTAssertNil(app.notifications)

        let website = try JSONDecoder().decode(
            WebsiteUsageSummary.self,
            from: #"{"localDate":"2026-08-17","browserBundleId":"com.apple.Safari","browserDisplayName":"Safari","hostname":"example.com","timezone":"UTC","activeSeconds":12}"#.data(using: .utf8)!
        )
        XCTAssertEqual(website.source, .browser)
        XCTAssertEqual(website.hour, -1)
        XCTAssertNil(website.deviceId)
    }

    func testDeviceActivityAggregationDoesNotDoubleCountDuplicateBuckets() {
        let summary = UsageSummary(
            localDate: "2026-08-17", hour: 9, bundleId: "app.a", displayName: "A", timezone: "UTC",
            activeSeconds: 30, source: .deviceActivity, deviceId: "ios-device"
        )
        let stats = UsageStatistics.aggregating([summary, summary])
        XCTAssertEqual(stats.totalActiveSeconds, 30)

        let website = WebsiteUsageSummary(
            localDate: "2026-08-17", hour: 9, browserDisplayName: "DeviceActivity", hostname: "example.com",
            timezone: "UTC", activeSeconds: 12, source: .deviceActivity, deviceId: "ios-device"
        )
        XCTAssertEqual(WebsiteUsageStatistics.aggregating([website, website]).totalActiveSeconds, 12)
    }
}
