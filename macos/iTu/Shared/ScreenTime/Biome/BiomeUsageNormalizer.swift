import Foundation
import iTuDomain

/// Normalizes and stitches raw start/stop Biome focus events into discrete usage intervals.
public enum BiomeUsageNormalizer {
    /// Maximum duration tolerance for an unclosed focus session (4 hours).
    public static let maxSessionDuration: TimeInterval = 14400

    /// Maximum duration for transient sessions launched from lockscreen (e.g. camera, widgets) (2 minutes).
    public static let maxLockscreenSessionDuration: TimeInterval = 120

    /// Maximum duration when a session is closed by a sleep/screen lock boundary after an unclosed gap (3 minutes).
    public static let maxSleepBoundarySessionDuration: TimeInterval = 180

    public static let transientOverlayBundleIDs: Set<String> = [
        "cc.ffitch.shottr",
        "com.google.antigravity",
        "com.apple.ScreenshotServicesService",
        "com.apple.screencaptureui"
    ]

    public static let systemExcludedBundleIDs: Set<String> = [
        "loginwindow",
        "com.apple.loginwindow",
        "com.apple.loginwindow.xpc",
        "com.apple.LockScreen",
        "com.apple.lockscreen",
        "com.apple.SleepLockScreen",
        "com.apple.sleeplockscreen",
        "com.apple.CoverSheet",
        "com.apple.coversheet",
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
        "com.apple.clockangel",
        "com.apple.InCallService",
        "com.apple.incallservice",
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
        "com.apple.springboard.widget-editing",
        "com.apple.springboard.spotlight",
        "cc.ffitch.shottr"
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
           lower.contains("screen_saver") ||
           lower.contains("coversheet") ||
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

    public static func isSleepOrLockBoundary(bundleId: String) -> Bool {
        let lower = bundleId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return lower.contains("sleeplockscreen") ||
               lower.contains("screensaver") ||
               lower.contains("screen_saver") ||
               lower.contains("lockscreen") ||
               lower.contains("loginwindow") ||
               lower.contains("coversheet")
    }

    public static func isLockscreenTransition(reason: String?) -> Bool {
        guard let reason else { return false }
        return reason.contains("_SBDashBoardHostedAppEntityViewController") ||
               reason.lowercased().contains("lockscreen") ||
               reason.lowercased().contains("coversheet")
    }

    /// Deduplicates and orders raw Biome focus events deterministically.
    public static func canonicalizeAndDeduplicate(
        events: [BiomeAppInFocusEvent],
        deviceId: String
    ) -> (events: [BiomeAppInFocusEvent], droppedCount: Int) {
        guard !events.isEmpty else { return ([], 0) }

        // Sort: timestamp ascending. For identical timestamps:
        // 1. Ending events (starting == false) before starting events (starting == true)
        // 2. System boundary events before normal app start events
        let sorted = events.sorted { a, b in
            if a.timestamp != b.timestamp {
                return a.timestamp < b.timestamp
            }
            if a.starting != b.starting {
                return !a.starting && b.starting
            }
            let aBoundary = isSystemBoundary(bundleId: a.bundleId, type: a.type)
            let bBoundary = isSystemBoundary(bundleId: b.bundleId, type: b.type)
            if aBoundary != bBoundary {
                return aBoundary && !bBoundary
            }
            return a.bundleId < b.bundleId
        }

        var deduplicated: [BiomeAppInFocusEvent] = []
        deduplicated.reserveCapacity(sorted.count)
        var seenFingerprints = Set<String>()
        var droppedCount = 0

        for event in sorted {
            let epochMs = Int64(event.timestamp.timeIntervalSince1970 * 1000)
            let fingerprint = "\(deviceId)|\(event.bundleId)|\(epochMs)|\(event.starting)|\(event.type)|\(event.transitionReason ?? "")"
            if seenFingerprints.contains(fingerprint) {
                droppedCount += 1
                continue
            }
            seenFingerprints.insert(fingerprint)
            deduplicated.append(event)
        }

        return (deduplicated, droppedCount)
    }

    /// Normalizes and stitches raw start/stop Biome focus events into discrete usage intervals,
    /// carrying open foreground state across scans rather than fabricating arbitrary closing times.
    public static func normalize(
        events: [BiomeAppInFocusEvent],
        for device: ScreenTimeDevice,
        initialState: BiomeForegroundState? = nil
    ) -> (intervals: [ImportedUsageInterval], nextState: BiomeForegroundState?, stats: NormalizationStats) {
        let (canonicalEvents, dedupeDropped) = canonicalizeAndDeduplicate(
            events: events,
            deviceId: device.deviceIdentifier
        )

        var stats = NormalizationStats(
            rawEventCount: events.count,
            duplicatesDroppedCount: dedupeDropped
        )

        var intervals: [ImportedUsageInterval] = []

        var currentBundle: String? = initialState?.bundleId
        var startTs: Date? = initialState?.startedAt
        var currentFingerprint: String? = initialState?.sourceEventFingerprint
        var isLockscreenLaunched = false

        for event in canonicalEvents {
            let bundle = event.bundleId.trimmingCharacters(in: .whitespacesAndNewlines)
            if bundle.isEmpty { continue }

            let ts = event.timestamp
            let inForeground = event.starting

            // Ignore duplicate "gain focus" on same bundle
            if inForeground && currentBundle == bundle {
                stats.duplicatesDroppedCount += 1
                continue
            }

            // Start new interval if none currently active
            if inForeground && currentBundle == nil {
                currentBundle = bundle
                startTs = ts
                isLockscreenLaunched = isLockscreenTransition(reason: event.transitionReason)
                let epochMs = Int64(ts.timeIntervalSince1970 * 1000)
                currentFingerprint = "\(device.deviceIdentifier)|\(bundle)|\(epochMs)"
                continue
            }

            let sameBundleLoss = (bundle == currentBundle && !inForeground)
            let switchGain = (bundle != currentBundle && inForeground)
            let isSleepBoundaryLoss = (!inForeground && bundle != currentBundle && isSleepOrLockBoundary(bundleId: bundle))

            if (sameBundleLoss || switchGain || isSleepBoundaryLoss), let cur = currentBundle, let st = startTs, ts > st {
                let rawDuration = Int(ts.timeIntervalSince(st))
                if rawDuration >= 1 && !isSystemExcluded(bundleId: cur) {
                    let isSleepBoundary = isSleepOrLockBoundary(bundleId: bundle)
                    let maxCap: TimeInterval = isLockscreenLaunched
                        ? maxLockscreenSessionDuration
                        : (isSleepBoundary && TimeInterval(rawDuration) > maxSleepBoundarySessionDuration
                            ? maxSleepBoundarySessionDuration
                            : maxSessionDuration)
                    let duration = min(rawDuration, Int(maxCap))
                    let effectiveEnd = min(ts, st.addingTimeInterval(maxCap))

                    intervals.append(createInterval(
                        device: device,
                        bundleId: cur,
                        startedAt: st,
                        endedAt: effectiveEnd,
                        duration: duration
                    ))
                }
            }

            if !sameBundleLoss && !switchGain && !isSleepBoundaryLoss && !inForeground {
                stats.strayEventsCount += 1
            }

            // Update state
            if sameBundleLoss || isSleepBoundaryLoss {
                currentBundle = nil
                startTs = nil
                currentFingerprint = nil
                isLockscreenLaunched = false
            } else if switchGain {
                currentBundle = bundle
                startTs = ts
                isLockscreenLaunched = isLockscreenTransition(reason: event.transitionReason)
                let epochMs = Int64(ts.timeIntervalSince1970 * 1000)
                currentFingerprint = "\(device.deviceIdentifier)|\(bundle)|\(epochMs)"
            }
        }

        let nextState: BiomeForegroundState? = {
            guard let cur = currentBundle, let st = startTs, let fp = currentFingerprint else {
                return nil
            }
            return BiomeForegroundState(
                bundleId: cur,
                startedAt: st,
                sourceEventFingerprint: fp
            )
        }()

        stats.intervalsProducedCount = intervals.count
        return (intervals, nextState, stats)
    }

    /// Convenience overload for stateless normalization.
    public static func normalize(
        events: [BiomeAppInFocusEvent],
        for device: ScreenTimeDevice
    ) -> [ImportedUsageInterval] {
        normalize(events: events, for: device, initialState: nil).intervals
    }

    private static func createInterval(
        device: ScreenTimeDevice,
        bundleId: String,
        startedAt: Date,
        endedAt: Date,
        duration: Int
    ) -> ImportedUsageInterval {
        let clampedDuration = max(1, duration)
        let effectiveEnd = endedAt >= startedAt ? endedAt : startedAt.addingTimeInterval(TimeInterval(clampedDuration))
        let eventId = ImportedUsageInterval.deterministicEventID(
            sourceDeviceId: device.deviceIdentifier,
            bundleId: bundleId,
            startedAt: startedAt,
            endedAt: effectiveEnd,
            version: 2
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
            endedAt: effectiveEnd,
            durationSeconds: clampedDuration,
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
        case "com.apple.Safari": return "Safari"
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
