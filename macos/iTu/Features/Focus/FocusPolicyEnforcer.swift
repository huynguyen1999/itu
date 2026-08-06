import AppKit
import Foundation
import Observation
import os

protocol WorkspaceProviding {
    var frontmostApplication: RunningApplicationProviding? { get }
    var runningApplications: [RunningApplicationProviding] { get }

    @discardableResult
    func observeActivations(_ handler: @escaping (RunningApplicationProviding) -> Void) -> AnyObject
}

protocol RunningApplicationProviding {
    var bundleIdentifier: String? { get }
    var localizedName: String? { get }
    var isTerminated: Bool { get }

    @discardableResult
    func hide() -> Bool

    func activate()
}

struct NSRunningApplicationAdapter: RunningApplicationProviding {
    let application: NSRunningApplication

    var bundleIdentifier: String? { application.bundleIdentifier }
    var localizedName: String? { application.localizedName }
    var isTerminated: Bool { application.isTerminated }

    @discardableResult
    func hide() -> Bool { application.hide() }

    func activate() { application.activate(options: .activateIgnoringOtherApps) }
}

struct NSWorkspaceAdapter: WorkspaceProviding {
    let workspace: NSWorkspace

    var frontmostApplication: RunningApplicationProviding? {
        workspace.frontmostApplication.map(NSRunningApplicationAdapter.init)
    }

    var runningApplications: [RunningApplicationProviding] {
        workspace.runningApplications.map(NSRunningApplicationAdapter.init)
    }

    func observeActivations(_ handler: @escaping (RunningApplicationProviding) -> Void) -> AnyObject {
        workspace.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { notification in
            guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else {
                return
            }
            handler(NSRunningApplicationAdapter(application: application))
        }
    }
}

enum FocusPolicyStatus: Equatable {
    case disabled
    case inactive
    case active
    case permissionRequired(browserName: String)
    case enforcementFailed(message: String)
}

