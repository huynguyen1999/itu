import Foundation

public struct UsageAppIdentity: Codable, Equatable, Sendable, Identifiable {
    public init(bundleId: String, displayName: String, iconHash: String?, iconUrl: String?) {
        self.bundleId = bundleId
        self.displayName = displayName
        self.iconHash = iconHash
        self.iconUrl = iconUrl
    }

    public let bundleId: String
    public let displayName: String
    public let iconHash: String?
    public let iconUrl: String?

    public var id: String { bundleId }
}

/// The producer of a usage summary. Raw values match the API UsageSource enum.
public enum UsageSource: String, Codable, CaseIterable, Sendable {
    case macOSForeground = "MACOS_FOREGROUND"
    case deviceActivity = "DEVICE_ACTIVITY"
    case browser = "BROWSER"
    case healthKit = "HEALTH_KIT"
    case screenTimeBiome = "SCREEN_TIME_BIOME"

    /// Lowercase acronym spelling retained for callers that use the API name.
    public static let macosForeground = UsageSource.macOSForeground
}

public struct UsageSummary: Codable, Equatable, Identifiable, Sendable {
    public init(
        localDate: String,
        hour: Int = -1,
        bundleId: String,
        displayName: String,
        timezone: String,
        activeSeconds: Int,
        engagedSeconds: Int? = nil,
        source: UsageSource = .macOSForeground,
        deviceId: String? = nil,
        pickups: Int? = nil,
        notifications: Int? = nil
    ) {
        self.localDate = localDate
        self.hour = hour
        self.bundleId = bundleId
        self.displayName = displayName
        self.timezone = timezone
        self.activeSeconds = activeSeconds
        self.engagedSeconds = engagedSeconds
        self.source = source
        self.deviceId = deviceId
        self.pickups = pickups
        self.notifications = notifications
    }

    private enum CodingKeys: String, CodingKey {
        case localDate, hour, bundleId, displayName, timezone, activeSeconds, engagedSeconds
        case source, deviceId, pickups, notifications
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        localDate = try container.decode(String.self, forKey: .localDate)
        hour = try container.decodeIfPresent(Int.self, forKey: .hour) ?? -1
        bundleId = try container.decode(String.self, forKey: .bundleId)
        displayName = try container.decode(String.self, forKey: .displayName)
        timezone = try container.decode(String.self, forKey: .timezone)
        activeSeconds = try container.decode(Int.self, forKey: .activeSeconds)
        engagedSeconds = try container.decodeIfPresent(Int.self, forKey: .engagedSeconds)
        source = try container.decodeIfPresent(UsageSource.self, forKey: .source) ?? .macOSForeground
        deviceId = try container.decodeIfPresent(String.self, forKey: .deviceId)
        pickups = try container.decodeIfPresent(Int.self, forKey: .pickups)
        notifications = try container.decodeIfPresent(Int.self, forKey: .notifications)
    }

    public let localDate: String
    public var hour: Int
    public let bundleId: String
    public var displayName: String
    public let timezone: String
    public var activeSeconds: Int
    public var engagedSeconds: Int? = nil
    public var source: UsageSource
    public var deviceId: String?
    public var pickups: Int?
    public var notifications: Int?

    public var id: String {
        guard let deviceId else { return "\(localDate)|\(hour >= 0 ? String(hour) : "legacy")|\(bundleId)" }
        return "\(deviceId)|\(source.rawValue)|\(localDate)|\(hour)|\(bundleId)"
    }
}
public struct WebsiteUsageSummary: Codable, Equatable, Identifiable, Sendable {
    public init(
        localDate: String,
        hour: Int = -1,
        browserBundleId: String? = nil,
        browserDisplayName: String = "",
        hostname: String,
        url: String? = nil,
        timezone: String,
        activeSeconds: Int,
        source: UsageSource = .browser,
        deviceId: String? = nil
    ) {
        self.localDate = localDate
        self.hour = hour
        self.browserBundleId = browserBundleId
        self.browserDisplayName = browserDisplayName
        self.hostname = hostname
        self.url = url
        self.timezone = timezone
        self.activeSeconds = activeSeconds
        self.source = source
        self.deviceId = deviceId
    }

