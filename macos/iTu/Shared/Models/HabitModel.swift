import Foundation

enum HabitFrequency: String, Codable, CaseIterable, Sendable {
    case daily = "DAILY"
    case weekly = "WEEKLY"
    case custom = "CUSTOM"
}

enum HabitDirection: String, Codable, CaseIterable, Sendable {
    case build = "BUILD"
    case limit = "LIMIT"
}

enum HabitOccurrenceStatus: String, Codable, Sendable {
    case pending = "PENDING"
    case completed = "COMPLETED"
    case failed = "FAILED"
    case skipped = "SKIPPED"
}

enum HabitProjectedStatus: String, Codable, Sendable {
    case completed = "COMPLETED"
    case partial = "PARTIAL"
    case pending = "PENDING"
    case missed = "MISSED"
    case skipped = "SKIPPED"
    case failed = "FAILED"
    case rest = "REST"
    case notScheduled = "NOT_SCHEDULED"
}

struct HabitPreferencesModel: Codable, Equatable, Sendable {
    var dayRolloverCutoffHour: Int = 4
    var weekStartDay: String = "MONDAY"
}

struct HabitDayStateModel: Codable, Identifiable, Equatable, Sendable {
    let habitId: String?
    let localDate: String
    let scheduled: Bool
    let status: HabitProjectedStatus
    let value: Double
    let targetValue: Double
    let progressRatio: Double
    let occurrenceId: String?
    let periodStart: String?
    let periodEnd: String?

    var id: String { "\(habitId ?? ""):\(localDate)" }
}

struct HabitCalendarResponse: Codable, Sendable {
    let from: String
    let to: String
    let days: [HabitDayStateModel]
}

struct HabitProgressResultModel: Codable, Sendable {
    let habitId: String
    let occurrenceId: String
    let localDate: String
    let status: HabitOccurrenceStatus
    let value: Double
    let targetValue: Double
    let progressRatio: Double
    let growthReceipt: GrowthAwardReceipt?
}

struct HabitQuickLogRequest: Identifiable, Equatable, Sendable {
    let habitId: String
    let localDate: String

    var id: String { "\(habitId):\(localDate)" }
}

struct HabitProgressLogModel: Codable, Identifiable, Sendable {
    let id: String
    let occurrenceId: String
    let source: String
    let value: Double
    let recordedAt: String
}

struct HabitReminderDeliveryModel: Codable, Sendable {
    let id: String
    let status: String
    let scheduledFor: String
}

struct HabitChecklistItemModel: Codable, Identifiable, Equatable, Sendable {
    let id: String?
    var title: String
    var required: Bool
    var sortOrder: Double?
}

struct HabitOccurrenceModel: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let habitId: String
    let occurrenceDate: String
    var status: HabitOccurrenceStatus
    var value: Double
    var growthReceipt: GrowthAwardReceipt?

    var localDayString: String {
        iTuDateSupport.localDayString(from: occurrenceDate)
    }
    private enum CodingKeys: String, CodingKey {
        case id, habitId, occurrenceDate, status, habit, checkIn, progressLogs, growthReceipt
    }

    init(
        id: String,
        habitId: String,
        occurrenceDate: String,
        status: HabitOccurrenceStatus = .pending,
        value: Double = 0,
        growthReceipt: GrowthAwardReceipt? = nil
    ) {
        self.id = id
        self.habitId = habitId
        self.occurrenceDate = occurrenceDate
        self.status = status
        self.value = value
        self.growthReceipt = growthReceipt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        if let directHabitId = try container.decodeIfPresent(String.self, forKey: .habitId) {
            habitId = directHabitId
        } else {
            let habit = try container.decodeIfPresent(HabitReference.self, forKey: .habit)
            habitId = habit?.id ?? ""
        }
        occurrenceDate = try container.decode(String.self, forKey: .occurrenceDate)
        status = try container.decodeIfPresent(HabitOccurrenceStatus.self, forKey: .status) ?? .pending
        growthReceipt = try container.decodeIfPresent(GrowthAwardReceipt.self, forKey: .growthReceipt)

        if let checkIn = try container.decodeIfPresent(HabitCheckInReference.self, forKey: .checkIn) {
            value = checkIn.value
        } else {
            let logs = try container.decodeIfPresent([HabitProgressReference].self, forKey: .progressLogs) ?? []
            value = logs.reduce(0) { $0 + $1.value }
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: EncodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(habitId, forKey: .habitId)
        try container.encode(occurrenceDate, forKey: .occurrenceDate)
        try container.encode(status, forKey: .status)
        try container.encode(value, forKey: .value)
        try container.encodeIfPresent(growthReceipt, forKey: .growthReceipt)
    }

    private enum EncodingKeys: String, CodingKey {
        case id, habitId, occurrenceDate, status, value, growthReceipt
    }

    private struct HabitReference: Decodable {
        let id: String
    }

    private struct HabitCheckInReference: Decodable {
        let value: Double
    }

    private struct HabitProgressReference: Decodable {
        let value: Double
    }
}

