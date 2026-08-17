import XCTest
@testable import iTu

final class ULIDTests: XCTestCase {
    func testGeneratedIdentifierMatchesServerContract() {
        let identifier = ULID.generate(now: Date(timeIntervalSince1970: 1_700_000_000))

        XCTAssertEqual(identifier.count, 26)
        XCTAssertEqual(identifier.prefix(10), "01HF7YAT00")
        XCTAssertTrue(identifier.allSatisfy { "0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains($0) })
    }
}
