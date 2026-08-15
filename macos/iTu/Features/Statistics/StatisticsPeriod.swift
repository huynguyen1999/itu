import Foundation

struct StatisticsDateRange: Equatable, Sendable {
    let from: String
    let to: String

    var dayCount: Int {
        guard let fromDate = StatisticsPeriod.date(from: from),
              let toDate = StatisticsPeriod.date(from: to) else { return 1 }
        return max(1, (StatisticsPeriod.calendar.dateComponents([.day], from: fromDate, to: toDate).day ?? 0) + 1)
    }

    var apiFrom: String { "\(from)T00:00:00.000+07:00" }
    var apiTo: String { "\(StatisticsPeriod.addDays(to, 1))T00:00:00.000+07:00" }
}

struct StatisticsPeriod: Equatable, Sendable {
    static let timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

    let from: String
    let to: String
    let grouping: StatisticsGrouping
    let comparisonFrom: String
    let comparisonTo: String

    var dateRange: StatisticsDateRange { StatisticsDateRange(from: from, to: to) }
    var dayCount: Int { dateRange.dayCount }
    var usageFrom: String { from }
    var usageTo: String { to }

    var apiFrom: String { dateRange.apiFrom }
    var apiTo: String { dateRange.apiTo }
    var comparison: StatisticsDateRange { StatisticsDateRange(from: comparisonFrom, to: comparisonTo) }

    init(range: StatisticsDateRange, grouping: StatisticsGrouping = .day) {
        let ordered = range.from <= range.to
            ? range
            : StatisticsDateRange(from: range.to, to: range.from)
        self.from = ordered.from
        self.to = ordered.to
        self.grouping = grouping
        let previousTo = Self.addDays(ordered.from, -1)
        self.comparisonTo = previousTo
        self.comparisonFrom = Self.addDays(previousTo, -(ordered.dayCount - 1))
    }

    static func preset(_ value: String, now: Date = Date(), grouping: StatisticsGrouping = .day) -> StatisticsPeriod {
        let end = dateKey(now)
        let days: Int
        switch value {
        case "Today": days = 1
        case "7 Days": days = 7
        case "30 Days": days = 30
        case "90 Days": days = 90
        case "365 Days": days = 365
        default: days = 365
        }
        return StatisticsPeriod(
            range: StatisticsDateRange(from: addDays(end, -(days - 1)), to: end),
            grouping: grouping
        )
    }

    static func custom(from: Date, to: Date, grouping: StatisticsGrouping = .day) -> StatisticsPeriod {
        StatisticsPeriod(
            range: StatisticsDateRange(from: dateKey(from), to: dateKey(to)),
            grouping: grouping
        )
    }

    static func dateKey(_ date: Date) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }

    static func date(from key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func addDays(_ key: String, _ amount: Int) -> String {
        guard let date = date(from: key), let result = calendar.date(byAdding: .day, value: amount, to: date) else {
            return key
        }
        return dateKey(result)
    }

    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.firstWeekday = 2
        calendar.minimumDaysInFirstWeek = 4
        return calendar
    }()
}