    private enum CodingKeys: String, CodingKey {
        case localDate, hour, browserBundleId, browserDisplayName, hostname, url, timezone, activeSeconds
        case source, deviceId
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        localDate = try container.decode(String.self, forKey: .localDate)
        hour = try container.decodeIfPresent(Int.self, forKey: .hour) ?? -1
        browserBundleId = try container.decodeIfPresent(String.self, forKey: .browserBundleId)
        browserDisplayName = try container.decodeIfPresent(String.self, forKey: .browserDisplayName) ?? ""
        hostname = try container.decode(String.self, forKey: .hostname)
        url = try container.decodeIfPresent(String.self, forKey: .url)
        timezone = try container.decode(String.self, forKey: .timezone)
        activeSeconds = try container.decode(Int.self, forKey: .activeSeconds)
        source = try container.decodeIfPresent(UsageSource.self, forKey: .source) ?? .browser
        deviceId = try container.decodeIfPresent(String.self, forKey: .deviceId)
    }

    public let localDate: String
    public var hour: Int
    public var browserBundleId: String?
    public var browserDisplayName: String
    public let hostname: String
    public let url: String?
    public let timezone: String
    public var activeSeconds: Int
    public var source: UsageSource
    public var deviceId: String?

    public var urlKey: String { url ?? "legacy:\(hostname)" }

    public var id: String {
        guard let deviceId else {
            return "\(localDate)|\(browserBundleId ?? "")|\(hostname)"
        }
        let browserIdentity = source == .browser ? "|\(browserBundleId ?? "")" : ""
        return "\(deviceId)|\(source.rawValue)|\(localDate)|\(hour)\(browserIdentity)|\(urlKey)"
    }
}

public struct UsageUploadWatermark: Codable, Equatable, Sendable {
    public var activeSeconds: Int
    public var engagedSeconds: Int? = nil

    private enum CodingKeys: String, CodingKey {
        case activeSeconds
        case engagedSeconds
    }

    public init(activeSeconds: Int, engagedSeconds: Int? = nil) {
        self.activeSeconds = activeSeconds
        self.engagedSeconds = engagedSeconds
    }

    public init(from decoder: Decoder) throws {
        if let single = try? decoder.singleValueContainer(), let val = try? single.decode(Int.self) {
            self.activeSeconds = val
            self.engagedSeconds = nil
            return
        }
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.activeSeconds = try container.decode(Int.self, forKey: .activeSeconds)
        self.engagedSeconds = try container.decodeIfPresent(Int.self, forKey: .engagedSeconds)
    }
}

public struct UsagePreferences: Codable, Equatable, Sendable {
    public init(
        enabled: Bool = false,
        websiteTrackingEnabled: Bool = false,
        retentionDays: Int = 90,
        idleThresholdSeconds: Int = 300,
        excludedBundleIds: [String] = [],
        launchAtLogin: Bool = false,
        paused: Bool = false
    ) {
        self.enabled = enabled
        self.websiteTrackingEnabled = websiteTrackingEnabled
        self.retentionDays = retentionDays
        self.idleThresholdSeconds = idleThresholdSeconds
        self.excludedBundleIds = excludedBundleIds
        self.launchAtLogin = launchAtLogin
        self.paused = paused
    }

    public var enabled = false
    public var websiteTrackingEnabled = false
    public var retentionDays = 90
    public var idleThresholdSeconds = 300
    public var excludedBundleIds: [String] = []
    public var launchAtLogin = false
    public var paused = false
}

public struct UsageTopApp: Codable, Equatable, Sendable, Identifiable {
    public init(bundleId: String, displayName: String, activeSeconds: Int, engagedSeconds: Int? = nil) {
        self.bundleId = bundleId
        self.displayName = displayName
        self.activeSeconds = activeSeconds
        self.engagedSeconds = engagedSeconds
    }

    public let bundleId: String
    public let displayName: String
    public let activeSeconds: Int
    public var engagedSeconds: Int? = nil
    public var id: String { bundleId }
}

public struct UsageDailyTotal: Codable, Equatable, Sendable, Identifiable {
    public init(localDate: String, activeSeconds: Int, engagedSeconds: Int? = nil) {
        self.localDate = localDate
        self.activeSeconds = activeSeconds
        self.engagedSeconds = engagedSeconds
    }

