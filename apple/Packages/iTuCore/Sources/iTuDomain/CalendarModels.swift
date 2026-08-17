import Foundation

public struct CalendarTimelineResponse: Decodable, Sendable {
    public let items: [CalendarTimelineItem]
    public init(items: [CalendarTimelineItem]) { self.items = items }
}

public struct CalendarTimelineItem: Decodable, Identifiable, Sendable {
    public let id: String
    public let kind: String
    public let title: String
    public let startAt: String
    public let endAt: String?
    public let readOnly: Bool
    public let allDay: Bool
    public let dueAt: String?
    public let sourceId: String?
    public let sourceName: String?
    public let color: String?
    public let status: String?
    public let taskId: String?
    public let priority: String?
    public let description: String?
    public let location: String?
    public let timeZone: String?

    private enum CodingKeys: String, CodingKey { case id, kind, title, startAt, endAt, readOnly, allDay, dueAt, sourceId, sourceName, color, status, taskId, priority, description, location, timeZone }

    public init(id: String, kind: String, title: String, startAt: String, endAt: String? = nil, readOnly: Bool = true, allDay: Bool? = nil, dueAt: String? = nil, sourceId: String? = nil, sourceName: String? = nil, color: String? = nil, status: String? = nil, taskId: String? = nil, priority: String? = nil, description: String? = nil, location: String? = nil, timeZone: String? = nil) {
        self.id = id; self.kind = kind; self.title = title; self.startAt = startAt; self.endAt = endAt; self.readOnly = readOnly; self.allDay = allDay ?? (kind == "TASK_DUE"); self.dueAt = dueAt; self.sourceId = sourceId; self.sourceName = sourceName; self.color = color; self.status = status; self.taskId = taskId; self.priority = priority; self.description = description; self.location = location; self.timeZone = timeZone
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id); kind = try values.decode(String.self, forKey: .kind); title = try values.decode(String.self, forKey: .title); startAt = try values.decode(String.self, forKey: .startAt)
        endAt = try values.decodeIfPresent(String.self, forKey: .endAt); readOnly = try values.decodeIfPresent(Bool.self, forKey: .readOnly) ?? true; allDay = try values.decodeIfPresent(Bool.self, forKey: .allDay) ?? (kind == "TASK_DUE"); dueAt = try values.decodeIfPresent(String.self, forKey: .dueAt)
        sourceId = try values.decodeIfPresent(String.self, forKey: .sourceId); sourceName = try values.decodeIfPresent(String.self, forKey: .sourceName); color = try values.decodeIfPresent(String.self, forKey: .color); status = try values.decodeIfPresent(String.self, forKey: .status); taskId = try values.decodeIfPresent(String.self, forKey: .taskId); priority = try values.decodeIfPresent(String.self, forKey: .priority); description = try values.decodeIfPresent(String.self, forKey: .description); location = try values.decodeIfPresent(String.self, forKey: .location); timeZone = try values.decodeIfPresent(String.self, forKey: .timeZone)
    }
}

public struct ExternalCalendarModel: Codable, Identifiable, Sendable, Hashable {
    public let id: String; public let provider: String; public let name: String; public let url: String?; public let color: String; public let visible: Bool; public let lastSuccessfulSyncAt: String?; public let lastError: String?
    public init(id: String, provider: String, name: String, url: String?, color: String, visible: Bool, lastSuccessfulSyncAt: String?, lastError: String?) { self.id = id; self.provider = provider; self.name = name; self.url = url; self.color = color; self.visible = visible; self.lastSuccessfulSyncAt = lastSuccessfulSyncAt; self.lastError = lastError }
}

public struct CalendarPreferencesModel: Codable, Equatable, Sendable {
    public var zoom: String = "WEEK"
    public var visibleKinds: [String] = ["TASK_DURATION", "TASK_DUE", "FOCUS_SESSION", "EXTERNAL_EVENT"]
    public var showCompleted = false
    public var collapsedGroupIds: [String] = []
    public var weekStart: String = "MONDAY"

    public init(zoom: String = "WEEK", visibleKinds: [String] = ["TASK_DURATION", "TASK_DUE", "FOCUS_SESSION", "EXTERNAL_EVENT"], showCompleted: Bool = false, collapsedGroupIds: [String] = [], weekStart: String = "MONDAY") { self.zoom = zoom; self.visibleKinds = visibleKinds; self.showCompleted = showCompleted; self.collapsedGroupIds = collapsedGroupIds; self.weekStart = weekStart }

    private enum CodingKeys: String, CodingKey { case zoom, visibleKinds, showCompleted, collapsedGroupIds, weekStart }
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        zoom = try container.decodeIfPresent(String.self, forKey: .zoom) ?? "WEEK"; visibleKinds = try container.decodeIfPresent([String].self, forKey: .visibleKinds) ?? ["TASK_DURATION", "TASK_DUE", "FOCUS_SESSION", "EXTERNAL_EVENT"]; showCompleted = try container.decodeIfPresent(Bool.self, forKey: .showCompleted) ?? false; collapsedGroupIds = try container.decodeIfPresent([String].self, forKey: .collapsedGroupIds) ?? []; weekStart = try container.decodeIfPresent(String.self, forKey: .weekStart) ?? "MONDAY"
    }
}
