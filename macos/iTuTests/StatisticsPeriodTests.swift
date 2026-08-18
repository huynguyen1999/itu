import XCTest
@testable import iTu

final class StatisticsPeriodTests: XCTestCase {
    func testPresetUsesInclusiveHCMCDateRangeAndEqualPreviousComparison() {
        let now = StatisticsPeriod.date(from: "2026-03-01")!
        let period = StatisticsPeriod.preset("30 Days", now: now)

        XCTAssertEqual(period.from, "2026-01-31")
        XCTAssertEqual(period.to, "2026-03-01")
        XCTAssertEqual(period.dayCount, 30)
        XCTAssertEqual(period.comparisonFrom, "2026-01-01")
        XCTAssertEqual(period.comparisonTo, "2026-01-30")
        XCTAssertEqual(period.apiTo, "2026-03-02T00:00:00.000+07:00")
    }

    func testLeapYearAndYearBoundaryDateArithmetic() {
        XCTAssertEqual(StatisticsPeriod.addDays("2024-02-28", 1), "2024-02-29")
        XCTAssertEqual(StatisticsPeriod.addDays("2024-02-29", 1), "2024-03-01")
        XCTAssertEqual(StatisticsPeriod.addDays("2025-01-01", -1), "2024-12-31")
    }

    func testCustomRangeNormalizesReversedDates() {
        let period = StatisticsPeriod(
            range: StatisticsDateRange(from: "2026-05-10", to: "2026-05-01"),
            grouping: .month
        )

        XCTAssertEqual(period.from, "2026-05-01")
        XCTAssertEqual(period.to, "2026-05-10")
        XCTAssertEqual(period.grouping, .month)
        XCTAssertEqual(period.dayCount, 10)
    }

    func testOverviewSnapshotAggregatesAFullYearWithoutExpensiveTransform() {
        let durations = [1, 7, 30, 90, 365].map { count -> (snapshot: StatisticsOverviewSnapshot, elapsed: Double) in
            let days = (0..<count).map { index in
                StudyCalendarDayDTO(
                    date: StatisticsPeriod.addDays("2025-08-16", index),
                    sessions: 1,
                    focusSessions: 1,
                    reviews: 2,
                    correct: 2,
                    completedTasks: 3,
                    focusedMinutes: 25,
                    cardsCreated: 1
                )
            }
            let started = CFAbsoluteTimeGetCurrent()
            let snapshot = StatisticsOverviewSnapshot(days: days)
            return (snapshot, (CFAbsoluteTimeGetCurrent() - started) * 1000)
        }

        XCTAssertEqual(durations.last?.snapshot.completedTasks, 1_095)
        XCTAssertEqual(durations.last?.snapshot.focusMinutes, 9_125)
        XCTAssertLessThan(durations.map(\.elapsed).max() ?? .infinity, 50)
    }

    @MainActor
    func testStatisticsStoreDomainStateUpdates() {
        let store = StatisticsStore()
        let model = AppModel()
        model.statisticsCalendar = [
            StudyCalendarDayDTO(
                date: "2026-08-18",
                sessions: 2,
                focusSessions: 1,
                reviews: 5,
                correct: 5,
                completedTasks: 4,
                focusedMinutes: 45,
                cardsCreated: 2
            )
        ]

        store.updateDomainStates(using: model)
        XCTAssertEqual(store.state(for: .productivity), .ready)
        XCTAssertEqual(store.state(for: .learning), .ready)
        XCTAssertEqual(store.currentOverview.completedTasks, 4)
        XCTAssertEqual(store.currentOverview.focusMinutes, 45)
        XCTAssertEqual(store.currentOverview.reviews, 5)
    }
}
