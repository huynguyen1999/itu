import Foundation
import iTuDomain

/// Normalizes and stitches raw start/stop Biome focus events into discrete usage intervals.
public enum BiomeUsageNormalizer {
    /// Maximum duration tolerance for an unclosed focus session (12 hours).
    public static let maxSessionDuration: TimeInterval = 43_200

    public static let systemExcludedBundleIDs: Set<String> = [
        "loginwindow",
        "com.apple.loginwindow",
        "com.apple.loginwindow.xpc",
        "com.apple.LockScreen",
        "com.apple.lockscreen",
        "lockscreen",
        "control-center",
        "com.apple.controlcenter",
        "com.apple.ControlCenter",
        "dock",
        "com.apple.dock",
        "com.apple.WindowManager",
        "com.apple.notificationcenterui",
        "com.apple.usernotifications.service",
        "com.apple.Spotlight",
        "com.apple.ScreenSaver.Engine",
        "com.apple.screensaver",
        "com.apple.systemuiserver",
        "com.apple.SystemUIServer",
        "com.apple.screencapture",
        "com.apple.screencaptureui",
        "com.apple.AirPlayUIAgent",
        "com.apple.quicklook.ui.helper",
        "com.apple.CoreAuthUI",
        "com.apple.SecurityAgent",
        "com.apple.universalaccessd",
        "com.apple.PowerChime",
        "com.apple.UserNotificationCenter",
        "com.apple.TextInputMenuAgent",
        "com.apple.TextInputSwitcher",
        "com.apple.talagent",
        "com.apple.coreservices.uiagent",
        "com.apple.systempreferences.quicklook",
        "com.apple.SoftwareUpdateNotificationManager",
        "com.apple.ClockAngel",
        "com.apple.PosterBoard",
        "com.apple.PassbookUIService",
        "com.apple.AuthKitUIService",
        "com.apple.AuthenticationServicesUI",
        "com.apple.CTNotifyUIService",
        "com.apple.LocalAuthentication.UIAgent",
        "com.apple.LocalAuthenticationUIService",
        "com.apple.ScreenshotServicesService",
        "com.apple.ProblemReporter",
        "com.apple.control-center",
        "com.apple.springboard.home-screen-open-folder",
        "com.apple.springboard.today-view",
        "com.apple.springboard.widget-editing"
    ]

    public static func isSystemExcluded(bundleId: String) -> Bool {
        let trimmed = bundleId.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        let lower = trimmed.lowercased()
        if systemExcludedBundleIDs.contains(trimmed) || systemExcludedBundleIDs.contains(lower) {
            return true
        }
        if lower.contains("loginwindow") ||
           lower.contains("lockscreen") ||
           lower.contains("screensaver") ||
           lower.contains("controlcenter") ||
           lower.contains("control-center") ||
           lower.contains("clockangel") ||
           lower.contains("posterboard") ||
           lower.contains("passbookuiservice") ||
           lower.contains("authkituiservice") ||
           lower.contains("authenticationservicesui") ||
           lower.contains("ctnotifyuiservice") ||
           lower.contains("localauthentication") ||
           lower.contains("screenshotservices") ||
           lower.contains("problemreporter") ||
           lower.contains("springboard") ||
           lower.hasPrefix("com.apple.controlcenter") ||
           lower.hasPrefix("com.apple.control-center") ||
           lower.hasPrefix("com.apple.windowmanager") ||
           lower.hasPrefix("com.apple.systemuiserver") ||
           lower.hasPrefix("com.apple.dock") ||
           lower.hasPrefix("com.apple.notificationcenter") ||
           lower.hasPrefix("com.apple.usernotificationcenter") ||
           lower.hasPrefix("com.apple.springboard") ||
           lower == "loginwindow" ||
           lower == "lockscreen" ||
           lower == "control-center" ||
           lower == "dock" {
            return true
        }
        return false
    }

    public static func isSystemBoundary(bundleId: String, type: Int = 1) -> Bool {
        if type == 3 { return true }
        let trimmed = bundleId.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        if isSystemExcluded(bundleId: trimmed) { return true }
        return false
    }

    public static func normalize(
        events: [BiomeAppInFocusEvent],
        for device: ScreenTimeDevice
    ) -> [ImportedUsageInterval] {
        let sortedEvents = events.sorted { $0.timestamp < $1.timestamp }
        var intervals: [ImportedUsageInterval] = []

        struct ActiveSession {
            let bundleId: String
            let startedAt: Date
            let type: Int
        }

        var active: ActiveSession?

        for event in sortedEvents {
            let isBoundary = isSystemBoundary(bundleId: event.bundleId, type: event.type)

            if event.starting {
                if let current = active {
                    // Auto-close preceding app session if another event starts
                    if current.bundleId != event.bundleId || event.timestamp.timeIntervalSince(current.startedAt) > 5 {
                        let rawEnd = event.timestamp
                        let clampedEnd = min(rawEnd, current.startedAt.addingTimeInterval(maxSessionDuration))
                        let duration = Int(clampedEnd.timeIntervalSince(current.startedAt))

                        if duration >= 1 && !isSystemBoundary(bundleId: current.bundleId, type: current.type) {
                            let interval = createInterval(
                                device: device,
                                bundleId: current.bundleId,
                                startedAt: current.startedAt,
                                endedAt: clampedEnd,
                                duration: duration
                            )
                            intervals.append(interval)
                        }
                    }
                }

                if isBoundary {
                    // Device locked, returned to home screen, screensaver or system UI opened
                    active = nil
                } else {
                    // Regular user application in focus
                    active = ActiveSession(bundleId: event.bundleId, startedAt: event.timestamp, type: event.type)
                }
            } else {
                // Ending event
                if let current = active, current.bundleId == event.bundleId {
                    let rawEnd = event.timestamp
                    let clampedEnd = min(rawEnd, current.startedAt.addingTimeInterval(maxSessionDuration))
                    let duration = Int(clampedEnd.timeIntervalSince(current.startedAt))

                    if duration >= 1 && !isSystemBoundary(bundleId: current.bundleId, type: current.type) {
                        let interval = createInterval(
                            device: device,
                            bundleId: current.bundleId,
                            startedAt: current.startedAt,
                            endedAt: clampedEnd,
                            duration: duration
                        )
                        intervals.append(interval)
                    }
                    active = nil
                }
            }
        }

        return intervals
    }

