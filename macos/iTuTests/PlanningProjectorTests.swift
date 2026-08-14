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

    func testFlattenedProjectionKeepsCollapsedGroupsLazy() {
        let tasks = PlanningPerformanceFixtures.tasks(active: 20)
        let projection = PlanningTaskProjector.render(
            tasks: tasks,
            section: .inbox,
            settings: PlanningViewSettings(groupMode: .none),
            hideCompleted: false
        )

        let collapsed = PlanningTaskProjector.flatten(projection, collapsedGroups: ["all"])
        XCTAssertEqual(collapsed.map(\.id), ["group:all"])

        let expanded = PlanningTaskProjector.flatten(projection, collapsedGroups: [])
        XCTAssertEqual(expanded.count, 21)
        XCTAssertEqual(expanded.first?.id, "group:all")
        XCTAssertEqual(expanded.dropFirst().first?.id, "task:all:fixture-task-000")
        XCTAssertEqual(expanded.last?.id, "task:all:fixture-task-019")
    }

    func testPresenterPreparesMetadataAndGrowthRewardsOutsideTheRow() {
        let calendar = Calendar(identifier: .gregorian)
        let day = calendar.date(from: DateComponents(year: 2026, month: 8, day: 14, hour: 12))!
        var task = ProductivityTask.optimistic(
            id: "presenter-task",
            title: "Presenter task",
            descriptionMarkdown: "Details",
            priority: .high,
            dueAt: iTuDateSupport.string(from: calendar.date(byAdding: .day, value: -2, to: day)!)
        )
        task.reminders = [
            TaskReminderModel(id: "ignored", remindAt: "not-a-date", status: "DISMISSED", persistent: false),
            TaskReminderModel(id: "scheduled", remindAt: iTuDateSupport.string(from: day), status: "SCHEDULED", persistent: false)
        ]
        let skill = GrowthSkillDTO(
            id: "skill-1", key: nil, name: "Focus", level: 1, maxLevel: 5,
            currentXp: 0, nextLevelXp: 100, category: nil, kind: "SKILL",
            description: nil, icon: "target", color: nil, baseXp: 100, version: 1
        )
        let rule = GrowthEarningRuleDTO(
            id: "rule-1", sourceType: .task, sourceId: task.id, coinReward: 5,
            accountXp: 10, enabled: true, scalingMode: .fixed, maxRewardCap: nil,
            version: 1,
            skillAwards: [GrowthEarningRuleSkillAwardDTO(skillId: "skill-1", xpReward: 30, skill: skill)],
            itemAwards: []
        )

        let presentation = TaskRowPresenter.make(
            task: task,
            growthRule: rule,
            archivedSkillIDs: [],
            day: day,
            hideDetails: false,
            calendar: calendar
        )

        XCTAssertEqual(presentation.due?.title, "2 Days Overdue")
        XCTAssertEqual(presentation.due?.kind, .overdueDue)
        XCTAssertEqual(presentation.reminder?.title, "Today")
        XCTAssertEqual(presentation.priority?.kind, .highPriority)
        XCTAssertEqual(presentation.description, "Details")
        XCTAssertEqual(presentation.rewards.count, 3)
        XCTAssertTrue(presentation.rewards.contains { if case .accountXP(10) = $0 { true } else { false } })
        XCTAssertTrue(presentation.rewards.contains { if case .coins(5) = $0 { true } else { false } })
    }

    func testPresenterHidesDetailsWithoutChangingTaskIdentity() {
        var task = ProductivityTask.optimistic(
            id: "hidden-details",
            title: "Hidden details",
            descriptionMarkdown: "Do not show"
        )
        task.dueAt = "2026-08-14"
        let presentation = TaskRowPresenter.make(
            task: task,
            growthRule: nil,
            archivedSkillIDs: [],
            day: Date(timeIntervalSince1970: 0),
            hideDetails: true
        )

        XCTAssertEqual(presentation.id, task.id)
        XCTAssertEqual(presentation.title, task.title)
        XCTAssertNil(presentation.due)
        XCTAssertNil(presentation.description)
    }

    func testPresenterHandlesFutureCompletedCanceledAndSnoozedMetadata() {
        let calendar = Calendar(identifier: .gregorian)
        let day = calendar.date(from: DateComponents(year: 2026, month: 8, day: 14, hour: 12))!
        let futureDate = calendar.date(byAdding: .day, value: 3, to: day)!

        var future = ProductivityTask.optimistic(
            id: "future-task",
            title: "Future",
            dueAt: iTuDateSupport.string(from: futureDate)
        )
        future.reminders = [
            TaskReminderModel(id: "snoozed", remindAt: iTuDateSupport.string(from: futureDate), status: "SNOOZED", persistent: false)
        ]
        let futurePresentation = TaskRowPresenter.make(
            task: future,
            growthRule: nil,
            archivedSkillIDs: [],
            day: day,
            hideDetails: false,
            calendar: calendar
        )
        XCTAssertEqual(futurePresentation.due?.kind, .due)
        XCTAssertEqual(futurePresentation.reminder?.kind, .reminder)

        var completed = ProductivityTask.optimistic(
            id: "completed-task",
            title: "Completed",
            dueAt: iTuDateSupport.string(from: calendar.date(byAdding: .day, value: -1, to: day)!)
        )
        completed.status = .completed
        let completedPresentation = TaskRowPresenter.make(
            task: completed,
            growthRule: nil,
            archivedSkillIDs: [],
            day: day,
            hideDetails: false,
            calendar: calendar
        )
        XCTAssertEqual(completedPresentation.due?.title, calendar.date(byAdding: .day, value: -1, to: day)!.formatted(iTuDateSupport.dueDay))

        var canceled = ProductivityTask.optimistic(id: "canceled-task", title: "Canceled")
        canceled.status = .canceled
        canceled.reminders = [TaskReminderModel(id: "dismissed", remindAt: "not-a-date", status: "DISMISSED", persistent: false)]
        let canceledPresentation = TaskRowPresenter.make(
            task: canceled,
            growthRule: nil,
            archivedSkillIDs: [],
            day: day,
            hideDetails: false,
            calendar: calendar
        )
        XCTAssertNil(canceledPresentation.due)
        XCTAssertNil(canceledPresentation.reminder)
    }

    func testPresenterExcludesArchivedSkillsAndKeepsItemRewards() {
        let task = ProductivityTask.optimistic(id: "reward-task", title: "Rewards")
        let activeSkill = GrowthSkillDTO(
            id: "active-skill", key: nil, name: "Active", level: 1, maxLevel: 5,
            currentXp: 0, nextLevelXp: 100, category: nil, kind: "SKILL",
            description: nil, icon: "target", color: nil, baseXp: 100, version: 1
        )
        let archivedSkill = GrowthSkillDTO(
            id: "archived-skill", key: nil, name: "Archived", level: 1, maxLevel: 5,
            currentXp: 0, nextLevelXp: 100, category: nil, kind: "SKILL",
            description: nil, icon: "archivebox", color: nil, baseXp: 100, version: 1
        )
        let item = GrowthEarningRuleItemDTO(
            itemId: "potion", quantity: 2,
            item: GrowthAwardItemDTO(id: "potion", name: "Potion", icon: "drop.fill", color: nil)
        )
        let rule = GrowthEarningRuleDTO(
            id: "reward-rule", sourceType: .task, sourceId: task.id, coinReward: 0,
            accountXp: 10, enabled: true, scalingMode: .fixed, maxRewardCap: nil, version: 1,
            skillAwards: [
                GrowthEarningRuleSkillAwardDTO(skillId: "active-skill", xpReward: 10, skill: activeSkill),
                GrowthEarningRuleSkillAwardDTO(skillId: "archived-skill", xpReward: 10, skill: archivedSkill)
            ],
            itemAwards: [item]
        )

        let presentation = TaskRowPresenter.make(
            task: task,
            growthRule: rule,
            archivedSkillIDs: ["archived-skill"],
            day: Date(timeIntervalSince1970: 0),
            hideDetails: false
        )

        XCTAssertEqual(presentation.rewards.count, 3)
        XCTAssertTrue(presentation.rewards.contains {
            if case let .skillXP(_, awards) = $0 { return awards.map(\.skillId) == ["active-skill"] }
            return false
        })
        XCTAssertTrue(presentation.rewards.contains {
            if case let .item(award) = $0 { return award.itemId == item.itemId }
            return false
        })
    }

    func testPerformanceFixturesCoverRequestedSizes() {
        for count in [20, 50, 100, 200] {
            XCTAssertEqual(PlanningPerformanceFixtures.tasks(active: count).count, count)
        }
        XCTAssertEqual(PlanningPerformanceFixtures.tasks(active: 100, completed: 100).count, 200)
        XCTAssertEqual(PlanningPerformanceFixtures.tasks(active: 200, completed: 200).count, 400)
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
