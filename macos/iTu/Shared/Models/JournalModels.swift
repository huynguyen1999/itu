import Foundation

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

/// Product-local calendar rules for Journal and month-based features.
enum iTuCalendarSupport {
    static let timezone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

    static func calendar(firstWeekday: Int? = nil) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timezone
        if let firstWeekday { calendar.firstWeekday = firstWeekday }
        return calendar
    }

    static func dayString(_ date: Date = Date()) -> String {
        let components = calendar().dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }

    static func monthString(_ date: Date = Date()) -> String {
        let components = calendar().dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", components.year ?? 0, components.month ?? 0)
    }

    static func weekRange(containing date: Date = Date(), weekStartDay: String) -> (start: String, end: String) {
        let cal = calendar(firstWeekday: weekStartDay.uppercased() == "SUNDAY" ? 1 : 2)
        let day = cal.startOfDay(for: date)
        let weekday = cal.component(.weekday, from: day)
        let offset = (weekday - cal.firstWeekday + 7) % 7
        let start = cal.date(byAdding: .day, value: -offset, to: day) ?? day
        let end = cal.date(byAdding: .day, value: 6, to: start) ?? start
        return (dayString(start), dayString(end))
    }
}

/// Journal uses strings for dates so an offline snapshot remains portable
/// across time zones and can round-trip the REST representation unchanged.
struct JournalNoteModel: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let userId: String
    let kind: String
    var title: String
    var contentMarkdown: String
    var entryDate: String
    var timezone: String
    var templateId: String?
    var tagIds: [String]
    var version: Int
    let createdAt: String
    var updatedAt: String
    var deletedAt: String?
    var deletedByDeviceId: String?
    var weeklyReview: JournalWeeklyReviewModel?
    var dailyReview: JournalDailyReviewModel?
    var tags: [JournalTagModel]
    var attachments: [JournalAttachmentModel]

    init(
        id: String, userId: String, kind: String = "NOTE", title: String,
        contentMarkdown: String, entryDate: String, updatedAt: String,
        timezone: String = iTuCalendarSupport.timezone.identifier, templateId: String? = nil, tagIds: [String] = [],
        version: Int = 1, createdAt: String? = nil, deletedAt: String? = nil, deletedByDeviceId: String? = nil,
        weeklyReview: JournalWeeklyReviewModel? = nil, dailyReview: JournalDailyReviewModel? = nil, tags: [JournalTagModel] = [],
        attachments: [JournalAttachmentModel] = []
    ) {
        self.id = id; self.userId = userId; self.kind = kind; self.title = title
        self.contentMarkdown = contentMarkdown; self.entryDate = entryDate
        self.timezone = timezone; self.templateId = templateId; self.tagIds = tagIds
        self.version = version; self.createdAt = createdAt ?? updatedAt
        self.updatedAt = updatedAt; self.deletedAt = deletedAt; self.deletedByDeviceId = deletedByDeviceId
        self.weeklyReview = weeklyReview; self.dailyReview = dailyReview; self.tags = tags; self.attachments = attachments
    }

    var previewText: String {
        let plainText = contentMarkdown
            .replacingOccurrences(of: "#", with: "")
            .replacingOccurrences(of: "*", with: "")
            .replacingOccurrences(of: "`", with: "")
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return plainText.isEmpty ? "An empty page, ready for the next line." : plainText
    }

    var displayDate: String { String(entryDate.prefix(10)) }

    private enum CodingKeys: String, CodingKey {
        case id, userId, kind, title, contentMarkdown, entryDate, timezone, templateId,
             tagIds, version, createdAt, updatedAt, deletedAt, deletedByDeviceId, weeklyReview, dailyReview, tags, attachments
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        userId = try values.decodeIfPresent(String.self, forKey: .userId) ?? "local"
        kind = try values.decodeIfPresent(String.self, forKey: .kind) ?? "NOTE"
        title = try values.decodeIfPresent(String.self, forKey: .title) ?? ""
        contentMarkdown = try values.decodeIfPresent(String.self, forKey: .contentMarkdown) ?? ""
        entryDate = try values.decodeIfPresent(String.self, forKey: .entryDate) ?? ""
        timezone = try values.decodeIfPresent(String.self, forKey: .timezone) ?? iTuCalendarSupport.timezone.identifier
        templateId = try values.decodeIfPresent(String.self, forKey: .templateId)
        tagIds = try values.decodeIfPresent([String].self, forKey: .tagIds) ?? []
        version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1
        createdAt = try values.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        updatedAt = try values.decodeIfPresent(String.self, forKey: .updatedAt) ?? createdAt
        deletedAt = try values.decodeIfPresent(String.self, forKey: .deletedAt)
        deletedByDeviceId = try values.decodeIfPresent(String.self, forKey: .deletedByDeviceId)
        weeklyReview = try values.decodeIfPresent(JournalWeeklyReviewModel.self, forKey: .weeklyReview)
        dailyReview = try values.decodeIfPresent(JournalDailyReviewModel.self, forKey: .dailyReview)
        tags = try values.decodeIfPresent([JournalTagModel].self, forKey: .tags) ?? []
        attachments = try values.decodeIfPresent([JournalAttachmentModel].self, forKey: .attachments) ?? []
    }
}

