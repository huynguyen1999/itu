import Foundation

struct UsageSummary: Codable, Equatable, Identifiable, Sendable {
    let localDate: String
    var hour: Int? = nil
    let bundleId: String
    var displayName: String
    let timezone: String
    var activeSeconds: Int

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

struct UsagePreferences: Codable, Equatable, Sendable {
    var enabled = false
    var websiteTrackingEnabled = false
    var retentionDays = 90
    var launchAtLogin = false
    var paused = false
}

struct UsageTopApp: Codable, Equatable, Sendable, Identifiable {
    let bundleId: String
    let displayName: String
    let activeSeconds: Int
    var id: String { bundleId }
}

struct UsageDailyTotal: Codable, Equatable, Sendable, Identifiable {
    let localDate: String
    let activeSeconds: Int
    var id: String { localDate }
}

struct UsageDailyApp: Codable, Equatable, Sendable, Identifiable {
    let localDate: String
    let bundleId: String
    let displayName: String
    let activeSeconds: Int
    var id: String { "\(localDate)|\(bundleId)" }
}

struct UsageHourlyApp: Codable, Equatable, Sendable, Identifiable {
    let localDate: String
    let hour: Int
    let bundleId: String
    let displayName: String
    let activeSeconds: Int
    var id: String { "\(localDate)|\(hour)|\(bundleId)" }
}

struct UsageStatistics: Codable, Equatable, Sendable {
    let totalActiveSeconds: Int
    let topApps: [UsageTopApp]
    let daily: [UsageDailyTotal]
    let dailyApps: [UsageDailyApp]
    let hourlyApps: [UsageHourlyApp]?

    init(
        totalActiveSeconds: Int,
        topApps: [UsageTopApp],
        daily: [UsageDailyTotal],
        dailyApps: [UsageDailyApp],
        hourlyApps: [UsageHourlyApp]? = nil
    ) {
        self.totalActiveSeconds = totalActiveSeconds
        self.topApps = topApps
        self.daily = daily
        self.dailyApps = dailyApps
        self.hourlyApps = hourlyApps
    }

    static func aggregating(_ summaries: [UsageSummary]) -> UsageStatistics {
        var apps: [String: (name: String, seconds: Int)] = [:]
        var days: [String: Int] = [:]
        var dailyApps: [String: UsageDailyApp] = [:]
        var hourlyApps: [String: UsageHourlyApp] = [:]
        for summary in summaries {
            let existing = apps[summary.bundleId]
            apps[summary.bundleId] = (summary.displayName, (existing?.seconds ?? 0) + summary.activeSeconds)
            days[summary.localDate, default: 0] += summary.activeSeconds
            let dailyAppKey = "\(summary.localDate)|\(summary.bundleId)"
            dailyApps[dailyAppKey] = UsageDailyApp(
                localDate: summary.localDate,
                bundleId: summary.bundleId,
                displayName: summary.displayName,
                activeSeconds: (dailyApps[dailyAppKey]?.activeSeconds ?? 0) + summary.activeSeconds
            )
            if let hour = summary.hour {
                let hourlyAppKey = "\(summary.localDate)|\(hour)|\(summary.bundleId)"
                hourlyApps[hourlyAppKey] = UsageHourlyApp(
                    localDate: summary.localDate,
                    hour: hour,
                    bundleId: summary.bundleId,
                    displayName: summary.displayName,
                    activeSeconds: (hourlyApps[hourlyAppKey]?.activeSeconds ?? 0) + summary.activeSeconds
                )
            }
        }
        return UsageStatistics(
            totalActiveSeconds: summaries.reduce(0) { $0 + $1.activeSeconds },
            topApps: apps.map { UsageTopApp(bundleId: $0.key, displayName: $0.value.name, activeSeconds: $0.value.seconds) }
                .sorted { $0.activeSeconds == $1.activeSeconds ? $0.displayName < $1.displayName : $0.activeSeconds > $1.activeSeconds },
            daily: days.map { UsageDailyTotal(localDate: $0.key, activeSeconds: $0.value) }
                .sorted { $0.localDate < $1.localDate },
            dailyApps: dailyApps.values.sorted { $0.localDate == $1.localDate ? $0.activeSeconds > $1.activeSeconds : $0.localDate < $1.localDate },
            hourlyApps: hourlyApps.values.sorted { $0.hour == $1.hour ? $0.activeSeconds > $1.activeSeconds : $0.hour < $1.hour }
        )
    }

    func adding(_ summaries: [UsageSummary]) -> UsageStatistics {
        let added = Self.aggregating(summaries)
        var apps = Dictionary(uniqueKeysWithValues: topApps.map { ($0.bundleId, $0) })
        for app in added.topApps {
            apps[app.bundleId] = UsageTopApp(
                bundleId: app.bundleId,
                displayName: app.displayName,
                activeSeconds: (apps[app.bundleId]?.activeSeconds ?? 0) + app.activeSeconds
            )
        }
        var days = Dictionary(uniqueKeysWithValues: daily.map { ($0.localDate, $0.activeSeconds) })
        for day in added.daily { days[day.localDate, default: 0] += day.activeSeconds }
        var dailyApps = Dictionary(uniqueKeysWithValues: self.dailyApps.map { ($0.id, $0) })
        for app in added.dailyApps {
            dailyApps[app.id] = UsageDailyApp(
                localDate: app.localDate,
                bundleId: app.bundleId,
                displayName: app.displayName,
                activeSeconds: (dailyApps[app.id]?.activeSeconds ?? 0) + app.activeSeconds
            )
        }
        var hourlyApps = Dictionary(uniqueKeysWithValues: (self.hourlyApps ?? []).map { ($0.id, $0) })
        for app in added.hourlyApps ?? [] {
            hourlyApps[app.id] = UsageHourlyApp(
                localDate: app.localDate,
                hour: app.hour,
                bundleId: app.bundleId,
                displayName: app.displayName,
                activeSeconds: (hourlyApps[app.id]?.activeSeconds ?? 0) + app.activeSeconds
            )
        }
        return UsageStatistics(
            totalActiveSeconds: totalActiveSeconds + added.totalActiveSeconds,
            topApps: apps.values.sorted { $0.activeSeconds == $1.activeSeconds ? $0.displayName < $1.displayName : $0.activeSeconds > $1.activeSeconds },
            daily: days.map { UsageDailyTotal(localDate: $0.key, activeSeconds: $0.value) }
                .sorted { $0.localDate < $1.localDate },
            dailyApps: dailyApps.values.sorted { $0.localDate == $1.localDate ? $0.activeSeconds > $1.activeSeconds : $0.localDate < $1.localDate },
            hourlyApps: hourlyApps.values.sorted { $0.hour == $1.hour ? $0.activeSeconds > $1.activeSeconds : $0.hour < $1.hour }
        )
    }
}
