import XCTest
@testable import iTu

final class CalendarParityTests: XCTestCase {
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
}
