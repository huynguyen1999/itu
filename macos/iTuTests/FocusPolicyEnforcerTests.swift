import XCTest
@testable import iTu

@MainActor
final class FocusPolicyEnforcerTests: XCTestCase {
    func testMatcherSupportsSubstringAndExactPatterns() {
        XCTAssertTrue(FocusPolicyEnforcer.matches(url: "https://Example.com/news", patterns: ["example.com"]))
        XCTAssertTrue(FocusPolicyEnforcer.matches(url: "https://example.com", patterns: ["*HTTPS://EXAMPLE.COM"]))
        XCTAssertFalse(FocusPolicyEnforcer.matches(url: "https://example.com/news", patterns: ["*https://example.com"]))
        XCTAssertFalse(FocusPolicyEnforcer.matches(url: "https://example.com", patterns: ["*"]))
        XCTAssertFalse(FocusPolicyEnforcer.matches(url: "https://example.com", patterns: []))
    }

    func testPolicyOnlyRunsForEnabledActiveWorkSession() {
        var session = FocusSession.optimistic(
            id: "policy-test",
            task: nil,
            phase: .work,
            plannedSeconds: 60,
            startedAt: "2026-08-04T00:00:00Z"
        )
        XCTAssertTrue(FocusPolicyEnforcer.isPolicyActive(session: session, enabled: true))

        session.status = .paused
        XCTAssertFalse(FocusPolicyEnforcer.isPolicyActive(session: session, enabled: true))
        session.status = .active
        session = FocusSession(
            id: session.id,
            taskId: session.taskId,
            mode: session.mode,
            phase: .shortBreak,
            status: .active,
            plannedSeconds: session.plannedSeconds,
            accumulatedPauseSecs: session.accumulatedPauseSecs,
            cycle: session.cycle,
            taskTitleSnapshot: session.taskTitleSnapshot,
            customTitle: session.customTitle,
            taskListTitleSnapshot: session.taskListTitleSnapshot,
            projectTitleSnapshot: session.projectTitleSnapshot,
            tagNamesSnapshot: session.tagNamesSnapshot,
            startedAt: session.startedAt,
            pausedAt: session.pausedAt,
            completedAt: session.completedAt,
            adjustedStartedAt: session.adjustedStartedAt,
            adjustedCompletedAt: session.adjustedCompletedAt,
            reflection: session.reflection,
            ownerDeviceId: session.ownerDeviceId,
            version: session.version,
            preset: session.preset
        )
        XCTAssertFalse(FocusPolicyEnforcer.isPolicyActive(session: session, enabled: true))
        XCTAssertFalse(FocusPolicyEnforcer.isPolicyActive(session: session, enabled: false))
    }

    func testAppleScriptEscapesUserValues() {
        let source = FocusPolicyEnforcer.scriptSource(
            applicationName: "Google Chrome",
            blockedURL: "file:///tmp/blocked\"page.html",
            patterns: ["example.com\"\nreturn true"]
        )
        XCTAssertTrue(source.contains("file:///tmp/blocked\\\"page.html"))
        XCTAssertTrue(source.contains("example.com\\\" return true"))
        XCTAssertFalse(source.contains("example.com\"\nreturn true"))
    }
}
