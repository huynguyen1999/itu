import XCTest
@testable import iTu

@MainActor
final class NavigationPerformanceTests: XCTestCase {
    func testRefreshCoordinatorDeduplicatesWithinTTL() async {
        let coordinator = FeatureRefreshCoordinator()
        var runCount = 0

        await coordinator.run(.focus) { runCount += 1 }
        await coordinator.run(.focus) { runCount += 1 }

        XCTAssertEqual(runCount, 1)
    }

    func testRefreshCoordinatorAllowsForcedRefresh() async {
        let coordinator = FeatureRefreshCoordinator()
        var runCount = 0

        await coordinator.run(.statistics) { runCount += 1 }
        await coordinator.run(.statistics, force: true) { runCount += 1 }

        XCTAssertEqual(runCount, 2)
    }
}
