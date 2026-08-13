import XCTest
@testable import iTu

@MainActor
final class CalendarParityTests: XCTestCase {
    func testCanonicalCalendarFixtureMatchesNativeSemantics() throws {
        let fixtureURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("fixtures/calendar-semantics-v1.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: fixtureURL)) as? [String: Any])
        let preferences = try XCTUnwrap(fixture["preferences"] as? [String: Any])
        let tasks = try XCTUnwrap(fixture["tasks"] as? [[String: Any]])

        XCTAssertEqual(fixture["version"] as? Int, 1)
        XCTAssertEqual(preferences["collapsedGroupIds"] as? [String], ["project:inbox", "calendar:calendar-hidden"])
        XCTAssertTrue((tasks[0]["expected"] as? [String: Any])?["sourceId"] is NSNull)
    }

    func testCalendarTimelineDecodingDefaultsDueEventsToAllDay() throws {
        let data = #"{"id":"task-1","kind":"TASK_DUE","title":"Plan","startAt":"2026-08-10T09:00:00Z","readOnly":false}"#.data(using: .utf8)!
        let item = try JSONDecoder().decode(CalendarTimelineItem.self, from: data)
        XCTAssertTrue(item.allDay)
        XCTAssertEqual(item.kind, "TASK_DUE")
        XCTAssertFalse(item.readOnly)
    }

    func testCalendarPreferencesDefaultShowsEveryKindAndCompletedTasks() {
        let preferences = CalendarPreferencesModel()
        XCTAssertEqual(preferences.zoom, "WEEK")
        XCTAssertTrue(preferences.showCompleted)
        XCTAssertEqual(Set(preferences.visibleKinds), Set(["TASK_DURATION", "TASK_DUE", "FOCUS_SESSION", "EXTERNAL_EVENT"]))
        XCTAssertTrue(preferences.collapsedGroupIds.isEmpty)
    }

    func testCalendarPreferencesMutationPersistsAcrossRestartAndProtectsPendingRemoteValue() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-calendar-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let store = OfflineStore(accountID: "calendar-user", baseURL: root)
        _ = try await store.load()
        let model = AppModel()
        model.offlineStore = store
        model.apply(await store.snapshot())

        await model.updateCalendarPreferences([
            "zoom": .string("MONTH"),
            "showCompleted": .bool(false),
            "visibleKinds": .array([.string("TASK_DUE")]),
            "collapsedGroupIds": .array([.string("focus")])
        ])

        let local = await store.snapshot()
        XCTAssertEqual(local.calendarPreferences.zoom, "MONTH")
        XCTAssertFalse(local.calendarPreferences.showCompleted)
        XCTAssertEqual(local.calendarPreferences.visibleKinds, ["TASK_DUE"])
        XCTAssertEqual(local.mutations.last?.kind, "calendarpreferences.update")

        let remote = CalendarPreferencesModel(
            zoom: "DAY",
            visibleKinds: ["FOCUS_SESSION"],
            showCompleted: true,
            collapsedGroupIds: []
        )
        let remoteValue = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(remote))
        let afterPull = try await store.applySync(
            acknowledgedMutationIds: [],
            conflicts: [],
            changes: [SyncChange(
                cursor: 4,
                entityType: "calendarpreferences",
                entityId: "calendar",
                deleted: false,
                data: .object(["calendarPreferences": remoteValue]),
                complete: true
            )],
            cursor: "4"
        )

