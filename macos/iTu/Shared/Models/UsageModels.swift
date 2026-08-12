import Foundation

struct UsageAppIdentity: Codable, Equatable, Sendable, Identifiable {
    let bundleId: String
    let displayName: String
    let iconHash: String?
    let iconUrl: String?

    var id: String { bundleId }
}

struct UsageSummary: Codable, Equatable, Identifiable, Sendable {
    let localDate: String
    var hour: Int? = nil
    let bundleId: String
    var displayName: String
    let timezone: String
    var activeSeconds: Int
    var engagedSeconds: Int? = nil

    var id: String { "\(localDate)|\(hour.map(String.init) ?? "legacy")|\(bundleId)" }
}
struct WebsiteUsageSummary: Codable, Equatable, Identifiable, Sendable {
    let localDate: String
    let browserBundleId: String
    var browserDisplayName: String
    let hostname: String
    let timezone: String
    var activeSeconds: Int

    var id: String { "\(localDate)|\(browserBundleId)|\(hostname)" }
}

struct UsageUploadWatermark: Codable, Equatable, Sendable {
    var activeSeconds: Int
    var engagedSeconds: Int? = nil

    enum CodingKeys: String, CodingKey {
        case activeSeconds
        case engagedSeconds
    }

    init(activeSeconds: Int, engagedSeconds: Int? = nil) {
        self.activeSeconds = activeSeconds
        self.engagedSeconds = engagedSeconds
    }

