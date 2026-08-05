import AppKit
import Foundation
import Observation

/// Applies the optional Focus Policy while a Focus Session is actively in its
/// work phase. The enforcer is intentionally best-effort: macOS privacy
/// permissions and browser scripting failures leave the user's apps running.
@MainActor
@Observable
final class FocusPolicyEnforcer {
    private(set) var policyActive = false
    private(set) var warningMessage: String?

    private let workspace: NSWorkspace
    private let blockedPageURL: URL
    private var activationObserver: NSObjectProtocol?
    private var browserScanTask: Task<Void, Never>?
    private var scanInFlight = false
    private var session: FocusSession?
    private var settings = FocusSettings()
    private var lastAllowedApplication: NSRunningApplication?

    init(workspace: NSWorkspace = .shared, blockedPageURL: URL? = nil) {
        self.workspace = workspace
        self.blockedPageURL = blockedPageURL
            ?? Bundle.main.url(forResource: "FocusBlocked", withExtension: "html")
            ?? URL(string: "about:blank")!

        activationObserver = workspace.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else {
                return
            }
            Task { @MainActor [weak self] in
                self?.handleActivation(of: application)
            }
        }
    }

    /// Updates the session/settings projection used by the runtime enforcer.
    func update(session: FocusSession?, settings: FocusSettings) {
        self.session = session
        self.settings = settings
        let active = Self.isPolicyActive(session: session, enabled: settings.focusPolicyEnabled)

        if active, let frontmost = workspace.frontmostApplication {
            handleActivation(of: frontmost)
        }
        guard active != policyActive else { return }

        policyActive = active
        browserScanTask?.cancel()
        browserScanTask = nil
        guard active else {
            warningMessage = nil
            return
        }

        // Enforce the application policy for an app that was already frontmost
        // before Focus Policy became active; activation notifications only cover
        // later switches.
        browserScanTask = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.scanBrowsersIfNeeded()
            while !Task.isCancelled && self.policyActive {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled && self.policyActive else { return }
                await self.scanBrowsersIfNeeded()
            }
        }
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

    /// Produces a complete script without interpolating unescaped user input.
    static func scriptSource(applicationName: String, blockedURL: String, patterns: [String]) -> String {
        let escapedApplication = appleScriptString(applicationName)
        let escapedBlockedURL = appleScriptString(blockedURL)
        let serializedPatterns = patterns
            .filter { !$0.isEmpty }
            .map { "\"\(appleScriptString($0))\"" }
            .joined(separator: ", ")

        return """
        tell application "\(escapedApplication)"
            repeat with focusWindow in windows
                repeat with focusTab in tabs of focusWindow
                    try
                        set focusURL to URL of focusTab as text
                        if my iTuMatches(focusURL, {\(serializedPatterns)}) then
                            set URL of focusTab to "\(escapedBlockedURL)"
                        end if
                    end try
                end repeat
            end repeat
        end tell

        on iTuMatches(value, patterns)
            ignoring case
                repeat with candidate in patterns
                    set pattern to candidate as text
                    if pattern begins with "*" then
                        if (length of pattern) > 1 then
                            if value is equal to (text 2 thru -1 of pattern) then return true
                            end if
                        end if
                    else if value contains pattern then
                        return true
                    end if
                end repeat
            end ignoring
            return false
        end iTuMatches
        """
    }

    static func appleScriptString(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\r", with: " ")
            .replacingOccurrences(of: "\n", with: " ")
    }

    private func handleActivation(of application: NSRunningApplication) {
        guard policyActive,
              let bundleIdentifier = application.bundleIdentifier,
              bundleIdentifier != Bundle.main.bundleIdentifier else {
            if !application.isTerminated, application.bundleIdentifier != Bundle.main.bundleIdentifier {
                lastAllowedApplication = application
            }
            return
        }

        let blockedBundleIDs = Set(settings.blockedApplications.map(\.bundleIdentifier))
        guard blockedBundleIDs.contains(bundleIdentifier) else {
            if !application.isTerminated {
                lastAllowedApplication = application
            }
            return
        }

        // Hiding is reversible and avoids killing work in progress.
        application.hide()
        if let previous = lastAllowedApplication,
           !previous.isTerminated,
           previous.bundleIdentifier.map({ !blockedBundleIDs.contains($0) }) == true {
            previous.activate()
        } else {
            NSRunningApplication.current.activate()
        }
    }

    private func scanBrowsersIfNeeded() async {
        guard policyActive, !scanInFlight else { return }
        scanInFlight = true
        defer { scanInFlight = false }

        guard !settings.blockedWebsitePatterns.isEmpty else {
            warningMessage = nil
            return
        }

        guard let frontmost = workspace.frontmostApplication,
              let bundleIdentifier = frontmost.bundleIdentifier,
              settings.enabledBrowsers.contains(where: { $0.bundleIdentifier == bundleIdentifier }),
              let applicationName = Self.appleScriptApplicationName(for: bundleIdentifier) else {
            return
        }

        let source = Self.scriptSource(
            applicationName: applicationName,
            blockedURL: blockedPageURL.absoluteString,
            patterns: settings.blockedWebsitePatterns
        )
        guard let script = NSAppleScript(source: source) else {
            warningMessage = "Browser website blocking is unavailable."
            return
        }
        var error: NSDictionary?
        _ = script.executeAndReturnError(&error)
        warningMessage = error == nil ? nil : "Browser website blocking permission is unavailable."
    }

    private static func appleScriptApplicationName(for bundleIdentifier: String) -> String? {
        switch bundleIdentifier {
        case "com.apple.Safari": "Safari"
        case "com.google.Chrome": "Google Chrome"
        case "com.microsoft.edgemac": "Microsoft Edge"
        case "com.brave.Browser": "Brave Browser"
        case "com.vivaldi.Vivaldi": "Vivaldi"
        case "com.operasoftware.Opera": "Opera"
        case "com.pushplaylabs.sidekick": "Sidekick"
        case "company.thebrowser.Browser": "Arc"
        default: nil
        }
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
