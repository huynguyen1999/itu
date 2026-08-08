import Foundation

enum TaskPriority: String, Codable, CaseIterable, Sendable {
    case none = "NONE"
    case low = "LOW"
    case medium = "MEDIUM"
    case high = "HIGH"
}

enum TaskStatus: String, Codable, CaseIterable, Sendable {
    case inbox = "INBOX"
    case planned = "PLANNED"
    case inProgress = "IN_PROGRESS"
    case completed = "COMPLETED"
    case canceled = "CANCELED"
    case archived = "ARCHIVED"

    var displayName: String {
        switch self {
        case .inbox: "Inbox"
        case .planned: "Planned"
        case .inProgress: "In Progress"
        case .completed: "Completed"
        case .canceled: "Abandoned"
        case .archived: "Archived"
        }
    }
}

struct ProductivityTask: Codable, Identifiable, Equatable, Sendable {
    let id: String
    var taskListId: String?
    var projectId: String?
    var sectionId: String?
    var parentId: String?
    var title: String
    var descriptionMarkdown: String
    var priority: TaskPriority
    var important: Bool
    var urgentOverride: Bool?
    var urgent: Bool
    var urgencyReason: String
    var scheduledStartAt: String?
    var scheduledEndAt: String?
    var dueAt: String?
    var estimatedMinutes: Int?
    var recurrenceRule: String?
    var reminders: [TaskReminderModel]?
    var status: TaskStatus
    var sortOrder: Double
    var completedAt: String?
    var deletedAt: String?
    var createdAt: String?
    var updatedAt: String?
    var version: Int

    static func optimistic(
        id: String,
        title: String,
        descriptionMarkdown: String = "",
        priority: TaskPriority = .none,
        dueAt: String? = nil,
        taskListId: String? = nil,
        parentId: String? = nil,
        important: Bool = false,
        urgentOverride: Bool? = nil
    ) -> ProductivityTask {
        let now = ISO8601DateFormatter().string(from: Date())
        return ProductivityTask(
            id: id,
            taskListId: taskListId,
            parentId: parentId,
            title: title,
            descriptionMarkdown: descriptionMarkdown,
            priority: priority,
            important: important,
            urgentOverride: urgentOverride,
            urgent: urgentOverride ?? (priority == .high),
            urgencyReason: urgentOverride == nil ? "Pending synchronization" : "Set on this Mac",
            dueAt: dueAt,
            status: .inbox,
            sortOrder: Date().timeIntervalSince1970,
            createdAt: now,
            version: 1
        )
    }
}

extension ProductivityTask {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        taskListId = try container.decodeIfPresent(String.self, forKey: .taskListId)
        projectId = try container.decodeIfPresent(String.self, forKey: .projectId)
        sectionId = try container.decodeIfPresent(String.self, forKey: .sectionId)
        parentId = try container.decodeIfPresent(String.self, forKey: .parentId)
        title = try container.decode(String.self, forKey: .title)
        descriptionMarkdown = try container.decodeIfPresent(String.self, forKey: .descriptionMarkdown) ?? ""
        let p = try container.decodeIfPresent(TaskPriority.self, forKey: .priority) ?? .none
        priority = p
        important = try container.decodeIfPresent(Bool.self, forKey: .important) ?? false
        let override = try container.decodeIfPresent(Bool.self, forKey: .urgentOverride)
        urgentOverride = override
        urgent = try container.decodeIfPresent(Bool.self, forKey: .urgent) ?? (override ?? (p == .high))
        urgencyReason = try container.decodeIfPresent(String.self, forKey: .urgencyReason)
            ?? (override == true ? "Urgent (Override)" : (p == .high ? "High Priority" : "Normal Priority"))
        scheduledStartAt = try container.decodeIfPresent(String.self, forKey: .scheduledStartAt)
        scheduledEndAt = try container.decodeIfPresent(String.self, forKey: .scheduledEndAt)
        dueAt = try container.decodeIfPresent(String.self, forKey: .dueAt)
        estimatedMinutes = try container.decodeIfPresent(Int.self, forKey: .estimatedMinutes)
        recurrenceRule = try container.decodeIfPresent(String.self, forKey: .recurrenceRule)
        reminders = try container.decodeIfPresent([TaskReminderModel].self, forKey: .reminders)
        status = try container.decodeIfPresent(TaskStatus.self, forKey: .status) ?? .inbox
        sortOrder = try container.decodeIfPresent(Double.self, forKey: .sortOrder) ?? 0
        completedAt = try container.decodeIfPresent(String.self, forKey: .completedAt)
        deletedAt = try container.decodeIfPresent(String.self, forKey: .deletedAt)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
    }
}

struct TaskEdits: Sendable {
    let title: String
    let descriptionMarkdown: String
    let priority: TaskPriority
    let important: Bool
    let dueAt: String?
    let scheduledStartAt: String?
    let scheduledEndAt: String?
    let estimatedMinutes: Int?
    let recurrenceRule: String?
    var taskListId: String? = nil
    var changesTaskListId: Bool = false
    var sectionId: String? = nil
    var tagIds: [String] = []

