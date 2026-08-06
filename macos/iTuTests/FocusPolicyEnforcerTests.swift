import XCTest
@testable import iTu

@MainActor
final class FocusPolicyEnforcerTests: XCTestCase {
    private final class FakeApplication: RunningApplicationProviding {
        var bundleIdentifier: String?
        var localizedName: String?
        var isTerminated = false
        var hideResult = true
        private(set) var hideCount = 0
        private(set) var activateCount = 0

        init(bundleIdentifier: String?, localizedName: String? = nil) {
            self.bundleIdentifier = bundleIdentifier
            self.localizedName = localizedName ?? bundleIdentifier
        }

        @discardableResult
        func hide() -> Bool {
            hideCount += 1
            return hideResult
        }

        func activate() {
            activateCount += 1
        }
    }

    private final class FakeWorkspace: WorkspaceProviding {
        var frontmostApplication: RunningApplicationProviding?
        var runningApplications: [RunningApplicationProviding] = []
        private var activationHandlers: [(RunningApplicationProviding) -> Void] = []

        @discardableResult
        func observeActivations(_ handler: @escaping (RunningApplicationProviding) -> Void) -> AnyObject {
            activationHandlers.append(handler)
            return self
        }

        func simulateActivation(_ application: RunningApplicationProviding) {
            activationHandlers.forEach { $0(application) }
        }
    }

    @MainActor
    private final class FakeBrowserClient: BrowserAutomationClient {
        var error: Error?
        private(set) var calls: [(browser: SupportedBrowser, patterns: [String])] = []

        func blockMatchingTabs(browser: SupportedBrowser, patterns: [String], blockedPageURL: URL) async throws {
            calls.append((browser, patterns))
            if let error { throw error }
        }
    }

    private let chrome = FakeApplication(
        bundleIdentifier: "com.google.Chrome",
        localizedName: "Google Chrome"
    )
    private let postman = FakeApplication(
        bundleIdentifier: "com.postman.app",
        localizedName: "Postman"
    )

    private func makeSettings(
        focusPolicyEnabled: Bool = true,
        blockedApplications: [BlockedApplication] = [],
        websitePatterns: [String] = [],
        enabledBrowsers: [SupportedBrowser] = [.chrome]
    ) -> FocusSettings {
        var settings = FocusSettings()
        settings.focusPolicyEnabled = focusPolicyEnabled
        settings.blockedApplications = blockedApplications
        settings.blockedWebsitePatterns = websitePatterns
        settings.enabledBrowsers = enabledBrowsers
        return settings
    }

    private func makeSession(phase: FocusPhase = .work, status: FocusSessionStatus = .active) -> FocusSession {
        var session = FocusSession.optimistic(
            id: UUID().uuidString,
            task: nil,
            phase: phase,
            plannedSeconds: 60,
            startedAt: "2026-08-04T00:00:00Z"
        )
        session.status = status
        return session
    }

    private func makeEnforcer(
        workspace: FakeWorkspace,
        client: FakeBrowserClient = FakeBrowserClient()
    ) -> FocusPolicyEnforcer {
        FocusPolicyEnforcer(
            workspace: workspace,
            browserClient: client,
            blockedPageURL: URL(string: "about:blank")!
        )
    }

    private func waitUntil(_ condition: @autoclosure () -> Bool) async {
        for _ in 0..<200 where !condition() {
            await Task.yield()
        }
    }

    // 1. Starts with blocked app frontmost.
    func testStartsWithBlockedAppFrontmost() {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = postman
        let enforcer = makeEnforcer(workspace: workspace)
        let settings = makeSettings(blockedApplications: [.init(bundleIdentifier: "com.postman.app", displayName: "Postman")])

        enforcer.update(session: makeSession(), settings: settings)

        XCTAssertTrue(enforcer.policyActive)
        XCTAssertEqual(postman.hideCount, 1)
        XCTAssertEqual(enforcer.lastBlockedApplicationName, "Postman")
    }

    // 2. Activates blocked app during focus.
    func testActivatingBlockedAppHidesItAndReactivatesLastAllowed() async {
        let allowed = FakeApplication(bundleIdentifier: "com.example.Allowed", localizedName: "Allowed")
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = allowed
        let enforcer = makeEnforcer(workspace: workspace)
        let settings = makeSettings(blockedApplications: [.init(bundleIdentifier: "com.postman.app", displayName: "Postman")])

        enforcer.update(session: makeSession(), settings: settings)

        workspace.simulateActivation(postman)
        await waitUntil(postman.hideCount == 1)

        XCTAssertEqual(postman.hideCount, 1)
        XCTAssertEqual(allowed.activateCount, 1)
        XCTAssertEqual(enforcer.lastBlockedApplicationName, "Postman")
    }