    public let localDate: String
    public let activeSeconds: Int
    public var engagedSeconds: Int? = nil
    public var id: String { localDate }
}

public struct UsageDailyApp: Codable, Equatable, Sendable, Identifiable {
    public init(localDate: String, bundleId: String, displayName: String, activeSeconds: Int, engagedSeconds: Int? = nil) {
        self.localDate = localDate
        self.bundleId = bundleId
        self.displayName = displayName
        self.activeSeconds = activeSeconds
        self.engagedSeconds = engagedSeconds
    }

    public let localDate: String
    public let bundleId: String
    public let displayName: String
    public let activeSeconds: Int
    public var engagedSeconds: Int? = nil
    public var id: String { "\(localDate)|\(bundleId)" }
}

public struct UsageHourlyApp: Codable, Equatable, Sendable, Identifiable {
    public init(localDate: String, hour: Int, bundleId: String, displayName: String, activeSeconds: Int, engagedSeconds: Int? = nil) {
        self.localDate = localDate
        self.hour = hour
        self.bundleId = bundleId
        self.displayName = displayName
        self.activeSeconds = activeSeconds
        self.engagedSeconds = engagedSeconds
    }

    public let localDate: String
    public let hour: Int
    public let bundleId: String
    public let displayName: String
    public let activeSeconds: Int
    public var engagedSeconds: Int? = nil
    public var id: String { "\(localDate)|\(hour)|\(bundleId)" }
}

public struct EngagementCoverage: Codable, Equatable, Sendable {
    public init(observedActiveSeconds: Int, totalActiveSeconds: Int, complete: Bool) {
        self.observedActiveSeconds = observedActiveSeconds
        self.totalActiveSeconds = totalActiveSeconds
        self.complete = complete
    }

    public let observedActiveSeconds: Int
    public let totalActiveSeconds: Int
    public let complete: Bool
}

public struct UsageStatistics: Codable, Equatable, Sendable {
    public let totalActiveSeconds: Int
    public let totalEngagedSeconds: Int?
    public let engagementCoverage: EngagementCoverage?
    public let topApps: [UsageTopApp]
    public let daily: [UsageDailyTotal]
    public let dailyApps: [UsageDailyApp]
    public let hourlyApps: [UsageHourlyApp]?

    public init(
        totalActiveSeconds: Int,
        totalEngagedSeconds: Int? = nil,
        engagementCoverage: EngagementCoverage? = nil,
        topApps: [UsageTopApp],
        daily: [UsageDailyTotal],
        dailyApps: [UsageDailyApp],
        hourlyApps: [UsageHourlyApp]? = nil
    ) {
        self.totalActiveSeconds = totalActiveSeconds
        self.totalEngagedSeconds = totalEngagedSeconds
        self.engagementCoverage = engagementCoverage
        self.topApps = topApps
        self.daily = daily
        self.dailyApps = dailyApps
        self.hourlyApps = hourlyApps
    }