struct JournalWeeklyReviewModel: Codable, Sendable, Equatable {
    let entryId: String
    var periodStart: String
    var periodEnd: String
    var summarySnapshot: [String: JSONValue]
    var wentWellMarkdown: String?
    var frictionMarkdown: String?
    var learnedMarkdown: String? = nil
    var differentFromLastWeekMarkdown: String? = nil
    var nextWeekMarkdown: String?
    var experimentSnapshot: JSONValue?
    var comparisonSnapshot: JSONValue? = nil
    var aiInsightsSnapshot: JSONValue? = nil
    var aiGenerationJobId: String? = nil
    var aiGeneratedAt: String? = nil
    var aiPromptVersion: String? = nil
    var aiSourceEntryVersion: Int? = nil
}

struct JournalDailyReviewModel: Codable, Sendable, Equatable {
    let entryId: String
    var periodDate: String
    var summarySnapshot: [String: JSONValue]
    var wentWellMarkdown: String?
    var frictionMarkdown: String?
    var learnedMarkdown: String?
    var contextMarkdown: String?
    var aiInsightsSnapshot: JSONValue?
    var aiGenerationJobId: String?
    var aiGeneratedAt: String?
    var aiPromptVersion: String?
    var aiSourceEntryVersion: Int?
}

struct JournalTagModel: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let userId: String
    var name: String
    var color: String
    let createdAt: String
    var updatedAt: String
}

struct JournalAttachmentModel: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let userId: String
    let entryId: String
    var fileName: String
    var mimeType: String
    var sizeBytes: Int
    var storageKey: String
    var url: String?
    let createdAt: String
    var deletedAt: String?
}

struct JournalEntryRevisionModel: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let entryId: String
    let revisionNumber: Int
    let snapshot: [String: JSONValue]
    let mutationId: String?
    let deviceId: String?
    let createdAt: String
}

struct JournalTemplateModel: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let userId: String
    var name: String
    var entryKind: String
    var titleTemplate: String
    var bodyMarkdown: String
    var defaults: [String: JSONValue]
    var builtIn: Bool
    var archivedAt: String?
    var version: Int
    let createdAt: String
    var updatedAt: String
}

struct JournalPreferencesModel: Codable, Sendable, Equatable {
    var defaultEditorMode: String = "LIVE"
    var autoCreateDailyNote: Bool = true
    var autoOpenTodayNote: Bool = true
    var weekStartDay: String = "MONDAY"
    var autoCreateWeeklyReview: Bool = true
}

struct JournalPendingAttachment: Codable, Sendable, Equatable {
    let entryId: String
    let fileName: String
    let mimeType: String
}
