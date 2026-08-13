import XCTest
import SwiftUI
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

    func testDestinationNavigationBenchmarkWith100Tasks() {
        let model = AppModel()
        let formatter = ISO8601DateFormatter()
        model.tasks = (0..<100).map { index in
            ProductivityTask.optimistic(
                id: "benchmark-\(index)",
                title: "Benchmark task \(index)",
                priority: index.isMultiple(of: 3) ? .high : .none,
                dueAt: index.isMultiple(of: 2) ? formatter.string(from: Date()) : nil,
                important: index.isMultiple(of: 3)
            )
        }
        let render = {
            _ = ImageRenderer(
                content: MainView()
                    .environment(model)
                    .frame(width: 1_220, height: 780)
            ).nsImage
        }

        render()
        measure {
            for _ in 0..<10 {
                for section in [AppSection.home, .inbox, .matrix, .home] {
                    model.selectedSection = section
                    render()
                }
            }
        }
    }
}
