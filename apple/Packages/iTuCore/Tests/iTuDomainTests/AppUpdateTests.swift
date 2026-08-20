import XCTest
@testable import iTuDomain

final class AppUpdateTests: XCTestCase {
    func testNumericVersionComparisonPadsMissingComponents() throws {
        XCTAssertTrue(try AppVersion("1.10.0") > AppVersion("1.9.0"))
        XCTAssertTrue(try AppVersion("1.0") == AppVersion("1.0.0"))
        XCTAssertTrue(try AppVersion("1.0.0") > AppVersion("0.99.99"))
    }

    func testPolicyRecalculatesCurrentOptionalAndRequiredStates() throws {
        let policy = AppUpdatePolicy(
            platform: .macos,
            channel: .stable,
            installedVersion: "0.4.0",
            latestVersion: "0.5.0",
            minimumSupportedVersion: "0.3.0",
            status: .optionalUpdate
        )

        XCTAssertEqual(policy.recalculated(for: "0.5.0")?.status, .current)
        XCTAssertEqual(policy.recalculated(for: "0.4.0")?.status, .optionalUpdate)
        XCTAssertEqual(policy.recalculated(for: "0.2.0")?.status, .requiredUpdate)
    }

    func testDecodesBackendWireShape() throws {
        let policy = try JSONDecoder().decode(
            AppUpdatePolicy.self,
            from: #"{"platform":"macos","channel":"stable","installedVersion":"0.4.0","latestVersion":"0.5.0","minimumSupportedVersion":"0.3.0","status":"OPTIONAL_UPDATE","release":{"version":"0.5.0","releasedAt":"2026-08-19T10:00:00Z","title":"iTu 0.5","notes":["Improved sync"]},"update":{"url":"https://updates.example.test/macos/appcast.xml"}}"#.data(using: .utf8)!
        )

        XCTAssertEqual(policy.release?.notes, ["Improved sync"])
        XCTAssertEqual(policy.update?.url.absoluteString, "https://updates.example.test/macos/appcast.xml")
    }
}