/// Applies the optional Focus Policy while a Focus Session is actively in its
/// work phase. The enforcer hides blocked applications (never terminates them)
/// and replaces blocked website tabs in supported browsers. It is best-effort:
/// macOS privacy permissions and browser scripting failures surface as status.
@MainActor
@Observable
final class FocusPolicyEnforcer {
    private(set) var policyActive = false
    private(set) var warningMessage: String?
    private(set) var status: FocusPolicyStatus = .disabled
    private(set) var lastEnforcementAt: Date?
    private(set) var lastBlockedApplicationName: String?
    /// Single long-lived browser monitoring task; one per policy activation.
    private(set) var browserScanTask: Task<Void, Never>?
    /// Increments whenever a new monitoring task is created.
    private(set) var monitoringGeneration = 0

    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.itu.macos",
        category: "FocusPolicy"
    )

    private let workspace: WorkspaceProviding
    private let browserClient: BrowserAutomationClient
    private let blockedPageURL: URL
    private var activationObserver: AnyObject?
    private var scanInFlight = false
    private var scanScheduled = false
    private var probedBundleIdentifiers = Set<String>()
    private var session: FocusSession?
    private var settings = FocusSettings()
    private var blockedBundleIdentifiers = Set<String>()
    private var normalizedPatterns: [String] = []
    private var lastAllowedApplication: RunningApplicationProviding?

    init(
        workspace: WorkspaceProviding = NSWorkspaceAdapter(workspace: .shared),
        browserClient: BrowserAutomationClient = AppleScriptBrowserAutomationClient(),
        blockedPageURL: URL? = nil
    ) {
        self.workspace = workspace
        self.browserClient = browserClient
        self.blockedPageURL = blockedPageURL
            ?? Bundle.main.url(forResource: "FocusBlocked", withExtension: "html")
            ?? URL(string: "about:blank")!

        activationObserver = workspace.observeActivations { [weak self] application in
            Task { @MainActor [weak self] in
                self?.handleActivation(of: application)
            }
        }
    }

    /// Updates the session/settings projection and enforces immediately.
    /// Runs enforcement even when already active so live settings edits and
    /// pause/resume transitions take effect without restarting focus.
    func update(session: FocusSession?, settings: FocusSettings) {
        self.session = session
        self.settings = settings
        blockedBundleIdentifiers = Set(settings.blockedApplications.map(\.bundleIdentifier))
        normalizedPatterns = Self.normalizedPatterns(settings.blockedWebsitePatterns)

        let shouldBeActive = Self.isPolicyActive(session: session, enabled: settings.focusPolicyEnabled)
        let activeStateChanged = policyActive != shouldBeActive
        policyActive = shouldBeActive

        if activeStateChanged {
            logger.info("Focus policy \(shouldBeActive ? "activated" : "deactivated")")
            if shouldBeActive {
                status = .active
            }
            probedBundleIdentifiers.removeAll()
            configureMonitoring(active: shouldBeActive)
        }

        guard shouldBeActive else {
            warningMessage = nil
            lastBlockedApplicationName = nil
            status = settings.focusPolicyEnabled ? .inactive : .disabled
            return
        }

        enforceCurrentState()
    }

    func stop() {
        update(session: nil, settings: settings)
    }

    static func isPolicyActive(session: FocusSession?, enabled: Bool) -> Bool {
        enabled && session?.status == .active && session?.phase == .work
    }

    static func matches(url: String, patterns: [String]) -> Bool {
        FocusWebsiteMatcher.matches(url: url, patterns: patterns)
    }

    /// Trims, drops empties, and de-duplicates website patterns.
    static func normalizedPatterns(_ patterns: [String]) -> [String] {
        var seen = Set<String>()
        return patterns
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    private func enforceCurrentState() {
        lastEnforcementAt = Date()
        if let frontmost = workspace.frontmostApplication {
            handleActivation(of: frontmost)
        }
        triggerBrowserScan()
    }

    private func configureMonitoring(active: Bool) {
        browserScanTask?.cancel()
        browserScanTask = nil
        guard active else { return }

        monitoringGeneration += 1
        browserScanTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled, let self, self.policyActive else { return }
                self.enforceCurrentState()
            }
        }
    }

    private func handleActivation(of application: RunningApplicationProviding) {
        guard policyActive else { return }

        let bundleIdentifier = application.bundleIdentifier

        if let bundleIdentifier,
           bundleIdentifier != Bundle.main.bundleIdentifier,
           blockedBundleIdentifiers.contains(bundleIdentifier) {
            logger.info("Blocked application frontmost: \(bundleIdentifier)")
            hideBlocked(application)
            return
        }

        if let bundleIdentifier,
           bundleIdentifier != Bundle.main.bundleIdentifier,
           !application.isTerminated {
            lastAllowedApplication = application
        }

        if isEnabledBrowser(bundleIdentifier) {
            triggerBrowserScan()
        }
    }

    /// Hides a blocked app and reactivates the last allowed one, or iTu itself
    /// when no allowed app is known. Blocked apps are never terminated.
    private func hideBlocked(_ application: RunningApplicationProviding) {
        let didHide = application.hide()
        logger.info("Hide blocked app \(application.bundleIdentifier ?? "?") -> \(didHide ? "hidden" : "failed")")

        if didHide {
            lastBlockedApplicationName = application.localizedName
            warningMessage = nil
            status = .active
        } else {
            lastBlockedApplicationName = nil
            let message = "Could not hide \(application.localizedName ?? "the blocked application")."
            logger.error("\(message)")
            warningMessage = message
            status = .enforcementFailed(message: message)
        }

        if let previous = lastAllowedApplication,
           !previous.isTerminated,
           previous.bundleIdentifier.map({ !blockedBundleIdentifiers.contains($0) }) == true {
            previous.activate()
        } else {
            NSRunningApplication.current.activate(options: .activateIgnoringOtherApps)
        }
    }

    private func triggerBrowserScan() {
        guard policyActive, !normalizedPatterns.isEmpty, !scanScheduled else { return }
        scanScheduled = true
        Task { @MainActor [weak self] in
            defer { self?.scanScheduled = false }
            guard let self, self.policyActive else { return }
            await self.scanBrowsersIfNeeded()
        }
    }

    private func scanBrowsersIfNeeded() async {
        guard policyActive, !scanInFlight, !normalizedPatterns.isEmpty else { return }
        scanInFlight = true
        defer { scanInFlight = false }

        var applications = workspace.runningApplications
        if let frontmost = workspace.frontmostApplication,
           !applications.contains(where: { $0.bundleIdentifier == frontmost.bundleIdentifier }) {
            applications.append(frontmost)
        }

        let runningBrowsers = applications.compactMap { application -> (RunningApplicationProviding, SupportedBrowser)? in
            guard let bundleIdentifier = application.bundleIdentifier,
                  let browser = enabledBrowser(for: bundleIdentifier) else { return nil }
            return (application, browser)
        }

        guard !runningBrowsers.isEmpty else { return }

        for (_, browser) in runningBrowsers {
            logger.info("Scanning \(browser.displayName) with \(self.normalizedPatterns.count) pattern(s)")
            do {
                try await browserClient.blockMatchingTabs(
                    browser: browser,
                    patterns: normalizedPatterns,
                    blockedPageURL: blockedPageURL
                )
                status = .active
                warningMessage = nil
            } catch let error as BrowserAutomationError {
                switch error {
                case .permissionDenied(let browserName):
                    logger.error("Browser automation permission denied for \(browserName)")
                    status = .permissionRequired(browserName: browserName)
                    warningMessage = "Browser website blocking permission is unavailable."
                case .executionFailed(let browserName, _, _):
                    logger.error("Browser automation execution failed for \(browserName)")
                    let message = "Could not control \(browserName)."
                    status = .enforcementFailed(message: message)
                    warningMessage = message
                case .invalidScript:
                    let message = "Browser website blocking is unavailable."
                    status = .enforcementFailed(message: message)
                    warningMessage = message
                }
            } catch {
                let message = "Browser website blocking is unavailable."
                status = .enforcementFailed(message: message)
                warningMessage = message
            }
        }
    }

    private func isEnabledBrowser(_ bundleIdentifier: String?) -> Bool {
        guard let bundleIdentifier else { return false }
        return settings.enabledBrowsers.contains { $0.bundleIdentifier == bundleIdentifier }
    }

    private func enabledBrowser(for bundleIdentifier: String?) -> SupportedBrowser? {
        guard let bundleIdentifier else { return nil }
        return settings.enabledBrowsers.first { $0.bundleIdentifier == bundleIdentifier }
    }
}

enum FocusWebsiteMatcher {
    static func matches(url: String, patterns: [String]) -> Bool {
        let normalizedURL = url.lowercased()
        return patterns.contains { rawPattern in
            guard !rawPattern.isEmpty else { return false }
            if rawPattern.first == "*" {
                guard rawPattern.count > 1 else { return false }
                return normalizedURL == String(rawPattern.dropFirst()).lowercased()
            }
            return normalizedURL.contains(rawPattern.lowercased())
        }
    }
}