struct HabitModel: Codable, Identifiable, Equatable, Sendable {
    let id: String
    var name: String
    var description: String?
    var icon: String
    var color: String
    var frequency: HabitFrequency
    var targetValue: Double
    var targetType: String
    var unit: String?
    var targetDaysPerWeek: Int
    var direction: HabitDirection
    var scheduleType: String
    var weekdays: [Int]
    var intervalDays: Int?
    var timesPerPeriod: Int?
    var period: String?
    var startDate: String
    var endDate: String?
    var timeBlockId: String?
    var tagIds: [String]
    var allowedSkips: Int
    var restDays: [Int]
    var reminderTimes: [String]
    var checklistItems: [HabitChecklistItemModel]
    var archivedAt: String?
    var currentStreak: Int
    var bestStreak: Int
    var isCompletedToday: Bool
    var totalCompletions: Int
    var createdAt: String
    var version: Int
    var stats: HabitStatsModel?

    enum CodingKeys: String, CodingKey {
        case id, name, title, description, icon, color, frequency, scheduleType
        case targetValue, targetType, unit, targetDaysPerWeek, direction, weekdays, archivedAt
        case intervalDays, timesPerPeriod, period, startDate, endDate
        case timeBlockId, allowedSkips, restDays, reminderTimes, reminders, checklistItems
        case tags
        case currentStreak, bestStreak
        case isCompletedToday, totalCompletions, createdAt, version, stats
    }