    public static func aggregating(_ summaries: [UsageSummary]) -> UsageStatistics {
        var apps: [String: (name: String, active: Int, engaged: Int, hasEngaged: Bool)] = [:]
        var days: [String: (active: Int, engaged: Int, hasEngaged: Bool)] = [:]
        var dailyApps: [String: (localDate: String, bundleId: String, displayName: String, active: Int, engaged: Int, hasEngaged: Bool)] = [:]
        var hourlyApps: [String: (localDate: String, hour: Int, bundleId: String, displayName: String, active: Int, engaged: Int, hasEngaged: Bool)] = [:]

        var totalActive = 0
        var totalEngaged = 0
        var observedActive = 0
        var seenDeviceActivityBuckets: Set<String> = []

        for summary in summaries {
            if summary.source == .deviceActivity && !seenDeviceActivityBuckets.insert(summary.id).inserted {
                continue
            }
            let hasEngaged = summary.engagedSeconds != nil
            let engaged = summary.engagedSeconds ?? 0

            totalActive += summary.activeSeconds
            if hasEngaged {
                totalEngaged += engaged
                observedActive += summary.activeSeconds
            }

            let existingApp = apps[summary.bundleId]
            apps[summary.bundleId] = (
                summary.displayName,
                (existingApp?.active ?? 0) + summary.activeSeconds,
                (existingApp?.engaged ?? 0) + engaged,
                (existingApp?.hasEngaged ?? false) || hasEngaged
            )

            let existingDay = days[summary.localDate] ?? (0, 0, false)
            days[summary.localDate] = (
                existingDay.active + summary.activeSeconds,
                existingDay.engaged + engaged,
                existingDay.hasEngaged || hasEngaged
            )

            let dailyAppKey = "\(summary.localDate)|\(summary.bundleId)"
            let existingDailyApp = dailyApps[dailyAppKey] ?? (summary.localDate, summary.bundleId, summary.displayName, 0, 0, false)
            dailyApps[dailyAppKey] = (
                summary.localDate,
                summary.bundleId,
                summary.displayName,
                existingDailyApp.active + summary.activeSeconds,
                existingDailyApp.engaged + engaged,
                existingDailyApp.hasEngaged || hasEngaged
            )

            if summary.hour >= 0 {
                let hour = summary.hour
                let hourlyAppKey = "\(summary.localDate)|\(hour)|\(summary.bundleId)"
                let existingHourlyApp = hourlyApps[hourlyAppKey] ?? (summary.localDate, hour, summary.bundleId, summary.displayName, 0, 0, false)
                hourlyApps[hourlyAppKey] = (
                    summary.localDate,
                    hour,
                    summary.bundleId,
                    summary.displayName,
                    existingHourlyApp.active + summary.activeSeconds,
                    existingHourlyApp.engaged + engaged,
                    existingHourlyApp.hasEngaged || hasEngaged
                )
            }
        }

        let hasObserved = observedActive > 0
        let coverage = EngagementCoverage(
            observedActiveSeconds: observedActive,
            totalActiveSeconds: totalActive,
            complete: totalActive > 0 && observedActive == totalActive
        )

        return UsageStatistics(
            totalActiveSeconds: totalActive,
            totalEngagedSeconds: hasObserved ? totalEngaged : nil,
            engagementCoverage: hasObserved ? coverage : nil,
            topApps: apps.map { UsageTopApp(bundleId: $0.key, displayName: $0.value.name, activeSeconds: $0.value.active, engagedSeconds: $0.value.hasEngaged ? $0.value.engaged : nil) }
                .sorted { $0.activeSeconds == $1.activeSeconds ? $0.displayName < $1.displayName : $0.activeSeconds > $1.activeSeconds },
            daily: days.map { UsageDailyTotal(localDate: $0.key, activeSeconds: $0.value.active, engagedSeconds: $0.value.hasEngaged ? $0.value.engaged : nil) }
                .sorted { $0.localDate < $1.localDate },
            dailyApps: dailyApps.values.map { UsageDailyApp(localDate: $0.localDate, bundleId: $0.bundleId, displayName: $0.displayName, activeSeconds: $0.active, engagedSeconds: $0.hasEngaged ? $0.engaged : nil) }
                .sorted { $0.localDate == $1.localDate ? $0.activeSeconds > $1.activeSeconds : $0.localDate < $1.localDate },
            hourlyApps: hourlyApps.values.map { UsageHourlyApp(localDate: $0.localDate, hour: $0.hour, bundleId: $0.bundleId, displayName: $0.displayName, activeSeconds: $0.active, engagedSeconds: $0.hasEngaged ? $0.engaged : nil) }
                .sorted { $0.hour == $1.hour ? $0.activeSeconds > $1.activeSeconds : $0.hour < $1.hour }
        )
    }

