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

    func testPlanningNavigationWith36CompletedTasks() {
        let model = AppModel()
        let formatter = ISO8601DateFormatter()
        let rule = GrowthEarningRuleDTO(
            id: "rule-1",
            sourceType: .task,
            sourceId: "rule-1",
            coinReward: 5,
            accountXp: 30,
            enabled: true,
            scalingMode: .fixed,
            maxRewardCap: nil,
            version: 1,
            skillAwards: [
                GrowthEarningRuleSkillAwardDTO(
                    skillId: "skill-1",
                    xpReward: 30,
                    skill: GrowthSkillDTO(
                        id: "skill-1",
                        key: "dev",
                        name: "Development",
                        level: 1,
                        maxLevel: 10,
                        currentXp: 0,
                        nextLevelXp: 100,
                        levelStartXp: nil,
                        progressXp: nil,
                        requiredXp: nil,
                        category: nil,
                        kind: "SKILL",
                        description: nil,
                        icon: "sparkles",
                        color: nil,
                        baseXp: 100,
                        version: 1,
                        archivedAt: nil
                    )
                )
            ],
            itemAwards: []
        )
        model.tasks = (0..<36).map { index in
            var task = ProductivityTask.optimistic(
                id: "completed-\(index)",
                title: "Completed task \(index)",
                priority: .none,
                dueAt: formatter.string(from: Date()),
                important: false
            )
            task.status = .completed
            return task
        }
        for task in model.tasks {
            model.growthEarningRules[task.id] = rule
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
            for _ in 0..<5 {
                model.selectedSection = .today
                render()
                model.selectedSection = .inbox
                render()
            }
        }
    }

    func testProfilingTaskListViewDirectly() {
        let model = AppModel()
        let formatter = ISO8601DateFormatter()
        let rule = GrowthEarningRuleDTO(
            id: "rule-1",
            sourceType: .task,
            sourceId: "rule-1",
            coinReward: 5,
            accountXp: 30,
            enabled: true,
            scalingMode: .fixed,
            maxRewardCap: nil,
            version: 1,
            skillAwards: [
                GrowthEarningRuleSkillAwardDTO(
                    skillId: "skill-1",
                    xpReward: 30,
                    skill: GrowthSkillDTO(
                        id: "skill-1",
                        key: "dev",
                        name: "Development",
                        level: 1,
                        maxLevel: 10,
                        currentXp: 0,
                        nextLevelXp: 100,
                        levelStartXp: nil,
                        progressXp: nil,
                        requiredXp: nil,
                        category: nil,
                        kind: "SKILL",
                        description: nil,
                        icon: "sparkles",
                        color: nil,
                        baseXp: 100,
                        version: 1,
                        archivedAt: nil
                    )
                )
            ],
            itemAwards: []
        )
        model.tasks = (0..<36).map { index in
            var task = ProductivityTask.optimistic(
                id: "completed-\(index)",
                title: "Completed task \(index)",
                priority: .none,
                dueAt: formatter.string(from: Date()),
                important: false
            )
            task.status = .completed
            return task
        }
        for task in model.tasks {
            model.growthEarningRules[task.id] = rule
        }

        let start = CFAbsoluteTimeGetCurrent()
        for _ in 0..<10 {
            _ = ImageRenderer(
                content: TaskListView(section: .today)
                    .environment(model)
                    .frame(width: 900, height: 780)
            ).nsImage
        }
        let elapsed = (CFAbsoluteTimeGetCurrent() - start) * 1000.0 / 10.0
        print(">>> TaskListView (with 36 completed tasks) single render time: \(elapsed) ms")
    }

    func testProfiling36RowsDirectly() {
        let model = AppModel()
        let formatter = ISO8601DateFormatter()
        let tasks = (0..<36).map { index in
            var task = ProductivityTask.optimistic(
                id: "completed-\(index)",
                title: "Completed task \(index)",
                priority: .none,
                dueAt: formatter.string(from: Date()),
                important: false
            )
            task.status = .completed
            return task
        }

        let start1 = CFAbsoluteTimeGetCurrent()
        for _ in 0..<10 {
            _ = ImageRenderer(
                content: VStack {
                    ForEach(tasks) { task in
                        TaskRow(
                            task: task,
                            growthRule: nil,
                            archivedSkillIDs: [],
                            hideDetails: false,
                            onEdit: {}
                        )
                    }
                }
                .environment(model)
                .frame(width: 900, height: 780)
            ).nsImage
        }
        let elapsed1 = (CFAbsoluteTimeGetCurrent() - start1) * 1000.0 / 10.0
        print(">>> 36 standard TaskRows render time: \(elapsed1) ms")
    }
}



