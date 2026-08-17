import XCTest
@testable import iTuDomain

final class PortableModelsTests: XCTestCase {
    func testPortableModelsFactoriesAndCodableRoundTrips() throws {
        let task = ProductivityTask.optimistic(id: "task-1", title: "Plan", priority: .high)
        XCTAssertEqual(task.status, .inbox)
        XCTAssertTrue(task.urgent)
        XCTAssertEqual(try JSONDecoder().decode(ProductivityTask.self, from: JSONEncoder().encode(task)), task)

        let focus = FocusSession.optimistic(id: "focus-1", task: task, phase: .work, plannedSeconds: 1500, startedAt: "2026-01-01T00:00:00Z")
        XCTAssertEqual(focus.taskId, task.id)
        XCTAssertEqual(try JSONDecoder().decode(FocusSession.self, from: JSONEncoder().encode(focus)), focus)

        let habit = HabitModel(id: "habit-1", name: "Read")
        XCTAssertEqual(try JSONDecoder().decode(HabitModel.self, from: JSONEncoder().encode(habit)), habit)

        let note = JournalNoteModel(id: "note-1", userId: "user-1", title: "Today", contentMarkdown: "# Hello *world*", entryDate: "2026-01-01", updatedAt: "2026-01-01T00:00:00Z", contextData: .object(["task": .string(task.id)]))
        XCTAssertEqual(note.previewText, "Hello world")
        XCTAssertEqual(try JSONDecoder().decode(JournalNoteModel.self, from: JSONEncoder().encode(note)), note)

        let due = CalendarTimelineItem(id: "due-1", kind: "TASK_DUE", title: "Due", startAt: "2026-01-01T00:00:00Z")
        XCTAssertTrue(due.allDay)
        let dueJSON = #"{"id":"due-1","kind":"TASK_DUE","title":"Due","startAt":"2026-01-01T00:00:00Z"}"#.data(using: .utf8)!
        XCTAssertTrue(try JSONDecoder().decode(CalendarTimelineItem.self, from: dueJSON).allDay)

        let receipt = GrowthAwardReceipt(sourceType: .task, sourceId: task.id, title: task.title, accountAward: GrowthAccountAward(amount: 5, beforeXp: 10, afterXp: 15, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100), coinAward: GrowthCoinAward(amount: 2, balanceAfter: 12), receiptKey: "receipt-1")
        XCTAssertEqual(try JSONDecoder().decode(GrowthAwardReceipt.self, from: JSONEncoder().encode(receipt)), receipt)
    }
}