    public func adding(_ summaries: [UsageSummary]) -> UsageStatistics {
        let added = Self.aggregating(summaries)
        var appMap = Dictionary(uniqueKeysWithValues: topApps.map { ($0.bundleId, $0) })
        for app in added.topApps {
            let prev = appMap[app.bundleId]
            let prevEngaged = prev?.engagedSeconds
            let addEngaged = app.engagedSeconds
            let newEngaged: Int? = (prevEngaged != nil || addEngaged != nil) ? ((prevEngaged ?? 0) + (addEngaged ?? 0)) : nil
            appMap[app.bundleId] = UsageTopApp(
                bundleId: app.bundleId,
                displayName: app.displayName,
                activeSeconds: (prev?.activeSeconds ?? 0) + app.activeSeconds,
                engagedSeconds: newEngaged
            )
        }

        var dayMap = Dictionary(uniqueKeysWithValues: daily.map { ($0.localDate, $0) })
        for day in added.daily {
            let prev = dayMap[day.localDate]
            let prevEngaged = prev?.engagedSeconds
            let addEngaged = day.engagedSeconds
            let newEngaged: Int? = (prevEngaged != nil || addEngaged != nil) ? ((prevEngaged ?? 0) + (addEngaged ?? 0)) : nil
            dayMap[day.localDate] = UsageDailyTotal(
                localDate: day.localDate,
                activeSeconds: (prev?.activeSeconds ?? 0) + day.activeSeconds,
                engagedSeconds: newEngaged
            )
        }

        var dailyAppMap = Dictionary(uniqueKeysWithValues: self.dailyApps.map { ($0.id, $0) })
        for app in added.dailyApps {
            let prev = dailyAppMap[app.id]
            let prevEngaged = prev?.engagedSeconds
            let addEngaged = app.engagedSeconds
            let newEngaged: Int? = (prevEngaged != nil || addEngaged != nil) ? ((prevEngaged ?? 0) + (addEngaged ?? 0)) : nil
            dailyAppMap[app.id] = UsageDailyApp(
                localDate: app.localDate,
                bundleId: app.bundleId,
                displayName: app.displayName,
                activeSeconds: (prev?.activeSeconds ?? 0) + app.activeSeconds,
                engagedSeconds: newEngaged
            )
        }

        var hourlyAppMap = Dictionary(uniqueKeysWithValues: (self.hourlyApps ?? []).map { ($0.id, $0) })
        for app in added.hourlyApps ?? [] {
            let prev = hourlyAppMap[app.id]
            let prevEngaged = prev?.engagedSeconds
            let addEngaged = app.engagedSeconds
            let newEngaged: Int? = (prevEngaged != nil || addEngaged != nil) ? ((prevEngaged ?? 0) + (addEngaged ?? 0)) : nil
            hourlyAppMap[app.id] = UsageHourlyApp(
                localDate: app.localDate,
                hour: app.hour,
                bundleId: app.bundleId,
                displayName: app.displayName,
                activeSeconds: (prev?.activeSeconds ?? 0) + app.activeSeconds,
                engagedSeconds: newEngaged
            )
        }

        let newTotalActive = totalActiveSeconds + added.totalActiveSeconds
        let newTotalEngaged: Int? = (totalEngagedSeconds != nil || added.totalEngagedSeconds != nil)
            ? ((totalEngagedSeconds ?? 0) + (added.totalEngagedSeconds ?? 0))
            : nil

        let prevObserved = engagementCoverage?.observedActiveSeconds ?? (totalEngagedSeconds != nil ? totalActiveSeconds : 0)
        let addObserved = added.engagementCoverage?.observedActiveSeconds ?? (added.totalEngagedSeconds != nil ? added.totalActiveSeconds : 0)
        let newObserved = prevObserved + addObserved
        let newCoverage: EngagementCoverage? = newObserved > 0 ? EngagementCoverage(
            observedActiveSeconds: newObserved,
            totalActiveSeconds: newTotalActive,
            complete: newTotalActive > 0 && newObserved == newTotalActive
        ) : nil

        return UsageStatistics(
            totalActiveSeconds: newTotalActive,
            totalEngagedSeconds: newTotalEngaged,
            engagementCoverage: newCoverage,
            topApps: appMap.values.sorted { $0.activeSeconds == $1.activeSeconds ? $0.displayName < $1.displayName : $0.activeSeconds > $1.activeSeconds },
            daily: dayMap.values.sorted { $0.localDate < $1.localDate },
            dailyApps: dailyAppMap.values.sorted { $0.localDate == $1.localDate ? $0.activeSeconds > $1.activeSeconds : $0.localDate < $1.localDate },
            hourlyApps: hourlyAppMap.values.sorted { $0.hour == $1.hour ? $0.activeSeconds > $1.activeSeconds : $0.hour < $1.hour }
        )
    }
}

