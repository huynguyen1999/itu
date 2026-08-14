import XCTest
@testable import iTu

final class CalendarCollisionLayoutTests: XCTestCase {
    func testNonOverlappingItemsReuseLaneZero() {
        let date1 = Date(timeIntervalSince1970: 1700000000)
        let date2 = Date(timeIntervalSince1970: 1700003600)
        let date3 = Date(timeIntervalSince1970: 1700007200)

        let items: [(id: String, startAt: Date, endAt: Date?)] = [
            ("A", date1, date2),
            ("B", date2, date3)
        ]

        let result = CalendarCollisionLayout.calculate(items: items)

        XCTAssertEqual(result["A"]?.lane, 0)
        XCTAssertEqual(result["B"]?.lane, 0)
        XCTAssertEqual(result["A"]?.laneCount, 1)
        XCTAssertEqual(result["B"]?.laneCount, 1)
    }

    func testOverlappingItemsSplitIntoLanes() {
        let date1 = Date(timeIntervalSince1970: 1700000000)
        let date2 = Date(timeIntervalSince1970: 1700001800)
        let date3 = Date(timeIntervalSince1970: 1700003600)

        let items: [(id: String, startAt: Date, endAt: Date?)] = [
            ("A", date1, date3),
            ("B", date2, date3)
        ]

        let result = CalendarCollisionLayout.calculate(items: items)

        XCTAssertEqual(result["A"]?.lane, 0)
        XCTAssertEqual(result["B"]?.lane, 1)
        XCTAssertEqual(result["A"]?.laneCount, 2)
        XCTAssertEqual(result["B"]?.laneCount, 2)
    }

    func testBoundaryContactIsNotOverlap() {
        let date1 = Date(timeIntervalSince1970: 1700000000)
        let date2 = Date(timeIntervalSince1970: 1700003600)

        let items: [(id: String, startAt: Date, endAt: Date?)] = [
            ("A", date1, date2),
            ("B", date2, Date(timeIntervalSince1970: 1700007200))
        ]

        let result = CalendarCollisionLayout.calculate(items: items)

        XCTAssertEqual(result["A"]?.lane, 0)
        XCTAssertEqual(result["B"]?.lane, 0)
    }

    func testWeekProjectionPartitionsAndPlacesTimedItemsOnce() {
        let calendar = Calendar(identifier: .gregorian)
        let day = calendar.startOfDay(for: Date(timeIntervalSince1970: 1_700_000_000))
        let nextDay = calendar.date(byAdding: .day, value: 1, to: day)!
        let first = CalendarItem(
            id: "first", title: "First", start: day.addingTimeInterval(3_600), end: day.addingTimeInterval(7_200),
            kind: "TASK_DURATION", taskID: "first", readOnly: false, allDay: false,
            sourceID: nil, sourceName: nil, color: nil, priority: nil
        )
        let second = CalendarItem(
            id: "second", title: "Second", start: day.addingTimeInterval(5_400), end: day.addingTimeInterval(9_000),
            kind: "FOCUS_SESSION", taskID: nil, readOnly: true, allDay: false,
            sourceID: nil, sourceName: nil, color: nil, priority: nil
        )
        let allDay = CalendarItem(
            id: "all-day", title: "All day", start: day, end: nextDay,
            kind: "EXTERNAL_EVENT", taskID: nil, readOnly: true, allDay: true,
            sourceID: nil, sourceName: nil, color: nil, priority: nil
        )

        let projection = CalendarWeekProjection.build(days: [day, nextDay], items: [first, second, allDay])

        XCTAssertEqual(projection.allDayOrSpanning.map(\.id), ["all-day"])
        XCTAssertEqual(projection.placedHeaders.count, 1)
        XCTAssertEqual(projection.placedHeaders[0].id, "all-day")
        XCTAssertEqual(projection.placedHeaders[0].startDay, 0)
        XCTAssertEqual(projection.placedHeaders[0].endDay, 0)
        XCTAssertEqual(projection.placedHeaders[0].row, 0)
        XCTAssertEqual(projection.timedItemsByDay[0].map(\.id), ["first", "second"])
        XCTAssertTrue(projection.timedItemsByDay[1].isEmpty)
        XCTAssertEqual(projection.placedItemsByDay[0]["first"]?.laneCount, 2)
        XCTAssertEqual(projection.placedItemsByDay[0]["second"]?.lane, 1)
    }

    func testWeekProjectionPlacesSpanningAndOverlappingHeadersInRows() {
        let calendar = Calendar(identifier: .gregorian)
        let day0 = calendar.startOfDay(for: Date(timeIntervalSince1970: 1_700_000_000))
        let days = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: day0) }

        let spanningItem = CalendarItem(
            id: "spanning-1", title: "Conference",
            start: days[1].addingTimeInterval(3600 * 9),
            end: days[3].addingTimeInterval(3600 * 17),
            kind: "EXTERNAL_EVENT", taskID: nil, readOnly: true, allDay: false,
            sourceID: nil, sourceName: nil, color: nil, priority: nil
        )
        let singleDayDue = CalendarItem(
            id: "due-1", title: "Project Milestone",
            start: days[2].addingTimeInterval(3600 * 18),
            end: nil,
            kind: "TASK_DUE", taskID: "t-1", readOnly: false, allDay: false,
            dueAt: days[2].addingTimeInterval(3600 * 18),
            sourceID: nil, sourceName: nil, color: nil, priority: "high"
        )
        let nonOverlappingAllDay = CalendarItem(
            id: "allday-friday", title: "Friday Off",
            start: days[4],
            end: calendar.date(byAdding: .day, value: 1, to: days[4]),
            kind: "EXTERNAL_EVENT", taskID: nil, readOnly: true, allDay: true,
            sourceID: nil, sourceName: nil, color: nil, priority: nil
        )

        let projection = CalendarWeekProjection.build(days: days, items: [spanningItem, singleDayDue, nonOverlappingAllDay])

        XCTAssertEqual(projection.placedHeaders.count, 3)
        // Spanning item covers days 1..3 and takes row 0
        let spanningHeader = projection.placedHeaders.first { $0.id == "spanning-1" }
        XCTAssertNotNil(spanningHeader)
        XCTAssertEqual(spanningHeader?.startDay, 1)
        XCTAssertEqual(spanningHeader?.endDay, 3)
        XCTAssertEqual(spanningHeader?.span, true)
        XCTAssertEqual(spanningHeader?.row, 0)

        // Due date is on day 2, which overlaps spanningItem (days 1..3, row 0), so it takes row 1
        let dueHeader = projection.placedHeaders.first { $0.id == "due-1" }
        XCTAssertNotNil(dueHeader)
        XCTAssertEqual(dueHeader?.startDay, 2)
        XCTAssertEqual(dueHeader?.endDay, 2)
        XCTAssertEqual(dueHeader?.row, 1)

        // Friday all-day is on day 4, which does not overlap day 1..3, so it can reuse row 0
        let fridayHeader = projection.placedHeaders.first { $0.id == "allday-friday" }
        XCTAssertNotNil(fridayHeader)
        XCTAssertEqual(fridayHeader?.startDay, 4)
        XCTAssertEqual(fridayHeader?.endDay, 4)
        XCTAssertEqual(fridayHeader?.row, 0)

        XCTAssertEqual(projection.maxHeaderRow, 2)
    }
}