    init(
        id: String,
        name: String,
        description: String? = nil,
        icon: String = "repeat",
        color: String = "mint",
        frequency: HabitFrequency = .daily,
        targetValue: Double = 1,
        targetType: String = "COUNT",
        unit: String? = nil,
        targetDaysPerWeek: Int = 7,
        direction: HabitDirection = .build,
        scheduleType: String? = nil,
        weekdays: [Int] = [],
        intervalDays: Int? = nil,
        timesPerPeriod: Int? = nil,
        period: String? = nil,
        startDate: String? = nil,
        endDate: String? = nil,
        timeBlockId: String? = nil,
        tagIds: [String] = [],
        allowedSkips: Int = 0,
        restDays: [Int] = [],
        reminderTimes: [String] = [],
        checklistItems: [HabitChecklistItemModel] = [],
        archivedAt: String? = nil,
        currentStreak: Int = 0,
        bestStreak: Int = 0,
        isCompletedToday: Bool = false,
        totalCompletions: Int = 0,
        createdAt: String = ISO8601DateFormatter().string(from: Date()),
        version: Int = 1,
        stats: HabitStatsModel? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.icon = icon
        self.color = color
        self.frequency = frequency
        self.targetValue = targetValue
        self.targetType = targetType
        self.unit = unit
        self.targetDaysPerWeek = targetDaysPerWeek
        self.direction = direction
        self.scheduleType = scheduleType ?? (frequency == .weekly ? "WEEKDAYS" : "WEEKDAYS")
        self.weekdays = weekdays
        self.intervalDays = intervalDays
        self.timesPerPeriod = timesPerPeriod
        self.period = period
        self.startDate = startDate ?? createdAt
        self.endDate = endDate
        self.timeBlockId = timeBlockId
        self.tagIds = tagIds
        self.allowedSkips = allowedSkips
        self.restDays = restDays
        self.reminderTimes = reminderTimes
        self.checklistItems = checklistItems
        self.archivedAt = archivedAt
        self.currentStreak = currentStreak
        self.bestStreak = bestStreak
        self.isCompletedToday = isCompletedToday
        self.totalCompletions = totalCompletions
        self.createdAt = createdAt
        self.version = version
        self.stats = stats
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        if let decodedName = try container.decodeIfPresent(String.self, forKey: .name) {
            name = decodedName
        } else if let decodedTitle = try container.decodeIfPresent(String.self, forKey: .title) {
            name = decodedTitle
        } else {
            name = "Untitled Habit"
        }
        description = try container.decodeIfPresent(String.self, forKey: .description)
        icon = try container.decodeIfPresent(String.self, forKey: .icon) ?? "repeat"
        color = try container.decodeIfPresent(String.self, forKey: .color) ?? "mint"

        if let freq = try container.decodeIfPresent(HabitFrequency.self, forKey: .frequency) {
            frequency = freq
        } else if let sched = try container.decodeIfPresent(String.self, forKey: .scheduleType),
                  let freq = HabitFrequency(rawValue: sched.uppercased()) {
            frequency = freq
        } else {
            frequency = .daily
        }

        targetValue = try container.decodeIfPresent(Double.self, forKey: .targetValue) ?? 1
        targetType = try container.decodeIfPresent(String.self, forKey: .targetType) ?? "COUNT"
        unit = try container.decodeIfPresent(String.self, forKey: .unit)
        targetDaysPerWeek = try container.decodeIfPresent(Int.self, forKey: .targetDaysPerWeek) ?? 7
        direction = try container.decodeIfPresent(HabitDirection.self, forKey: .direction) ?? .build
        scheduleType = try container.decodeIfPresent(String.self, forKey: .scheduleType) ?? "WEEKDAYS"
        weekdays = try container.decodeIfPresent([Int].self, forKey: .weekdays) ?? []
        intervalDays = try container.decodeIfPresent(Int.self, forKey: .intervalDays)
        timesPerPeriod = try container.decodeIfPresent(Int.self, forKey: .timesPerPeriod)
        period = try container.decodeIfPresent(String.self, forKey: .period)
        startDate = try container.decodeIfPresent(String.self, forKey: .startDate)
            ?? ISO8601DateFormatter().string(from: Date())
        endDate = try container.decodeIfPresent(String.self, forKey: .endDate)
        timeBlockId = try container.decodeIfPresent(String.self, forKey: .timeBlockId)
        let tagAssignments = try container.decodeIfPresent([TaskTagAssignmentDTO].self, forKey: .tags) ?? []
        tagIds = tagAssignments.map { $0.tag.id }
        allowedSkips = try container.decodeIfPresent(Int.self, forKey: .allowedSkips) ?? 0
        restDays = try container.decodeIfPresent([Int].self, forKey: .restDays) ?? []
        if let reminders = try container.decodeIfPresent([HabitReminderReference].self, forKey: .reminders) {
            reminderTimes = reminders.map(\.timeLocal)
        } else {
            reminderTimes = try container.decodeIfPresent([String].self, forKey: .reminderTimes) ?? []
        }
        checklistItems = try container.decodeIfPresent([HabitChecklistItemModel].self, forKey: .checklistItems) ?? []
        archivedAt = try container.decodeIfPresent(String.self, forKey: .archivedAt)
        currentStreak = try container.decodeIfPresent(Int.self, forKey: .currentStreak) ?? 0
        bestStreak = try container.decodeIfPresent(Int.self, forKey: .bestStreak) ?? 0
        isCompletedToday = try container.decodeIfPresent(Bool.self, forKey: .isCompletedToday) ?? false
        totalCompletions = try container.decodeIfPresent(Int.self, forKey: .totalCompletions) ?? 0
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ISO8601DateFormatter().string(from: Date())
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        stats = try container.decodeIfPresent(HabitStatsModel.self, forKey: .stats)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(icon, forKey: .icon)
        try container.encode(color, forKey: .color)
        try container.encode(frequency, forKey: .frequency)
        try container.encode(targetValue, forKey: .targetValue)
        try container.encode(targetType, forKey: .targetType)
        try container.encodeIfPresent(unit, forKey: .unit)
        try container.encode(targetDaysPerWeek, forKey: .targetDaysPerWeek)
        try container.encode(direction, forKey: .direction)
        try container.encode(scheduleType, forKey: .scheduleType)
        try container.encode(weekdays, forKey: .weekdays)
        try container.encodeIfPresent(intervalDays, forKey: .intervalDays)
        try container.encodeIfPresent(timesPerPeriod, forKey: .timesPerPeriod)
        try container.encodeIfPresent(period, forKey: .period)
        try container.encode(startDate, forKey: .startDate)
        try container.encodeIfPresent(endDate, forKey: .endDate)
        try container.encodeIfPresent(timeBlockId, forKey: .timeBlockId)
        if !tagIds.isEmpty {
            try container.encode(tagIds.map { TaskTagAssignmentDTO(tag: TaskTagDTO(id: $0)) }, forKey: .tags)
        }
        try container.encode(allowedSkips, forKey: .allowedSkips)
        try container.encode(restDays, forKey: .restDays)
        try container.encode(reminderTimes, forKey: .reminderTimes)
        try container.encode(checklistItems, forKey: .checklistItems)
        try container.encodeIfPresent(archivedAt, forKey: .archivedAt)
        try container.encode(currentStreak, forKey: .currentStreak)
        try container.encode(bestStreak, forKey: .bestStreak)
        try container.encode(isCompletedToday, forKey: .isCompletedToday)
        try container.encode(totalCompletions, forKey: .totalCompletions)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(version, forKey: .version)
        try container.encodeIfPresent(stats, forKey: .stats)
    }

