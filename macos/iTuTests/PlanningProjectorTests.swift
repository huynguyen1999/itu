import XCTest
@testable import iTu

@MainActor
final class PlanningProjectorTests: XCTestCase {
    func testSortingModes() {
        let tasks = [
            ProductivityTask(id: "1", taskListId: "inbox", title: "B Task", descriptionMarkdown: "", priority: .low, important: false, urgent: false, urgencyReason: "", status: .planned, sortOrder: 2.0, version: 1),
            ProductivityTask(id: "2", taskListId: "inbox", title: "A Task", descriptionMarkdown: "", priority: .high, important: true, urgent: false, urgencyReason: "", status: .planned, sortOrder: 1.0, version: 1)
        ]

        let titleSorted = PlanningTaskProjector.sort(tasks, by: .title)
        XCTAssertEqual(titleSorted.first?.id, "2")

        let prioritySorted = PlanningTaskProjector.sort(tasks, by: .priority)
        XCTAssertEqual(prioritySorted.first?.id, "2")
    }

    func testGroupingByStatus() {
        let tasks = [
            ProductivityTask(id: "1", taskListId: "inbox", title: "Task 1", descriptionMarkdown: "", priority: .low, important: false, urgent: false, urgencyReason: "", status: .planned, sortOrder: 1.0, version: 1),
            ProductivityTask(id: "2", taskListId: "inbox", title: "Task 2", descriptionMarkdown: "", priority: .high, important: true, urgent: false, urgencyReason: "", status: .inProgress, sortOrder: 2.0, version: 1)
        ]

        let settings = PlanningViewSettings(groupMode: .status)
        let groups = PlanningTaskProjector.project(tasks: tasks, settings: settings)
        XCTAssertEqual(groups.count, 2)
        XCTAssertTrue(groups.contains { $0.id == TaskStatus.planned.rawValue })
        XCTAssertTrue(groups.contains { $0.id == TaskStatus.inProgress.rawValue })
    }

    func testGroupingByTagUsesTaskTagAssignments() {
        let tasks = [
            ProductivityTask(id: "1", taskListId: "inbox", title: "Tagged", descriptionMarkdown: "", priority: .low, important: false, urgent: false, urgencyReason: "", status: .planned, sortOrder: 1.0, version: 1),
            ProductivityTask(id: "2", taskListId: "inbox", title: "Untagged", descriptionMarkdown: "", priority: .low, important: false, urgent: false, urgencyReason: "", status: .planned, sortOrder: 2.0, version: 1)
        ]
        let tags = [TagModel(id: "tag-1", name: "Focus", color: nil, taskCount: 1)]

        let groups = PlanningTaskProjector.project(
            tasks: tasks,
            tags: tags,
            tagIdsByTaskID: ["1": ["tag-1"]],
            settings: PlanningViewSettings(groupMode: .tag)
        )

        XCTAssertEqual(groups.map(\.id), ["tag-Focus", "untagged"])
        XCTAssertEqual(groups.first?.tasks.map(\.id), ["1"])
        XCTAssertEqual(groups.last?.tasks.map(\.id), ["2"])
    }

    func testIndependentPerViewSettings() {
        let store = SettingsStore()
        let allSettings = PlanningViewSettings(sortMode: .priority, groupMode: .project)
        let todaySettings = PlanningViewSettings(sortMode: .manual, groupMode: .time)

        store.updatePlanningSettings(for: .all, settings: allSettings)
        store.updatePlanningSettings(for: .today, settings: todaySettings)

        XCTAssertEqual(store.planningSettings(for: .all).groupMode, .project)
        XCTAssertEqual(store.planningSettings(for: .today).groupMode, .time)
    }
}
