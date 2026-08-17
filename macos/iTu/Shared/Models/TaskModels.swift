import Foundation
import iTuDomain

typealias TaskPriority = iTuDomain.TaskPriority
typealias TaskStatus = iTuDomain.TaskStatus
typealias ProductivityTask = iTuDomain.ProductivityTask
typealias TaskEdits = iTuDomain.TaskEdits
typealias UserProfile = iTuDomain.UserProfile
typealias AuthSession = iTuDomain.AuthSession
typealias TaskListModel = iTuDomain.TaskListModel
typealias TagModel = iTuDomain.TagModel
typealias TaskSectionModel = iTuDomain.TaskSectionModel
typealias TaskMetadataDTO = iTuDomain.TaskMetadataDTO
typealias TaskTagAssignmentDTO = iTuDomain.TaskTagAssignmentDTO
typealias TaskTagDTO = iTuDomain.TaskTagDTO
typealias AppNotificationModel = iTuDomain.AppNotificationModel
typealias TaskReminderModel = iTuDomain.TaskReminderModel

enum iTuDateSupport {
    static let iso8601 = iTuDomain.iTuDateSupport.iso8601
    static let iso8601Fractional = iTuDomain.iTuDateSupport.iso8601Fractional
    static let day = iTuDomain.iTuDateSupport.day
    static let dayParser = iTuDomain.iTuDateSupport.dayParser
    static let focusDayStyle = iTuDomain.iTuDateSupport.focusDayStyle
    static let dueDay = iTuDomain.iTuDateSupport.dueDay
    static let time = iTuDomain.iTuDateSupport.time

    static let calendarTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.calendar = .autoupdatingCurrent
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "h:mm a"
        return formatter
    }()
    static let calendarShortDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.calendar = .autoupdatingCurrent
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "MMM d"
        return formatter
    }()
    static let upcomingShortWeekdayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.calendar = .autoupdatingCurrent
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "EEE, MMM d"
        return formatter
    }()
    static let upcomingWeekdayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.calendar = .autoupdatingCurrent
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "EEEE"
        return formatter
    }()

    static func parse(_ value: String) -> Date? { iTuDomain.iTuDateSupport.parse(value) }
    static func calendarDayDifference(from: Date, to: Date) -> Int { iTuDomain.iTuDateSupport.calendarDayDifference(from: from, to: to) }
    static func string(from date: Date) -> String { iTuDomain.iTuDateSupport.string(from: date) }
    static func localDayString(from value: String) -> String { iTuDomain.iTuDateSupport.localDayString(from: value) }
}
