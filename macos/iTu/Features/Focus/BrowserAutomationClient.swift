import AppKit
import Foundation

enum BrowserAutomationError: Error, Equatable {
    case invalidScript
    case permissionDenied(browserName: String)
    case executionFailed(browserName: String, errorNumber: Int?, message: String?)
}

@MainActor
protocol BrowserAutomationClient {
    func blockMatchingTabs(
        browser: SupportedBrowser,
        patterns: [String],
        blockedPageURL: URL
    ) async throws
}

/// AppleScript-based browser automation. Kept separate from policy lifecycle so
/// the enforcer can be exercised with fakes in tests.
@MainActor
final class AppleScriptBrowserAutomationClient: BrowserAutomationClient {
    func blockMatchingTabs(
        browser: SupportedBrowser,
        patterns: [String],
        blockedPageURL: URL
    ) async throws {
        let source = Self.scriptSource(
            applicationName: browser.appleScriptApplicationName,
            blockedURL: blockedPageURL.absoluteString,
            patterns: patterns
        )
        guard let script = NSAppleScript(source: source) else {
            throw BrowserAutomationError.invalidScript
        }
        var error: NSDictionary?
        script.executeAndReturnError(&error)
        if let error {
            throw Self.error(from: error, browserName: browser.displayName)
        }
    }

    static func error(from error: NSDictionary, browserName: String) -> BrowserAutomationError {
        let errorNumber = error["ErrorNumber"] as? Int
        let message = error["Error Message"] as? String
        if errorNumber == -1743 {
            return .permissionDenied(browserName: browserName)
        }
        return .executionFailed(browserName: browserName, errorNumber: errorNumber, message: message)
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
            try
                if (count of windows) > 0 then
                    set focusTab to active tab of front window
                    set focusURL to URL of focusTab as text
                    if my iTuMatches(focusURL, {\(serializedPatterns)}) then
                        set URL of focusTab to "\(escapedBlockedURL)"
                    end if
                end if
            end try
        end tell

        on iTuMatches(value, patterns)
            ignoring case
                repeat with candidate in patterns
                    set pattern to candidate as text
                    if pattern begins with "*" then
                        if (length of pattern) > 1 then
                            if value is equal to (text 2 thru -1 of pattern) then
                                return true
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
}

extension SupportedBrowser {
    /// Application name used by AppleScript `tell application`.
    var appleScriptApplicationName: String {
        switch self {
        case .safari: "Safari"
        case .chrome: "Google Chrome"
        case .edge: "Microsoft Edge"
        case .brave: "Brave Browser"
        case .vivaldi: "Vivaldi"
        case .opera: "Opera"
        case .sidekick: "Sidekick"
        case .arc: "Arc"
        }
    }
}