    init(
        title: String,
        descriptionMarkdown: String,
        priority: TaskPriority,
        important: Bool,
        dueAt: String?,
        estimatedMinutes: Int?,
        scheduledStartAt: String? = nil,
        scheduledEndAt: String? = nil,
        recurrenceRule: String? = nil,
        taskListId: String? = nil,
        changesTaskListId: Bool = false,
        sectionId: String? = nil,
        tagIds: [String] = []
    ) {
        self.title = title
        self.descriptionMarkdown = descriptionMarkdown
        self.priority = priority
        self.important = important
        self.dueAt = dueAt
        self.scheduledStartAt = scheduledStartAt
        self.scheduledEndAt = scheduledEndAt
        self.estimatedMinutes = estimatedMinutes
        self.recurrenceRule = recurrenceRule
        self.taskListId = taskListId
        self.changesTaskListId = changesTaskListId
        self.sectionId = sectionId
        self.tagIds = tagIds
    }
}

struct UserProfile: Codable, Equatable, Sendable {
    let id: String
    let email: String?
    let username: String?
    let displayName: String?
    let avatarUrl: String?
    let roles: [String]
    let permissions: [String]

    var accountLabel: String {
        displayName ?? email ?? username ?? "iTu user"
    }
}

struct AuthSession: Codable, Sendable {
    let user: UserProfile
    let accessToken: String
    let refreshToken: String
}

struct TaskListModel: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var name: String
    var description: String?
    var icon: String?
    var color: String?
    var taskCount: Int
    var isDefault: Bool
    var version: Int

    private enum CodingKeys: String, CodingKey {
        case id
        case title
        case name
        case description
        case icon
        case color
        case taskCount
        case tasksCount
        case isDefault
        case version
    }

    init(
        id: String,
        name: String,
        description: String? = nil,
        icon: String? = nil,
        color: String? = nil,
        taskCount: Int = 0,
        isDefault: Bool = false,
        version: Int = 1
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.icon = icon
        self.color = color
        self.taskCount = taskCount
        self.isDefault = isDefault
        self.version = version
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        name = try values.decodeIfPresent(String.self, forKey: .name)
            ?? values.decodeIfPresent(String.self, forKey: .title)
            ?? "Untitled list"
        description = try values.decodeIfPresent(String.self, forKey: .description)
        icon = try values.decodeIfPresent(String.self, forKey: .icon)
        color = try values.decodeIfPresent(String.self, forKey: .color)
        taskCount = try values.decodeIfPresent(Int.self, forKey: .taskCount)
            ?? values.decodeIfPresent(Int.self, forKey: .tasksCount)
            ?? 0
        isDefault = try values.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
        version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .title)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(icon, forKey: .icon)
        try container.encodeIfPresent(color, forKey: .color)
        try container.encode(taskCount, forKey: .taskCount)
        try container.encode(isDefault, forKey: .isDefault)
        try container.encode(version, forKey: .version)
    }
}

struct TagModel: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var name: String
    var color: String?
    var taskCount: Int
}

struct TaskSectionModel: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var title: String
    var taskListId: String?
    var sortOrder: Double
    var version: Int
}

struct TaskMetadataDTO: Codable, Sendable {
    let id: String
    let sectionId: String?
    let tags: [TaskTagAssignmentDTO]
}

struct TaskTagAssignmentDTO: Codable, Sendable {
    let tag: TaskTagDTO
}

struct TaskTagDTO: Codable, Sendable {
    let id: String
}

struct AppNotificationModel: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let reminderId: String
    let title: String
    let body: String
    let actionUrl: String
    var readAt: String?
    let createdAt: String
}

struct TaskReminderModel: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let remindAt: String
    let status: String
    let persistent: Bool
}

/// Shared, allocation-free date parsing for API timestamps used by screen projections.
enum iTuDateSupport {
    static let iso8601 = Date.ISO8601FormatStyle()
    static let iso8601Fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    static let day = Date.VerbatimFormatStyle(
        format: "\(year: .defaultDigits)-\(month: .twoDigits)-\(day: .twoDigits)",
        locale: Locale(identifier: "en_US_POSIX"),
        timeZone: .current,
        calendar: Calendar(identifier: .gregorian)
    )
    static let dayParser = Date.ParseStrategy(
        format: "\(year: .defaultDigits)-\(month: .twoDigits)-\(day: .twoDigits)",
        locale: Locale(identifier: "en_US_POSIX"),
        timeZone: .current,
        calendar: Calendar(identifier: .gregorian)
    )
    static let focusDayStyle = Date.FormatStyle().month(.abbreviated).day().year()
    static let dueDay = Date.VerbatimFormatStyle(
        format: "\(day: .twoDigits) \(month: .abbreviated)",
        locale: Locale(identifier: "en_US_POSIX"),
        timeZone: .current,
        calendar: .current
    )
    static let time = Date.VerbatimFormatStyle(
        format: "\(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits)",
        locale: .current,
        timeZone: .current,
        calendar: .current
    )

    static func parse(_ value: String) -> Date? {
        (try? iso8601Fractional.parse(value))
            ?? (try? iso8601.parse(value))
            ?? (try? Date(value, strategy: dayParser))
    }

    static func string(from date: Date) -> String {
        iso8601.format(date)
    }

    static func localDayString(from value: String) -> String {
        guard let date = parse(value) else { return String(value.prefix(10)) }
        return date.formatted(day)
    }
}
