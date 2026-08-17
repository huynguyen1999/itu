import XCTest
@testable import iTuDomain

final class JSONValueTests: XCTestCase {
    func testCasesAccessorsAndNestedCodableRoundTrip() throws {
        XCTAssertEqual(JSONValue.string("value").stringValue, "value")
        XCTAssertEqual(JSONValue.number(42.5).numberValue, 42.5)
        XCTAssertEqual(JSONValue.number(42).intValue, 42)
        XCTAssertEqual(JSONValue.bool(true).boolValue, true)
        XCTAssertEqual(JSONValue.object(["key": .string("value")]).objectValue?["key"]?.stringValue, "value")
        XCTAssertEqual(JSONValue.array([.string("value")]).arrayValue?.first?.stringValue, "value")
        XCTAssertNil(JSONValue.null.stringValue)

        let value: JSONValue = .object([
            "string": .string("value"),
            "number": .number(42.5),
            "bool": .bool(true),
            "array": .array([.number(7), .null]),
            "object": .object(["nested": .string("yes")]),
            "null": .null
        ])
        XCTAssertEqual(try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value)), value)
    }
}
