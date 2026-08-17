import Foundation

public enum TaskPriority: String, Codable, CaseIterable, Sendable {
    case none = "NONE"
    case low = "LOW"
    case medium = "MEDIUM"
    case high = "HIGH"
}

public enum TaskStatus: String, Codable, CaseIterable, Sendable {
    case inbox = "INBOX"
    case planned = "PLANNED"
    case inProgress = "IN_PROGRESS"
    case completed = "COMPLETED"
    case canceled = "CANCELED"
    case archived = "ARCHIVED"

    public var displayName: String {
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

public struct ProductivityTask: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var taskListId: String?
    public var projectId: String?
    public var sectionId: String?
    public var parentId: String?
    public var title: String
    public var descriptionMarkdown: String
    public var priority: TaskPriority
    public var important: Bool
    public var urgentOverride: Bool?
    public var urgent: Bool
    public var urgencyReason: String
    public var scheduledStartAt: String?
    public var scheduledEndAt: String?
    public var dueAt: String?
    public var estimatedMinutes: Int?
    public var recurrenceRule: String?
    public var reminders: [TaskReminderModel]?
    public var status: TaskStatus
    public var sortOrder: Double
    public var completedAt: String?
    public var deletedAt: String?
    public var createdAt: String?
    public var updatedAt: String?
    public var version: Int

    public init(
        id: String,
        taskListId: String?,
        projectId: String? = nil,
        sectionId: String? = nil,
        parentId: String? = nil,
        title: String,
        descriptionMarkdown: String,
        priority: TaskPriority,
        important: Bool,
        urgentOverride: Bool? = nil,
        urgent: Bool,
        urgencyReason: String,
        scheduledStartAt: String? = nil,
        scheduledEndAt: String? = nil,
        dueAt: String? = nil,
        estimatedMinutes: Int? = nil,
        recurrenceRule: String? = nil,
        reminders: [TaskReminderModel]? = nil,
        status: TaskStatus,
        sortOrder: Double,
        completedAt: String? = nil,
        deletedAt: String? = nil,
        createdAt: String? = nil,
        updatedAt: String? = nil,
        version: Int
    ) {
        self.id = id; self.taskListId = taskListId; self.projectId = projectId; self.sectionId = sectionId; self.parentId = parentId
        self.title = title; self.descriptionMarkdown = descriptionMarkdown; self.priority = priority; self.important = important
        self.urgentOverride = urgentOverride; self.urgent = urgent; self.urgencyReason = urgencyReason
        self.scheduledStartAt = scheduledStartAt; self.scheduledEndAt = scheduledEndAt; self.dueAt = dueAt
        self.estimatedMinutes = estimatedMinutes; self.recurrenceRule = recurrenceRule; self.reminders = reminders
        self.status = status; self.sortOrder = sortOrder; self.completedAt = completedAt; self.deletedAt = deletedAt
        self.createdAt = createdAt; self.updatedAt = updatedAt; self.version = version
    }

    public static func optimistic(
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

    public init(from decoder: Decoder) throws {
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

    private enum CodingKeys: String, CodingKey {
        case id, taskListId, projectId, sectionId, parentId, title, descriptionMarkdown, priority, important, urgentOverride, urgent, urgencyReason
        case scheduledStartAt, scheduledEndAt, dueAt, estimatedMinutes, recurrenceRule, reminders, status, sortOrder, completedAt, deletedAt, createdAt, updatedAt, version
    }
}

public struct TaskEdits: Sendable {
    public let title: String
    public let descriptionMarkdown: String
    public let priority: TaskPriority
    public let important: Bool
    public let dueAt: String?
    public let scheduledStartAt: String?
    public let scheduledEndAt: String?
    public let estimatedMinutes: Int?
    public let recurrenceRule: String?
    public var taskListId: String?
    public var changesTaskListId: Bool
    public var sectionId: String?
    public var tagIds: [String]

    public init(
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
        self.title = title; self.descriptionMarkdown = descriptionMarkdown; self.priority = priority; self.important = important
        self.dueAt = dueAt; self.scheduledStartAt = scheduledStartAt; self.scheduledEndAt = scheduledEndAt; self.estimatedMinutes = estimatedMinutes
        self.recurrenceRule = recurrenceRule; self.taskListId = taskListId; self.changesTaskListId = changesTaskListId; self.sectionId = sectionId; self.tagIds = tagIds
    }
}

public struct UserProfile: Codable, Equatable, Sendable {
    public let id: String
    public let email: String?
    public let username: String?
    public let displayName: String?
    public let avatarUrl: String?
    public let roles: [String]
    public let permissions: [String]

    public init(id: String, email: String?, username: String?, displayName: String?, avatarUrl: String?, roles: [String], permissions: [String]) {
        self.id = id; self.email = email; self.username = username; self.displayName = displayName; self.avatarUrl = avatarUrl; self.roles = roles; self.permissions = permissions
    }

    public var accountLabel: String { displayName ?? email ?? username ?? "iTu user" }
}

public struct AuthSession: Codable, Sendable {
    public let user: UserProfile
    public let accessToken: String
    public let refreshToken: String
    public init(user: UserProfile, accessToken: String, refreshToken: String) { self.user = user; self.accessToken = accessToken; self.refreshToken = refreshToken }
}

public struct TaskListModel: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var name: String
    public var description: String?
    public var icon: String?
    public var color: String?
    public var taskCount: Int
    public var isDefault: Bool
    public var version: Int

    public init(id: String, name: String, description: String? = nil, icon: String? = nil, color: String? = nil, taskCount: Int = 0, isDefault: Bool = false, version: Int = 1) {
        self.id = id; self.name = name; self.description = description; self.icon = icon; self.color = color; self.taskCount = taskCount; self.isDefault = isDefault; self.version = version
    }

    private enum CodingKeys: String, CodingKey { case id, title, name, description, icon, color, taskCount, tasksCount, isDefault, version }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        name = try values.decodeIfPresent(String.self, forKey: .name) ?? values.decodeIfPresent(String.self, forKey: .title) ?? "Untitled list"
        description = try values.decodeIfPresent(String.self, forKey: .description)
        icon = try values.decodeIfPresent(String.self, forKey: .icon)
        color = try values.decodeIfPresent(String.self, forKey: .color)
        taskCount = try values.decodeIfPresent(Int.self, forKey: .taskCount) ?? values.decodeIfPresent(Int.self, forKey: .tasksCount) ?? 0
        isDefault = try values.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
        version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id); try container.encode(name, forKey: .title)
        try container.encodeIfPresent(description, forKey: .description); try container.encodeIfPresent(icon, forKey: .icon); try container.encodeIfPresent(color, forKey: .color)
        try container.encode(taskCount, forKey: .taskCount); try container.encode(isDefault, forKey: .isDefault); try container.encode(version, forKey: .version)
    }
}