    init(from decoder: Decoder) throws {
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

struct UsagePreferences: Codable, Equatable, Sendable {
    var enabled = false
    var websiteTrackingEnabled = false
    var retentionDays = 90
    var idleThresholdSeconds = 300
    var excludedBundleIds: [String] = []
    var launchAtLogin = false
    var paused = false
}

struct UsageTopApp: Codable, Equatable, Sendable, Identifiable {
    let bundleId: String
    let displayName: String
    let activeSeconds: Int
    var engagedSeconds: Int? = nil
    var id: String { bundleId }
}

struct UsageDailyTotal: Codable, Equatable, Sendable, Identifiable {
    let localDate: String
    let activeSeconds: Int
    var engagedSeconds: Int? = nil
    var id: String { localDate }
}

struct UsageDailyApp: Codable, Equatable, Sendable, Identifiable {
    let localDate: String
    let bundleId: String
    let displayName: String
    let activeSeconds: Int
    var engagedSeconds: Int? = nil
    var id: String { "\(localDate)|\(bundleId)" }
}

struct UsageHourlyApp: Codable, Equatable, Sendable, Identifiable {
    let localDate: String
    let hour: Int
    let bundleId: String
    let displayName: String
    let activeSeconds: Int
    var engagedSeconds: Int? = nil
    var id: String { "\(localDate)|\(hour)|\(bundleId)" }
}

struct EngagementCoverage: Codable, Equatable, Sendable {
    let observedActiveSeconds: Int
    let totalActiveSeconds: Int
    let complete: Bool
}

struct UsageStatistics: Codable, Equatable, Sendable {
    let totalActiveSeconds: Int
    let totalEngagedSeconds: Int?
    let engagementCoverage: EngagementCoverage?
    let topApps: [UsageTopApp]
    let daily: [UsageDailyTotal]
    let dailyApps: [UsageDailyApp]
    let hourlyApps: [UsageHourlyApp]?

    init(
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

    static func aggregating(_ summaries: [UsageSummary]) -> UsageStatistics {
        var apps: [String: (name: String, active: Int, engaged: Int, hasEngaged: Bool)] = [:]
        var days: [String: (active: Int, engaged: Int, hasEngaged: Bool)] = [:]
        var dailyApps: [String: (localDate: String, bundleId: String, displayName: String, active: Int, engaged: Int, hasEngaged: Bool)] = [:]
        var hourlyApps: [String: (localDate: String, hour: Int, bundleId: String, displayName: String, active: Int, engaged: Int, hasEngaged: Bool)] = [:]

        var totalActive = 0
        var totalEngaged = 0
        var observedActive = 0

        for summary in summaries {
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

            if let hour = summary.hour {
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

    func adding(_ summaries: [UsageSummary]) -> UsageStatistics {
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

struct WebsiteUsageHostnameTotal: Codable, Equatable, Sendable, Identifiable {
    let hostname: String
    let activeSeconds: Int
    var id: String { hostname }

    enum CodingKeys: String, CodingKey {
        case hostname
        case activeSeconds
    }

    init(hostname: String, activeSeconds: Int) {
        self.hostname = hostname
        self.activeSeconds = activeSeconds
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.hostname = try container.decodeIfPresent(String.self, forKey: .hostname) ?? ""
        self.activeSeconds = try container.decodeIfPresent(Int.self, forKey: .activeSeconds) ?? 0
    }
}

struct WebsiteUsageDailyTotal: Codable, Equatable, Sendable, Identifiable {
    let localDate: String
    let activeSeconds: Int
    var id: String { localDate }

    enum CodingKeys: String, CodingKey {
        case localDate
        case activeSeconds
    }

    init(localDate: String, activeSeconds: Int) {
        self.localDate = localDate
        self.activeSeconds = activeSeconds
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.localDate = try container.decodeIfPresent(String.self, forKey: .localDate) ?? ""
        self.activeSeconds = try container.decodeIfPresent(Int.self, forKey: .activeSeconds) ?? 0
    }
}

struct WebsiteUsageBrowserTotal: Codable, Equatable, Sendable, Identifiable {
    let browserBundleId: String
    let browserDisplayName: String
    let activeSeconds: Int
    var id: String { browserBundleId }

    enum CodingKeys: String, CodingKey {
        case browserBundleId
        case browserDisplayName
        case activeSeconds
    }

    init(browserBundleId: String, browserDisplayName: String, activeSeconds: Int) {
        self.browserBundleId = browserBundleId
        self.browserDisplayName = browserDisplayName
        self.activeSeconds = activeSeconds
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let bundleId = try container.decodeIfPresent(String.self, forKey: .browserBundleId) ?? ""
        self.browserBundleId = bundleId
        let name = try container.decodeIfPresent(String.self, forKey: .browserDisplayName)
        self.browserDisplayName = (name?.isEmpty == false) ? name! : BrowserActivityState.displayName(for: bundleId)
        self.activeSeconds = try container.decodeIfPresent(Int.self, forKey: .activeSeconds) ?? 0
    }
}

struct WebsiteUsageURLDetail: Codable, Equatable, Sendable, Identifiable {
    let url: String
    let hostname: String
    let activeSeconds: Int
    let latestTitle: String?
    let iconUrl: String? = nil
    let isPrivate: Bool

    var id: String { "\(isPrivate ? "private" : "normal")|\(url)" }
    var displayTitle: String { latestTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? latestTitle! : url }
}

struct WebsiteUsageSession: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let installationId: String
    let browserBundleId: String
    let browserDisplayName: String
    let startedAt: String
    let endedAt: String
    let activeSeconds: Int
    let hostname: String
    let url: String?
    let iconUrl: String? = nil
    let pageTitle: String?
    let isPrivate: Bool
    let timezone: String
    let createdAt: String?
}

enum WebsiteActivityPrivacyFilter: String, CaseIterable, Identifiable, Sendable {
    case all
    case normal
    case `private`

    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    func matches(isPrivate: Bool) -> Bool {
        switch self {
        case .all: true
        case .normal: !isPrivate
        case .private: isPrivate
        }
    }
}

struct WebsiteUsageStatistics: Codable, Equatable, Sendable {
    let from: String?
    let to: String?
    let totalActiveSeconds: Int
    let hostnames: [WebsiteUsageHostnameTotal]
    let topHostnames: [WebsiteUsageHostnameTotal]
    let urlDetails: [WebsiteUsageURLDetail]
    let daily: [WebsiteUsageDailyTotal]
    let browsers: [WebsiteUsageBrowserTotal]
    let sessions: [WebsiteUsageSession]

    enum CodingKeys: String, CodingKey {
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

    init(
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

    init(from decoder: Decoder) throws {
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

    static func aggregating(_ summaries: [WebsiteUsageSummary]) -> WebsiteUsageStatistics {
        var hostnames: [String: Int] = [:]
        var daily: [String: Int] = [:]
        var browsers: [String: (name: String, seconds: Int)] = [:]
        for summary in summaries {
            hostnames[summary.hostname, default: 0] += summary.activeSeconds
            daily[summary.localDate, default: 0] += summary.activeSeconds
            let existing = browsers[summary.browserBundleId]
            let displayName = summary.browserDisplayName.isEmpty
                ? (existing?.name.isEmpty == false ? existing!.name : summary.browserBundleId)
                : summary.browserDisplayName
            browsers[summary.browserBundleId] = (
                displayName,
                (existing?.seconds ?? 0) + summary.activeSeconds
            )
        }
        let hostnameItems = hostnames.map { WebsiteUsageHostnameTotal(hostname: $0.key, activeSeconds: $0.value) }
            .sorted { $0.activeSeconds == $1.activeSeconds ? $0.hostname < $1.hostname : $0.activeSeconds > $1.activeSeconds }
        let dailyItems = daily.map { WebsiteUsageDailyTotal(localDate: $0.key, activeSeconds: $0.value) }
            .sorted { $0.localDate < $1.localDate }
        let browserItems = browsers.map { WebsiteUsageBrowserTotal(browserBundleId: $0.key, browserDisplayName: $0.value.name, activeSeconds: $0.value.seconds) }
            .sorted { $0.activeSeconds == $1.activeSeconds ? $0.browserDisplayName < $1.browserDisplayName : $0.activeSeconds > $1.activeSeconds }
        return WebsiteUsageStatistics(
            totalActiveSeconds: summaries.reduce(0) { $0 + $1.activeSeconds },
            hostnames: hostnameItems,
            topHostnames: Array(hostnameItems.prefix(10)),
            daily: dailyItems,
            browsers: browserItems
        )
    }

    func adding(_ summaries: [WebsiteUsageSummary]) -> WebsiteUsageStatistics {
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