public struct WebsiteUsageHostnameTotal: Codable, Equatable, Sendable, Identifiable {
    public let hostname: String
    public let activeSeconds: Int
    public var id: String { hostname }

    private enum CodingKeys: String, CodingKey {
        case hostname
        case activeSeconds
    }

    public init(hostname: String, activeSeconds: Int) {
        self.hostname = hostname
        self.activeSeconds = activeSeconds
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.hostname = try container.decodeIfPresent(String.self, forKey: .hostname) ?? ""
        self.activeSeconds = try container.decodeIfPresent(Int.self, forKey: .activeSeconds) ?? 0
    }
}

public struct WebsiteUsageDailyTotal: Codable, Equatable, Sendable, Identifiable {
    public let localDate: String
    public let activeSeconds: Int
    public var id: String { localDate }

    private enum CodingKeys: String, CodingKey {
        case localDate
        case activeSeconds
    }

    public init(localDate: String, activeSeconds: Int) {
        self.localDate = localDate
        self.activeSeconds = activeSeconds
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.localDate = try container.decodeIfPresent(String.self, forKey: .localDate) ?? ""
        self.activeSeconds = try container.decodeIfPresent(Int.self, forKey: .activeSeconds) ?? 0
    }
}

public struct WebsiteUsageBrowserTotal: Codable, Equatable, Sendable, Identifiable {
    public let browserBundleId: String
    public let browserDisplayName: String
    public let activeSeconds: Int
    public var id: String { browserBundleId }

    private enum CodingKeys: String, CodingKey {
        case browserBundleId
        case browserDisplayName
        case activeSeconds
    }

    public init(browserBundleId: String, browserDisplayName: String, activeSeconds: Int) {
        self.browserBundleId = browserBundleId
        self.browserDisplayName = browserDisplayName
        self.activeSeconds = activeSeconds
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let bundleId = try container.decodeIfPresent(String.self, forKey: .browserBundleId) ?? ""
        self.browserBundleId = bundleId
        let name = try container.decodeIfPresent(String.self, forKey: .browserDisplayName)
        self.browserDisplayName = (name?.isEmpty == false) ? name! : usageBrowserDisplayName(for: bundleId)
        self.activeSeconds = try container.decodeIfPresent(Int.self, forKey: .activeSeconds) ?? 0
    }
}

public struct WebsiteUsageURLDetail: Codable, Equatable, Sendable, Identifiable {
    public init(url: String, hostname: String, activeSeconds: Int, latestTitle: String?, iconUrl: String? = nil, isPrivate: Bool) {
        self.url = url
        self.hostname = hostname
        self.activeSeconds = activeSeconds
        self.latestTitle = latestTitle
        self.iconUrl = iconUrl
        self.isPrivate = isPrivate
    }

    public let url: String
    public let hostname: String
    public let activeSeconds: Int
    public let latestTitle: String?
    public var iconUrl: String? = nil
    public let isPrivate: Bool

    public var id: String { "\(isPrivate ? "private" : "normal")|\(url)" }
    public var displayTitle: String { latestTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? latestTitle! : url }
}

public struct WebsiteUsageSession: Codable, Equatable, Sendable, Identifiable {
    public init(id: String, installationId: String, browserBundleId: String, browserDisplayName: String, startedAt: String, endedAt: String, activeSeconds: Int, hostname: String, url: String?, iconUrl: String? = nil, pageTitle: String?, isPrivate: Bool, timezone: String, createdAt: String?) {
        self.id = id
        self.installationId = installationId
        self.browserBundleId = browserBundleId
        self.browserDisplayName = browserDisplayName
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.activeSeconds = activeSeconds
        self.hostname = hostname
        self.url = url
        self.iconUrl = iconUrl
        self.pageTitle = pageTitle
        self.isPrivate = isPrivate
        self.timezone = timezone
        self.createdAt = createdAt
    }

    public let id: String
    public let installationId: String
    public let browserBundleId: String
    public let browserDisplayName: String
    public let startedAt: String
    public let endedAt: String
    public let activeSeconds: Int
    public let hostname: String
    public let url: String?
    public var iconUrl: String? = nil
    public let pageTitle: String?
    public let isPrivate: Bool
    public let timezone: String
    public let createdAt: String?
}

