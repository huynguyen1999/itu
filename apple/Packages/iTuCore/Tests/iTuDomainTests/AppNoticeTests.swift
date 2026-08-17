import XCTest
@testable import iTuDomain

final class AppNoticeTests: XCTestCase {
    func testDefaultsAndIdentityBasedEquality() {
        let id = UUID()
        let timestamp = Date(timeIntervalSince1970: 1_700_000_000)
        let first = AppNotice(id: id, title: "First", timestamp: timestamp)
        let sameIdentity = AppNotice(id: id, level: .error, presentation: .blockingDecision, title: "Second", message: "Different", timestamp: timestamp.addingTimeInterval(1))

        XCTAssertEqual(first.level, .info)
        XCTAssertEqual(first.presentation, .toast)
        XCTAssertNil(first.message)
        XCTAssertEqual(first, sameIdentity)
    }
}
