import Foundation
import iTuDomain

/// Revision snapshots have appeared with either the denormalized `tagIds`
/// array or the hydrated `tags` array. Keep restore/replay tolerant of both
/// representations while preserving explicit clears.
func iTuJournalSnapshotTagIDs(_ snapshot: [String: JSONValue]) -> [String]? {
    if let value = snapshot["tagIds"] {
        switch value {
        case let .array(values): return values.compactMap(\.stringValue)
        case .null: return []
        default: break
        }
    }
    guard let value = snapshot["tags"] else { return nil }
    switch value {
    case let .array(values):
        return values.compactMap { value in
            if let id = value.stringValue { return id }
            guard case let .object(fields) = value else { return nil }
            return fields["id"]?.stringValue
        }
    case .null: return []
    default: return nil
    }
}

/// The tuple distinguishes an omitted template from an explicit null clear.
func iTuJournalSnapshotTemplateID(_ snapshot: [String: JSONValue]) -> (present: Bool, value: String?) {
    guard let value = snapshot["templateId"] else { return (false, nil) }
    switch value {
    case let .string(id): return (true, id)
    case .null: return (true, nil)
    default: return (false, nil)
    }
}

enum iTuCalendarSupport {
    static let timezone = iTuDomain.iTuCalendarSupport.timezone
    static func calendar(firstWeekday: Int? = nil) -> Calendar { iTuDomain.iTuCalendarSupport.calendar(firstWeekday: firstWeekday) }
    static func dayString(_ date: Date = Date()) -> String { iTuDomain.iTuCalendarSupport.dayString(date) }
    static func monthString(_ date: Date = Date()) -> String { iTuDomain.iTuCalendarSupport.monthString(date) }
    static func weekRange(containing date: Date = Date(), weekStartDay: String) -> (start: String, end: String) { iTuDomain.iTuCalendarSupport.weekRange(containing: date, weekStartDay: weekStartDay) }
}

typealias JournalNoteModel = iTuDomain.JournalNoteModel
typealias JournalWeeklyReviewModel = iTuDomain.JournalWeeklyReviewModel
typealias JournalDailyReviewModel = iTuDomain.JournalDailyReviewModel
typealias JournalTagModel = iTuDomain.JournalTagModel
typealias JournalAttachmentModel = iTuDomain.JournalAttachmentModel
typealias JournalEntryRevisionModel = iTuDomain.JournalEntryRevisionModel
typealias JournalTemplateModel = iTuDomain.JournalTemplateModel
typealias JournalPreferencesModel = iTuDomain.JournalPreferencesModel
typealias JournalPendingAttachment = iTuDomain.JournalPendingAttachment