public enum WebsiteActivityPrivacyFilter: String, CaseIterable, Identifiable, Sendable {
    case all
    case normal
    case `private`

    public var id: String { rawValue }
    public var title: String { rawValue.capitalized }

    public func matches(isPrivate: Bool) -> Bool {
        switch self {
        case .all: true
        case .normal: !isPrivate
        case .private: isPrivate
        }
    }
}

public struct WebsiteUsageStatistics: Codable, Equatable, Sendable {
    public let from: String?
    public let to: String?
    public let totalActiveSeconds: Int
    public let hostnames: [WebsiteUsageHostnameTotal]
    public let topHostnames: [WebsiteUsageHostnameTotal]
    public let urlDetails: [WebsiteUsageURLDetail]
    public let daily: [WebsiteUsageDailyTotal]
    public let browsers: [WebsiteUsageBrowserTotal]
    public let sessions: [WebsiteUsageSession]

    private enum CodingKeys: String, CodingKey {
        case from
        case to
        case totalActiveSeconds
        case hostnames
        case topHostnames
        case urlDetails
        case daily
        case browsers
        case sessions
    }

    public init(
        totalActiveSeconds: Int,
        hostnames: [WebsiteUsageHostnameTotal],
        topHostnames: [WebsiteUsageHostnameTotal] = [],
        daily: [WebsiteUsageDailyTotal] = [],
        browsers: [WebsiteUsageBrowserTotal] = [],
        from: String? = nil,
        to: String? = nil,
        urlDetails: [WebsiteUsageURLDetail] = [],
        sessions: [WebsiteUsageSession] = []
    ) {
        self.from = from
        self.to = to
        self.totalActiveSeconds = totalActiveSeconds
        self.hostnames = hostnames
        self.topHostnames = topHostnames.isEmpty ? Array(hostnames.prefix(10)) : topHostnames
        self.urlDetails = urlDetails
        self.daily = daily
        self.browsers = browsers
        self.sessions = sessions
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.from = try container.decodeIfPresent(String.self, forKey: .from)
        self.to = try container.decodeIfPresent(String.self, forKey: .to)
        self.totalActiveSeconds = try container.decodeIfPresent(Int.self, forKey: .totalActiveSeconds) ?? 0
        let decodedHostnames = try container.decodeIfPresent([WebsiteUsageHostnameTotal].self, forKey: .hostnames) ?? []
        self.hostnames = decodedHostnames
        let decodedTop = try container.decodeIfPresent([WebsiteUsageHostnameTotal].self, forKey: .topHostnames) ?? []
        self.topHostnames = decodedTop.isEmpty ? Array(decodedHostnames.prefix(10)) : decodedTop
        self.urlDetails = try container.decodeIfPresent([WebsiteUsageURLDetail].self, forKey: .urlDetails) ?? []
        self.daily = try container.decodeIfPresent([WebsiteUsageDailyTotal].self, forKey: .daily) ?? []
        self.browsers = try container.decodeIfPresent([WebsiteUsageBrowserTotal].self, forKey: .browsers) ?? []
        self.sessions = try container.decodeIfPresent([WebsiteUsageSession].self, forKey: .sessions) ?? []
    }