    // 3. Settings change during active focus blocks the newly added frontmost app.
    func testSettingsChangeDuringFocusBlocksNewlyAddedFrontmostApp() {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = postman
        let enforcer = makeEnforcer(workspace: workspace)
        var settings = makeSettings()
        enforcer.update(session: makeSession(), settings: settings)
        XCTAssertEqual(postman.hideCount, 0)

        settings.blockedApplications = [.init(bundleIdentifier: "com.postman.app", displayName: "Postman")]
        enforcer.update(session: makeSession(), settings: settings)

        XCTAssertEqual(postman.hideCount, 1)
    }

    // 4. Website pattern added during focus scans immediately.
    func testWebsitePatternAddedDuringFocusScansImmediately() async {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = chrome
        let client = FakeBrowserClient()
        let enforcer = makeEnforcer(workspace: workspace, client: client)
        var settings = makeSettings()
        enforcer.update(session: makeSession(), settings: settings)
        await Task.yield()
        XCTAssertTrue(client.calls.isEmpty, "No patterns should not trigger a scan")

        settings.blockedWebsitePatterns = ["youtube"]
        enforcer.update(session: makeSession(), settings: settings)
        await waitUntil(client.calls.count == 1)

        XCTAssertEqual(client.calls.first?.patterns, ["youtube"])
    }

    // 5. Pause disables enforcement.
    func testPauseDisablesEnforcement() async {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = postman
        let enforcer = makeEnforcer(workspace: workspace)
        let settings = makeSettings(blockedApplications: [.init(bundleIdentifier: "com.postman.app", displayName: "Postman")])

        enforcer.update(session: makeSession(), settings: settings)
        XCTAssertEqual(postman.hideCount, 1)

        enforcer.update(session: makeSession(status: .paused), settings: settings)
        XCTAssertFalse(enforcer.policyActive)

        workspace.simulateActivation(postman)
        await waitUntil(postman.hideCount > 1)

        XCTAssertEqual(postman.hideCount, 1)
        XCTAssertEqual(enforcer.status, .inactive)
    }

    // 6. Resume reenables enforcement and rechecks the frontmost app.
    func testResumeRechecksFrontmostApp() async {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = postman
        let enforcer = makeEnforcer(workspace: workspace)
        let settings = makeSettings(blockedApplications: [.init(bundleIdentifier: "com.postman.app", displayName: "Postman")])

        enforcer.update(session: makeSession(status: .paused), settings: settings)
        XCTAssertEqual(postman.hideCount, 0)

        enforcer.update(session: makeSession(), settings: settings)
        await waitUntil(postman.hideCount == 1)

        XCTAssertTrue(enforcer.policyActive)
        XCTAssertEqual(postman.hideCount, 1)
    }

    // 7. Short and long breaks disable enforcement.
    func testBreaksDisableEnforcement() {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = postman
        let enforcer = makeEnforcer(workspace: workspace)
        let settings = makeSettings(blockedApplications: [.init(bundleIdentifier: "com.postman.app", displayName: "Postman")])

        for phase in [FocusPhase.shortBreak, .longBreak] {
            enforcer.update(session: makeSession(phase: phase), settings: settings)
            XCTAssertFalse(enforcer.policyActive, "\(phase) should disable policy")
            XCTAssertEqual(postman.hideCount, 0)
        }
    }

    // 8. Complete and abandon stop monitoring.
    func testCompleteAndAbandonStopMonitoring() {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = chrome
        let enforcer = makeEnforcer(workspace: workspace)
        let settings = makeSettings(websitePatterns: ["youtube"])

        enforcer.update(session: makeSession(), settings: settings)
        XCTAssertNotNil(enforcer.browserScanTask)

        enforcer.update(session: makeSession(status: .completed), settings: settings)
        XCTAssertFalse(enforcer.policyActive)
        XCTAssertNil(enforcer.browserScanTask)

        enforcer.update(session: makeSession(), settings: settings)
        XCTAssertNotNil(enforcer.browserScanTask)

        enforcer.update(session: makeSession(status: .abandoned), settings: settings)
        XCTAssertFalse(enforcer.policyActive)
        XCTAssertNil(enforcer.browserScanTask)
    }

    // 9. Failed application hide surfaces an enforcement failure.
    func testFailedHideExposesEnforcementFailure() {
        postman.hideResult = false
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = postman
        let enforcer = makeEnforcer(workspace: workspace)
        let settings = makeSettings(blockedApplications: [.init(bundleIdentifier: "com.postman.app", displayName: "Postman")])

        enforcer.update(session: makeSession(), settings: settings)

        XCTAssertEqual(enforcer.status, .enforcementFailed(message: "Could not hide Postman."))
        XCTAssertEqual(enforcer.warningMessage, "Could not hide Postman.")
    }