public struct TagModel: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var name: String
    public var color: String?
    public var taskCount: Int
    public init(id: String, name: String, color: String?, taskCount: Int) { self.id = id; self.name = name; self.color = color; self.taskCount = taskCount }
}

public struct TaskSectionModel: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var title: String
    public var taskListId: String?
    public var sortOrder: Double
    public var version: Int
    public init(id: String, title: String, taskListId: String?, sortOrder: Double, version: Int) { self.id = id; self.title = title; self.taskListId = taskListId; self.sortOrder = sortOrder; self.version = version }
}

public struct TaskMetadataDTO: Codable, Sendable {
    public let id: String
    public let sectionId: String?
    public let tags: [TaskTagAssignmentDTO]
    public init(id: String, sectionId: String?, tags: [TaskTagAssignmentDTO]) { self.id = id; self.sectionId = sectionId; self.tags = tags }
}

public struct TaskTagAssignmentDTO: Codable, Sendable {
    public let tag: TaskTagDTO
    public init(tag: TaskTagDTO) { self.tag = tag }
}

public struct TaskTagDTO: Codable, Sendable {
    public let id: String
    public init(id: String) { self.id = id }
}

public struct AppNotificationModel: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public let reminderId: String?
    public let habitReminderDeliveryId: String?
    public let habitId: String?
    public let habitLocalDate: String?
    public let habitTargetType: String?
    public let title: String
    public let body: String
    public let actionUrl: String
    public var readAt: String?
    public let createdAt: String
    public init(id: String, reminderId: String?, habitReminderDeliveryId: String?, habitId: String?, habitLocalDate: String?, habitTargetType: String?, title: String, body: String, actionUrl: String, readAt: String?, createdAt: String) {
        self.id = id; self.reminderId = reminderId; self.habitReminderDeliveryId = habitReminderDeliveryId; self.habitId = habitId; self.habitLocalDate = habitLocalDate; self.habitTargetType = habitTargetType; self.title = title; self.body = body; self.actionUrl = actionUrl; self.readAt = readAt; self.createdAt = createdAt
    }
}

public struct TaskReminderModel: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public let remindAt: String
    public let status: String
    public let persistent: Bool
    public init(id: String, remindAt: String, status: String, persistent: Bool) { self.id = id; self.remindAt = remindAt; self.status = status; self.persistent = persistent }
}

public enum iTuDateSupport {
    public static let iso8601 = Date.ISO8601FormatStyle()
    public static let iso8601Fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    public static let day = Date.VerbatimFormatStyle(format: "\(year: .defaultDigits)-\(month: .twoDigits)-\(day: .twoDigits)", locale: Locale(identifier: "en_US_POSIX"), timeZone: .current, calendar: Calendar(identifier: .gregorian))
    public static let dayParser = Date.ParseStrategy(format: "\(year: .defaultDigits)-\(month: .twoDigits)-\(day: .twoDigits)", locale: Locale(identifier: "en_US_POSIX"), timeZone: .current, calendar: Calendar(identifier: .gregorian))
    public static let focusDayStyle = Date.FormatStyle().month(.abbreviated).day().year()
    public static let dueDay = Date.VerbatimFormatStyle(format: "\(day: .twoDigits) \(month: .abbreviated)", locale: Locale(identifier: "en_US_POSIX"), timeZone: .current, calendar: .current)
    public static let time = Date.VerbatimFormatStyle(format: "\(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits)", locale: .current, timeZone: .current, calendar: .current)

    public static func parse(_ value: String) -> Date? {
        if value.count == 10 { return (try? Date(value, strategy: dayParser)) ?? (try? iso8601.parse(value)) }
        if value.contains(".") { return (try? iso8601Fractional.parse(value)) ?? (try? iso8601.parse(value)) }
        return (try? iso8601.parse(value)) ?? (try? iso8601Fractional.parse(value)) ?? (try? Date(value, strategy: dayParser))
    }

    public static func calendarDayDifference(from: Date, to: Date) -> Int {
        let calendar = Calendar.current
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: from), to: calendar.startOfDay(for: to)).day ?? 0
    }

    public static func string(from date: Date) -> String { iso8601.format(date) }

    public static func localDayString(from value: String) -> String {
        guard let date = parse(value) else { return String(value.prefix(10)) }
        return date.formatted(day)
    }
}
