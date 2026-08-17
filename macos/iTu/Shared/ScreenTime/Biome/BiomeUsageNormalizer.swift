import Foundation
import iTuDomain

/// Normalizes and stitches raw start/stop Biome focus events into discrete usage intervals.
public enum BiomeUsageNormalizer {
    /// Maximum duration tolerance for an unclosed focus session (6 hours).
    public static let maxSessionDuration: TimeInterval = 21_600

    public static func normalize(
        events: [BiomeAppInFocusEvent],
        for device: ScreenTimeDevice
    ) -> [ImportedUsageInterval] {
        let sortedEvents = events.sorted { $0.timestamp < $1.timestamp }
        var intervals: [ImportedUsageInterval] = []

        struct ActiveSession {
            let bundleId: String
            let startedAt: Date
        }

        var active: ActiveSession?

        for event in sortedEvents {
            if event.starting {
                if let current = active {
                    // Auto-close preceding app session if another starts
                    if current.bundleId != event.bundleId || event.timestamp.timeIntervalSince(current.startedAt) > 5 {
                        let rawEnd = event.timestamp
                        let clampedEnd = min(rawEnd, current.startedAt.addingTimeInterval(maxSessionDuration))
                        let duration = Int(clampedEnd.timeIntervalSince(current.startedAt))

                        if duration >= 1 {
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

                // Start new active session
                active = ActiveSession(bundleId: event.bundleId, startedAt: event.timestamp)
            } else {
                // Ending event
                if let current = active, current.bundleId == event.bundleId {
                    let rawEnd = event.timestamp
                    let clampedEnd = min(rawEnd, current.startedAt.addingTimeInterval(maxSessionDuration))
                    let duration = Int(clampedEnd.timeIntervalSince(current.startedAt))

                    if duration >= 1 {
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
        case "com.google.chrome.ios": return "Google Chrome"
        case "com.google.Gmail": return "Gmail"
        case "com.google.Maps": return "Google Maps"
        case "com.google.Drive": return "Google Drive"
        case "com.google.calendar": return "Google Calendar"
        case "com.spotify.client": return "Spotify"
        case "com.burbn.instagram": return "Instagram"
        case "com.zhiliaoapp.musically": return "TikTok"
        case "com.facebook.Facebook": return "Facebook"
        case "com.facebook.Messenger": return "Messenger"
        case "com.atebits.Tweetie2": return "X (Twitter)"
        case "org.whispersystems.signal": return "Signal"
        case "net.whatsapp.WhatsApp": return "WhatsApp"
        case "com.openai.chat": return "ChatGPT"
        case "com.anthropic.claude": return "Claude"
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
