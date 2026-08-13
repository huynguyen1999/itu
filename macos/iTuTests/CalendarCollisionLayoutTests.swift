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
}