    public static func aggregating(_ summaries: [WebsiteUsageSummary]) -> WebsiteUsageStatistics {
        var hostnames: [String: Int] = [:]
        var daily: [String: Int] = [:]
        var browsers: [String: (name: String, seconds: Int)] = [:]
        var seenDeviceActivityBuckets: Set<String> = []
        var totalActive = 0
        for summary in summaries {
            if summary.source == .deviceActivity && !seenDeviceActivityBuckets.insert(summary.id).inserted {
                continue
            }
            totalActive += summary.activeSeconds
            hostnames[summary.hostname, default: 0] += summary.activeSeconds
            daily[summary.localDate, default: 0] += summary.activeSeconds
            if let browserBundleId = summary.browserBundleId {
                let existing = browsers[browserBundleId]
                let displayName = summary.browserDisplayName.isEmpty
                    ? (existing?.name.isEmpty == false ? existing!.name : browserBundleId)
                    : summary.browserDisplayName
                browsers[browserBundleId] = (
                    displayName,
                    (existing?.seconds ?? 0) + summary.activeSeconds
                )
            }
        }
        let hostnameItems = hostnames.map { WebsiteUsageHostnameTotal(hostname: $0.key, activeSeconds: $0.value) }
            .sorted { $0.activeSeconds == $1.activeSeconds ? $0.hostname < $1.hostname : $0.activeSeconds > $1.activeSeconds }
        let dailyItems = daily.map { WebsiteUsageDailyTotal(localDate: $0.key, activeSeconds: $0.value) }
            .sorted { $0.localDate < $1.localDate }
        let browserItems = browsers.map { WebsiteUsageBrowserTotal(browserBundleId: $0.key, browserDisplayName: $0.value.name, activeSeconds: $0.value.seconds) }
            .sorted { $0.activeSeconds == $1.activeSeconds ? $0.browserDisplayName < $1.browserDisplayName : $0.activeSeconds > $1.activeSeconds }
        return WebsiteUsageStatistics(
            totalActiveSeconds: totalActive,
            hostnames: hostnameItems,
            topHostnames: Array(hostnameItems.prefix(10)),
            daily: dailyItems,
            browsers: browserItems
        )
    }

    public func adding(_ summaries: [WebsiteUsageSummary]) -> WebsiteUsageStatistics {
        let added = Self.aggregating(summaries)
        var hosts = Dictionary(uniqueKeysWithValues: hostnames.map { ($0.hostname, $0.activeSeconds) })
        for item in added.hostnames { hosts[item.hostname, default: 0] += item.activeSeconds }
        var days = Dictionary(uniqueKeysWithValues: daily.map { ($0.localDate, $0.activeSeconds) })
        for item in added.daily { days[item.localDate, default: 0] += item.activeSeconds }
        var brows = Dictionary(uniqueKeysWithValues: browsers.map { ($0.browserBundleId, (name: $0.browserDisplayName, seconds: $0.activeSeconds)) })
        for item in added.browsers {
            let existing = brows[item.browserBundleId]
            let displayName = item.browserDisplayName.isEmpty
                ? (existing?.name.isEmpty == false ? existing!.name : item.browserBundleId)
                : item.browserDisplayName
            brows[item.browserBundleId] = (
                displayName,
                (existing?.seconds ?? 0) + item.activeSeconds
            )
        }
        let hostnameItems = hosts.map { WebsiteUsageHostnameTotal(hostname: $0.key, activeSeconds: $0.value) }
            .sorted { $0.activeSeconds == $1.activeSeconds ? $0.hostname < $1.hostname : $0.activeSeconds > $1.activeSeconds }
        let dailyItems = days.map { WebsiteUsageDailyTotal(localDate: $0.key, activeSeconds: $0.value) }
            .sorted { $0.localDate < $1.localDate }
        let browserItems = brows.map { WebsiteUsageBrowserTotal(browserBundleId: $0.key, browserDisplayName: $0.value.name, activeSeconds: $0.value.seconds) }
            .sorted { $0.activeSeconds == $1.activeSeconds ? $0.browserDisplayName < $1.browserDisplayName : $0.activeSeconds > $1.activeSeconds }
        return WebsiteUsageStatistics(
            totalActiveSeconds: totalActiveSeconds + added.totalActiveSeconds,
            hostnames: hostnameItems,
            topHostnames: Array(hostnameItems.prefix(10)),
            daily: dailyItems,
            browsers: browserItems,
            from: from,
            to: to,
            urlDetails: urlDetails,
            sessions: sessions
        )
    }
}


private func usageBrowserDisplayName(for bundleID: String) -> String {
    switch bundleID {
    case "com.microsoft.edgemac": "Microsoft Edge"
    case "com.google.Chrome", "com.google.Chrome.canary": "Google Chrome"
    case "com.brave.Browser": "Brave"
    case "company.thebrowser.Browser": "Arc"
    case "com.vivaldi.Vivaldi": "Vivaldi"
    case "com.operasoftware.Opera": "Opera"
    case "org.chromium.Chromium": "Chromium"
    case "com.apple.Safari": "Safari"
    default: "Browser"
    }
}