    // 10. AppleScript permission failure surfaces as permissionRequired.
    func testAppleScriptPermissionFailure() async {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = chrome
        let client = FakeBrowserClient()
        client.error = BrowserAutomationError.permissionDenied(browserName: "Google Chrome")
        let enforcer = makeEnforcer(workspace: workspace, client: client)
        let settings = makeSettings(websitePatterns: ["youtube"])

        enforcer.update(session: makeSession(), settings: settings)
        await waitUntil(enforcer.status == .permissionRequired(browserName: "Google Chrome"))

        XCTAssertEqual(enforcer.status, .permissionRequired(browserName: "Google Chrome"))
    }

    // 11. Repeated updates keep a single browser monitoring task.
    func testRepeatedUpdatesKeepSingleMonitoringTask() {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = chrome
        let enforcer = makeEnforcer(workspace: workspace)
        let settings = makeSettings(websitePatterns: ["youtube"])

        enforcer.update(session: makeSession(), settings: settings)
        let generation = enforcer.monitoringGeneration
        XCTAssertGreaterThan(generation, 0)

        for _ in 0..<5 {
            enforcer.update(session: makeSession(), settings: settings)
        }

        XCTAssertEqual(enforcer.monitoringGeneration, generation)
        XCTAssertNotNil(enforcer.browserScanTask)
    }

    // 12. Empty and whitespace patterns are ignored.
    func testEmptyAndWhitespacePatternsAreIgnored() async {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = chrome
        let client = FakeBrowserClient()
        let enforcer = makeEnforcer(workspace: workspace, client: client)
        let settings = makeSettings(websitePatterns: ["", "   ", "\n"])

        enforcer.update(session: makeSession(), settings: settings)
        await Task.yield()

        XCTAssertTrue(client.calls.isEmpty, "Empty and whitespace patterns should be ignored")
    }

    // 13. Duplicate patterns are enforced only once.
    func testDuplicatePatternsAreEnforcedOnce() async {
        let workspace = FakeWorkspace()
        workspace.frontmostApplication = chrome
        let client = FakeBrowserClient()
        let enforcer = makeEnforcer(workspace: workspace, client: client)
        let settings = makeSettings(websitePatterns: ["youtube", " youtube ", "youtube"])

        enforcer.update(session: makeSession(), settings: settings)
        await waitUntil(client.calls.count == 1)

        XCTAssertEqual(client.calls.count, 1)
        XCTAssertEqual(client.calls.first?.patterns, ["youtube"])
    }

    // Existing matcher and script-escape coverage kept for regression.
    func testMatcherSupportsSubstringAndExactPatterns() {
        XCTAssertTrue(FocusPolicyEnforcer.matches(url: "https://Example.com/news", patterns: ["example.com"]))
        XCTAssertTrue(FocusPolicyEnforcer.matches(url: "https://example.com", patterns: ["*HTTPS://EXAMPLE.COM"]))
        XCTAssertFalse(FocusPolicyEnforcer.matches(url: "https://example.com/news", patterns: ["*https://example.com"]))
        XCTAssertFalse(FocusPolicyEnforcer.matches(url: "https://example.com", patterns: ["*"]))
        XCTAssertFalse(FocusPolicyEnforcer.matches(url: "https://example.com", patterns: []))
    }

    func testPolicyOnlyRunsForEnabledActiveWorkSession() {
        var session = makeSession()
        XCTAssertTrue(FocusPolicyEnforcer.isPolicyActive(session: session, enabled: true))
        session.status = .paused
        XCTAssertFalse(FocusPolicyEnforcer.isPolicyActive(session: session, enabled: true))
        XCTAssertFalse(FocusPolicyEnforcer.isPolicyActive(session: makeSession(phase: .shortBreak), enabled: true))
        XCTAssertFalse(FocusPolicyEnforcer.isPolicyActive(session: makeSession(), enabled: false))
    }

    func testAppleScriptEscapesUserValues() {
        let source = AppleScriptBrowserAutomationClient.scriptSource(
            applicationName: "Google Chrome",
            blockedURL: "file:///tmp/blocked\"page.html",
            patterns: ["example.com\"\nreturn true"]
        )
        XCTAssertTrue(source.contains("file:///tmp/blocked\\\"page.html"))
        XCTAssertTrue(source.contains("example.com\\\" return true"))
        XCTAssertFalse(source.contains("example.com\"\nreturn true"))
    }
}
