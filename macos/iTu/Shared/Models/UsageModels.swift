import Foundation
import iTuDomain

typealias UsageAppIdentity = iTuDomain.UsageAppIdentity
typealias UsageSummary = iTuDomain.UsageSummary
typealias WebsiteUsageSummary = iTuDomain.WebsiteUsageSummary
typealias UsageUploadWatermark = iTuDomain.UsageUploadWatermark
typealias UsagePreferences = iTuDomain.UsagePreferences
typealias UsageTopApp = iTuDomain.UsageTopApp
typealias UsageDailyTotal = iTuDomain.UsageDailyTotal
typealias UsageDailyApp = iTuDomain.UsageDailyApp
typealias UsageHourlyApp = iTuDomain.UsageHourlyApp
typealias EngagementCoverage = iTuDomain.EngagementCoverage
typealias UsageStatistics = iTuDomain.UsageStatistics
typealias WebsiteUsageHostnameTotal = iTuDomain.WebsiteUsageHostnameTotal
typealias WebsiteUsageDailyTotal = iTuDomain.WebsiteUsageDailyTotal
typealias WebsiteUsageBrowserTotal = iTuDomain.WebsiteUsageBrowserTotal
typealias WebsiteUsageURLDetail = iTuDomain.WebsiteUsageURLDetail
typealias WebsiteUsageSession = iTuDomain.WebsiteUsageSession
typealias WebsiteActivityPrivacyFilter = iTuDomain.WebsiteActivityPrivacyFilter
typealias WebsiteUsageStatistics = iTuDomain.WebsiteUsageStatistics

public enum UsageDateFormatter {
    public static func string(from date: Date, calendar: Calendar = .current) -> String {
        let year = calendar.component(.year, from: date)
        let month = calendar.component(.month, from: date)
        let day = calendar.component(.day, from: date)
        return String(format: "%04d-%02d-%02d", year, month, day)
    }
}
