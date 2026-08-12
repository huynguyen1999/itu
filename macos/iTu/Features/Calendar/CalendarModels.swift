import Foundation

struct CalendarTimelineResponse: Decodable, Sendable {
    let items: [CalendarTimelineItem]
}

struct CalendarTimelineItem: Decodable, Identifiable, Sendable {
    let id: String
    let kind: String
    let title: String
    let startAt: String
    let endAt: String?
    let readOnly: Bool
    let allDay: Bool
    let dueAt: String?
    let sourceId: String?
    let sourceName: String?
    let color: String?
    let status: String?
    let taskId: String?
    let priority: String?
    let description: String?
    let location: String?
    let timeZone: String?

    private enum CodingKeys: String, CodingKey {
        case id, kind, title, startAt, endAt, readOnly, allDay, dueAt, sourceId, sourceName, color, status, taskId, priority, description, location, timeZone
    }

    init(
        id: String,
        kind: String,
        title: String,
        startAt: String,
        endAt: String? = nil,
        readOnly: Bool = true,
        allDay: Bool? = nil,
        dueAt: String? = nil,
        sourceId: String? = nil,
        sourceName: String? = nil,
        color: String? = nil,
        status: String? = nil,
        taskId: String? = nil,
        priority: String? = nil,
        description: String? = nil,
        location: String? = nil,
        timeZone: String? = nil
    ) {
        self.id = id; self.kind = kind; self.title = title; self.startAt = startAt; self.endAt = endAt
        self.readOnly = readOnly; self.allDay = allDay ?? (kind == "TASK_DUE"); self.dueAt = dueAt
        self.sourceId = sourceId; self.sourceName = sourceName; self.color = color; self.status = status; self.taskId = taskId; self.priority = priority
        self.description = description; self.location = location; self.timeZone = timeZone
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        kind = try values.decode(String.self, forKey: .kind)
        title = try values.decode(String.self, forKey: .title)
        startAt = try values.decode(String.self, forKey: .startAt)
        endAt = try values.decodeIfPresent(String.self, forKey: .endAt)
        readOnly = try values.decodeIfPresent(Bool.self, forKey: .readOnly) ?? true
        allDay = try values.decodeIfPresent(Bool.self, forKey: .allDay) ?? (kind == "TASK_DUE")
        dueAt = try values.decodeIfPresent(String.self, forKey: .dueAt)
        sourceId = try values.decodeIfPresent(String.self, forKey: .sourceId)
        sourceName = try values.decodeIfPresent(String.self, forKey: .sourceName)
        color = try values.decodeIfPresent(String.self, forKey: .color)
        status = try values.decodeIfPresent(String.self, forKey: .status)
        taskId = try values.decodeIfPresent(String.self, forKey: .taskId)
        priority = try values.decodeIfPresent(String.self, forKey: .priority)
        description = try values.decodeIfPresent(String.self, forKey: .description)
        location = try values.decodeIfPresent(String.self, forKey: .location)
        timeZone = try values.decodeIfPresent(String.self, forKey: .timeZone)
    }
}

struct CalendarPreferencesModel: Codable, Equatable, Sendable {
    var zoom: String = "WEEK"
    var visibleKinds: [String] = ["TASK_DURATION", "TASK_DUE", "FOCUS_SESSION", "EXTERNAL_EVENT"]
    var showCompleted = true
    var collapsedGroupIds: [String] = []
}