    private struct HabitReminderReference: Decodable {
        let timeLocal: String
    }

    static func sampleHabits() -> [HabitModel] {
        let now = ISO8601DateFormatter().string(from: Date())
        return [
            HabitModel(
                id: "habit-1",
                name: "Morning Meditation",
                description: "10 minutes of mindfulness before starting work",
                icon: "brain",
                color: "mint",
                frequency: .daily,
                targetDaysPerWeek: 7,
                direction: .build,
                currentStreak: 5,
                bestStreak: 12,
                isCompletedToday: true,
                totalCompletions: 42,
                createdAt: now,
                version: 1
            ),
            HabitModel(
                id: "habit-2",
                name: "Daily Reading",
                description: "Read 20 pages of a book",
                icon: "book",
                color: "amber",
                frequency: .daily,
                targetDaysPerWeek: 7,
                direction: .build,
                currentStreak: 3,
                bestStreak: 8,
                isCompletedToday: false,
                totalCompletions: 28,
                createdAt: now,
                version: 1
            ),
            HabitModel(
                id: "habit-3",
                name: "Hydration Target",
                description: "Drink at least 2L of water",
                icon: "drop.fill",
                color: "teal",
                frequency: .daily,
                targetDaysPerWeek: 7,
                direction: .build,
                currentStreak: 7,
                bestStreak: 14,
                isCompletedToday: true,
                totalCompletions: 65,
                createdAt: now,
                version: 1
            ),
            HabitModel(
                id: "habit-4",
                name: "Evening Workout",
                description: "30 min cardio or strength training",
                icon: "figure.run",
                color: "coral",
                frequency: .weekly,
                targetDaysPerWeek: 4,
                direction: .build,
                currentStreak: 2,
                bestStreak: 6,
                isCompletedToday: false,
                totalCompletions: 19,
                createdAt: now,
                version: 1
            )
        ]
    }
}

struct HabitTimeBlockModel: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let icon: String
    let color: String
    let startLocal: String
    let endLocal: String
    let sortOrder: Double
}

struct HabitStatsModel: Codable, Equatable, Sendable {
    let currentStreak: Int
    let bestStreak: Int
    let streakUnit: String
    let successRate: Double
    let focusedMinutes: Double
    let completed: Int
    let missed: Int
    let failed: Int
    let skipped: Int
    let total: Int
    let last30Rate: Double
    let previous30Rate: Double
    let last90Rate: Double
    let averageValue: Double
    let strongestWeekday: Int?
    let weakestWeekday: Int?
    let heatmap: [HabitDayStateModel]

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        currentStreak = try values.decodeIfPresent(Int.self, forKey: .currentStreak) ?? 0
        bestStreak = try values.decodeIfPresent(Int.self, forKey: .bestStreak) ?? 0
        streakUnit = try values.decodeIfPresent(String.self, forKey: .streakUnit) ?? "DAY"
        successRate = try values.decodeIfPresent(Double.self, forKey: .successRate) ?? 0
        focusedMinutes = try values.decodeIfPresent(Double.self, forKey: .focusedMinutes) ?? 0
        completed = try values.decodeIfPresent(Int.self, forKey: .completed) ?? 0
        missed = try values.decodeIfPresent(Int.self, forKey: .missed)
            ?? values.decodeIfPresent(Int.self, forKey: .failed)
            ?? 0
        failed = try values.decodeIfPresent(Int.self, forKey: .failed) ?? 0
        skipped = try values.decodeIfPresent(Int.self, forKey: .skipped) ?? 0
        total = try values.decodeIfPresent(Int.self, forKey: .total) ?? completed + missed + skipped
        last30Rate = try values.decodeIfPresent(Double.self, forKey: .last30Rate) ?? successRate
        previous30Rate = try values.decodeIfPresent(Double.self, forKey: .previous30Rate) ?? 0
        last90Rate = try values.decodeIfPresent(Double.self, forKey: .last90Rate) ?? successRate
        averageValue = try values.decodeIfPresent(Double.self, forKey: .averageValue) ?? 0
        strongestWeekday = try values.decodeIfPresent(Int.self, forKey: .strongestWeekday)
        weakestWeekday = try values.decodeIfPresent(Int.self, forKey: .weakestWeekday)
        heatmap = try values.decodeIfPresent([HabitDayStateModel].self, forKey: .heatmap) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case currentStreak, bestStreak, streakUnit, successRate, focusedMinutes, completed, missed, failed, skipped, total,
             last30Rate, previous30Rate, last90Rate, averageValue, strongestWeekday, weakestWeekday, heatmap
    }
}
