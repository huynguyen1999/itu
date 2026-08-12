import XCTest
@testable import iTu

final class NavigationParityTests: XCTestCase {
    func testPrimaryGroupsAndEntriesMatchCanonicalOrder() {
        XCTAssertEqual(NavigationSchema.primaryGroups.map(\.id), ["productivity", "tracking", "knowledge", "system"])
        XCTAssertEqual(NavigationSchema.primaryGroups.map(\.title), ["Productivity", "Tracking", "Knowledge", "System"])

        XCTAssertEqual(NavigationSchema.primaryGroups.map { $0.entries.map(\.id) }, [
            ["home", "plan", "matrix", "focus", "calendar"],
            ["habits", "statistics", "budget", "gym"],
            ["journal", "learn", "growth"],
            ["conflicts", "notifications", "trash", "profile", "settings"]
        ])
    }

    func testPrimaryEntriesMapToAppSectionsAndPlanUsesInbox() {
        let entries = NavigationSchema.primaryGroups.flatMap(\.entries)
        XCTAssertEqual(entries.map(\.destination), [
            .home, .inbox, .matrix, .focus, .calendar,
            .habits, .statistics, .budget, .gym,
            .journal, .learn, .growth,
            .conflicts, .notifications, .trash, .profile, .settings
        ])
        XCTAssertEqual(entries.first { $0.id == "plan" }?.destination, .inbox)
    }
}