    private static func createInterval(
        device: ScreenTimeDevice,
        bundleId: String,
        startedAt: Date,
        endedAt: Date,
        duration: Int
    ) -> ImportedUsageInterval {
        let eventId = ImportedUsageInterval.deterministicEventID(
            sourceDeviceId: device.deviceIdentifier,
            bundleId: bundleId,
            startedAt: startedAt,
            endedAt: endedAt
        )
        let displayName = resolveDisplayName(for: bundleId)

        return ImportedUsageInterval(
            eventId: eventId,
            source: .screenTimeBiome,
            sourceDeviceId: device.deviceIdentifier,
            sourceDeviceName: device.name,
            bundleId: bundleId,
            displayName: displayName,
            startedAt: startedAt,
            endedAt: endedAt,
            durationSeconds: duration,
            observedAt: Date()
        )
    }

    /// Maps standard iOS bundle identifiers to clean, friendly display names.
    public static func resolveDisplayName(for bundleId: String) -> String {
        switch bundleId {
        case "ph.telegra.Telegraph": return "Telegram"
        case "com.apple.mobilesafari": return "Safari"
        case "com.apple.mobilemail": return "Mail"
        case "com.apple.MobileSMS": return "Messages"
        case "com.apple.mobilephone": return "Phone"
        case "com.apple.facetime": return "FaceTime"
        case "com.apple.camera": return "Camera"
        case "com.apple.mobilenotes": return "Notes"
        case "com.apple.reminders": return "Reminders"
        case "com.apple.mobilecal": return "Calendar"
        case "com.apple.Music": return "Apple Music"
        case "com.apple.Podcasts": return "Podcasts"
        case "com.apple.Photos": return "Photos"
        case "com.apple.Preferences": return "Settings"
        case "com.apple.AppStore": return "App Store"
        case "com.apple.Maps": return "Apple Maps"
        case "com.apple.Health": return "Health"
        case "com.apple.Fitness": return "Fitness"
        case "com.apple.Freeform": return "Freeform"
        case "com.apple.Keynote": return "Keynote"
        case "com.apple.Pages": return "Pages"
        case "com.apple.Numbers": return "Numbers"
        case "com.apple.weather": return "Weather"
        case "com.apple.calculator": return "Calculator"
        case "com.apple.voice-memos": return "Voice Memos"
        case "com.apple.shortcuts": return "Shortcuts"
        case "com.apple.findmy": return "Find My"
        case "com.apple.Files": return "Files"
        case "com.apple.clock": return "Clock"
        case "com.apple.news": return "Apple News"
        case "com.apple.tv": return "Apple TV"
        case "com.apple.Home": return "Home"
        case "com.apple.MobileAddressBook": return "Contacts"
        case "com.microsoft.edgemac", "com.microsoft.Edge": return "Microsoft Edge"
        case "com.google.Chrome", "com.google.chrome.ios": return "Google Chrome"
        case "com.apple.Safari", "com.apple.mobilesafari": return "Safari"
        case "com.microsoft.VSCode": return "VS Code"
        case "com.mitchellh.ghostty": return "Ghostty"
        case "com.github.wez.wezterm": return "WezTerm"
        case "com.sublimetext.4": return "Sublime Text"
        case "com.anthropic.claudedesktop", "com.anthropic.claude": return "Claude"
        case "com.openai.chat": return "ChatGPT"
        case "com.spotify.client": return "Spotify"
        case "com.burbn.instagram": return "Instagram"
        case "com.zhiliaoapp.musically": return "TikTok"
        case "com.facebook.Facebook": return "Facebook"
        case "com.facebook.Messenger": return "Messenger"
        case "com.atebits.Tweetie2": return "X (Twitter)"
        case "org.whispersystems.signal": return "Signal"
        case "net.whatsapp.WhatsApp": return "WhatsApp"
        case "com.youtube.ios": return "YouTube"
        case "com.netflix.Netflix": return "Netflix"
        case "com.amazon.Amazon": return "Amazon"
        case "com.reddit.Reddit": return "Reddit"
        default:
            // Fallback: Use last component or clean up reverse DNS
            let components = bundleId.split(separator: ".")
            if let last = components.last, !last.isEmpty {
                return String(last)
            }
            return bundleId
        }
    }
}
