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

    func testCalendarDayDifferenceCountsYesterdayAfterMidnightAsOneDay() {
        let calendar = Calendar.current
        let now = calendar.date(from: DateComponents(year: 2026, month: 8, day: 14, hour: 1))!
        let yesterdayLate = calendar.date(from: DateComponents(year: 2026, month: 8, day: 13, hour: 23, minute: 30))!

        XCTAssertEqual(iTuDateSupport.calendarDayDifference(from: yesterdayLate, to: now), 1)
    }

    func testRenderProjectionSortsAndPartitionsOnce() {
        var completed = ProductivityTask.optimistic(id: "completed", title: "Completed")
        completed.status = .completed
        let active = ProductivityTask.optimistic(id: "active", title: "Active")

        let projection = PlanningTaskProjector.render(
            tasks: [completed, active],
            section: .inbox,
            settings: PlanningViewSettings(sortMode: .title),
            hideCompleted: false
        )

        XCTAssertEqual(projection.activeGroups.flatMap(\.tasks).map(\.id), ["active"])
        XCTAssertEqual(projection.completedTasks.map(\.id), ["completed"])
    }

    func testMatrixProjectionClassifiesAndPartitionsTasks() {
        let importantUrgent = ProductivityTask.optimistic(id: "q1", title: "First", priority: .high, important: true, urgentOverride: true)
        let important = ProductivityTask.optimistic(id: "q2", title: "Later", priority: .high, important: true, urgentOverride: false)
        var canceled = ProductivityTask.optimistic(id: "q3", title: "Canceled", urgentOverride: true)
        canceled.status = .canceled

        let projection = MatrixProjection.build(tasks: [important, canceled, importantUrgent], settings: MatrixSettings(), query: "", priorityFilter: nil)

        XCTAssertEqual(projection[.q1].activeTasks.map(\.id), ["q1"])
        XCTAssertEqual(projection[.q2].activeTasks.map(\.id), ["q2"])
        XCTAssertEqual(projection[.q3].canceledTasks.map(\.id), ["q3"])
        XCTAssertEqual(projection.mappedCount, 2)
    }

    func testUpcomingProjectionBucketsTasksInOnePass() {
        let calendar = Calendar.current
        let now = calendar.date(from: DateComponents(year: 2026, month: 8, day: 14, hour: 9))!
        let today = calendar.date(byAdding: .hour, value: 2, to: now)!
        let daySix = calendar.date(byAdding: .day, value: 6, to: now)!
        let outside = calendar.date(byAdding: .day, value: 7, to: now)!
        let tasks = [
            ProductivityTask.optimistic(id: "today", title: "Today", dueAt: iTuDateSupport.string(from: today)),
            ProductivityTask.optimistic(id: "day-six", title: "Day six", dueAt: iTuDateSupport.string(from: daySix)),
            ProductivityTask.optimistic(id: "outside", title: "Outside", dueAt: iTuDateSupport.string(from: outside))
        ]

        let groups = UpcomingProjection.build(tasks: tasks, now: now)

        XCTAssertEqual(groups.count, 7)
        XCTAssertEqual(groups[0].tasks.map(\.id), ["today"])
        XCTAssertEqual(groups[6].tasks.map(\.id), ["day-six"])
        XCTAssertTrue(groups.flatMap(\.tasks).allSatisfy { $0.id != "outside" })
    }
}