        XCTAssertEqual(afterPull.calendarPreferences, local.calendarPreferences)
        let restarted = try await OfflineStore(accountID: "calendar-user", baseURL: root).load()
        XCTAssertEqual(restarted.calendarPreferences, local.calendarPreferences)
        XCTAssertEqual(restarted.mutations.last?.kind, "calendarpreferences.update")
    }

    func testCalendarPreferencesRemoteChangeAppliesWithoutPendingEdit() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-calendar-remote-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let store = OfflineStore(accountID: "calendar-remote-user", baseURL: root)
        _ = try await store.load()
        let remote = CalendarPreferencesModel(
            zoom: "DAY",
            visibleKinds: ["TASK_DURATION", "EXTERNAL_EVENT"],
            showCompleted: false,
            collapsedGroupIds: ["tasks"]
        )
        let remoteValue = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(remote))

        let snapshot = try await store.applySync(
            acknowledgedMutationIds: [],
            conflicts: [],
            changes: [SyncChange(
                cursor: 7,
                entityType: "calendar_preferences",
                entityId: "calendar",
                deleted: false,
                data: .object(["calendarPreferences": remoteValue]),
                complete: true
            )],
            cursor: "7"
        )

        XCTAssertEqual(snapshot.calendarPreferences, remote)
        XCTAssertEqual(snapshot.cursor, "7")
        XCTAssertTrue(snapshot.mutations.isEmpty)
    }

    func testCalendarTaskSchedulingKeepsDueEventsReadOnlyAndTimedEventsEditable() throws {
        var task = ProductivityTask.optimistic(id: "task-scheduled", title: "Deep work")
        task.scheduledStartAt = "2026-08-10T09:00:00Z"
        task.scheduledEndAt = "2026-08-10T09:30:00Z"
        task.recurrenceRule = "FREQ=WEEKLY"
        XCTAssertEqual(task.scheduledStartAt, "2026-08-10T09:00:00Z")
        XCTAssertEqual(task.scheduledEndAt, "2026-08-10T09:30:00Z")
        XCTAssertEqual(task.recurrenceRule, "FREQ=WEEKLY")

        let response = try JSONDecoder().decode(CalendarTimelineResponse.self, from: Data(#"{"items":[{"id":"task-due","kind":"TASK_DUE","title":"Deep work","startAt":"2026-08-10T09:00:00Z"},{"id":"task-duration","kind":"TASK_DURATION","title":"Deep work","startAt":"2026-08-10T09:00:00Z","endAt":"2026-08-10T09:30:00Z","readOnly":false,"allDay":false,"taskId":"task-scheduled"}]}"#.utf8))
        let due = response.items[0]
        let duration = response.items[1]

        XCTAssertTrue(due.readOnly)
        XCTAssertTrue(due.allDay)
        XCTAssertFalse(duration.readOnly)
        XCTAssertFalse(duration.allDay)
        XCTAssertEqual(duration.taskId, task.id)
    }

    func testAppModelApplyProjectsSnapshotAndFiltersSystemGrowthRows() {
        let model = AppModel()
        var snapshot = OfflineSnapshot()
        let task = ProductivityTask.optimistic(id: "projection-task", title: "Projected")
        let visibleAttribute = UserAttribute(id: "attr-focus", name: "Focus", level: 2, currentXP: 100, nextLevelXP: 200, icon: "timer", color: "mint")
        let generalAttribute = UserAttribute(id: "attr-general", name: "General", level: 1, currentXP: 0, nextLevelXP: 100, icon: "circle", color: "gray")
        let visibleSkill = SkillNode(id: "skill-visible", name: "Visible", description: "", level: 1, maxLevel: 2, icon: "star", category: "Focus")
        let archivedSkill = SkillNode(id: "skill-archived", name: "Archived", description: "", level: 1, maxLevel: 2, icon: "archivebox", category: "Focus", archivedAt: "2026-08-10T00:00:00Z")
        let preferences = CalendarPreferencesModel(zoom: "MONTH", visibleKinds: ["TASK_DUE"], showCompleted: false, collapsedGroupIds: ["group"])
        snapshot.tasks = [task]
        snapshot.attributes = [generalAttribute, visibleAttribute]
        snapshot.skills = [visibleSkill, archivedSkill]
        snapshot.calendarPreferences = preferences

        model.apply(snapshot)

        XCTAssertEqual(model.tasks, [task])
        XCTAssertEqual(model.attributes.map(\.id), [visibleAttribute.id])
        XCTAssertEqual(model.skills.map(\.id), [visibleSkill.id])
        XCTAssertEqual(model.calendarPreferences, preferences)
    }
}
