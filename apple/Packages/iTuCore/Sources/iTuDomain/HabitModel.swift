import Foundation

public enum HabitFrequency: String, Codable, CaseIterable, Sendable { case daily = "DAILY"; case weekly = "WEEKLY"; case custom = "CUSTOM" }
public enum HabitDirection: String, Codable, CaseIterable, Sendable { case build = "BUILD"; case limit = "LIMIT" }
public enum HabitOccurrenceStatus: String, Codable, Sendable { case pending = "PENDING"; case completed = "COMPLETED"; case failed = "FAILED"; case skipped = "SKIPPED" }
public enum HabitProjectedStatus: String, Codable, Sendable { case completed = "COMPLETED"; case partial = "PARTIAL"; case pending = "PENDING"; case missed = "MISSED"; case skipped = "SKIPPED"; case failed = "FAILED"; case rest = "REST"; case notScheduled = "NOT_SCHEDULED" }

public struct HabitPreferencesModel: Codable, Equatable, Sendable {
    public var dayRolloverCutoffHour: Int
    public var weekStartDay: String
    public init(dayRolloverCutoffHour: Int = 4, weekStartDay: String = "MONDAY") { self.dayRolloverCutoffHour = dayRolloverCutoffHour; self.weekStartDay = weekStartDay }
}

public struct HabitDayStateModel: Codable, Identifiable, Equatable, Sendable {
    public let habitId: String?
    public let localDate: String
    public let scheduled: Bool
    public let status: HabitProjectedStatus
    public let value: Double
    public let targetValue: Double
    public let progressRatio: Double
    public let occurrenceId: String?
    public let periodStart: String?
    public let periodEnd: String?
    public var id: String { "\(habitId ?? ""):\(localDate)" }
    public init(habitId: String?, localDate: String, scheduled: Bool, status: HabitProjectedStatus, value: Double, targetValue: Double, progressRatio: Double, occurrenceId: String?, periodStart: String?, periodEnd: String?) { self.habitId = habitId; self.localDate = localDate; self.scheduled = scheduled; self.status = status; self.value = value; self.targetValue = targetValue; self.progressRatio = progressRatio; self.occurrenceId = occurrenceId; self.periodStart = periodStart; self.periodEnd = periodEnd }
}

public struct HabitCalendarResponse: Codable, Sendable {
    public let from: String; public let to: String; public let days: [HabitDayStateModel]
    public init(from: String, to: String, days: [HabitDayStateModel]) { self.from = from; self.to = to; self.days = days }
}

public struct HabitProgressResultModel: Codable, Sendable {
    public let habitId: String; public let occurrenceId: String; public let localDate: String; public let status: HabitOccurrenceStatus; public let value: Double; public let targetValue: Double; public let progressRatio: Double; public let growthReceipt: GrowthAwardReceipt?
    public init(habitId: String, occurrenceId: String, localDate: String, status: HabitOccurrenceStatus, value: Double, targetValue: Double, progressRatio: Double, growthReceipt: GrowthAwardReceipt?) { self.habitId = habitId; self.occurrenceId = occurrenceId; self.localDate = localDate; self.status = status; self.value = value; self.targetValue = targetValue; self.progressRatio = progressRatio; self.growthReceipt = growthReceipt }
}

public struct HabitQuickLogRequest: Identifiable, Equatable, Sendable {
    public let habitId: String; public let localDate: String
    public var id: String { "\(habitId):\(localDate)" }
    public init(habitId: String, localDate: String) { self.habitId = habitId; self.localDate = localDate }
}

public struct HabitProgressLogModel: Codable, Identifiable, Sendable {
    public let id: String; public let occurrenceId: String; public let source: String; public let value: Double; public let recordedAt: String
    public init(id: String, occurrenceId: String, source: String, value: Double, recordedAt: String) { self.id = id; self.occurrenceId = occurrenceId; self.source = source; self.value = value; self.recordedAt = recordedAt }
}

public struct HabitReminderDeliveryModel: Codable, Sendable {
    public let id: String; public let status: String; public let scheduledFor: String
    public init(id: String, status: String, scheduledFor: String) { self.id = id; self.status = status; self.scheduledFor = scheduledFor }
}

public struct HabitChecklistItemModel: Codable, Identifiable, Equatable, Sendable {
    public let id: String?; public var title: String; public var required: Bool; public var sortOrder: Double?
    public init(id: String?, title: String, required: Bool, sortOrder: Double?) { self.id = id; self.title = title; self.required = required; self.sortOrder = sortOrder }
}

public struct HabitOccurrenceModel: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let habitId: String
    public let occurrenceDate: String
    public var status: HabitOccurrenceStatus
    public var value: Double
    public var growthReceipt: GrowthAwardReceipt?
    public var localDayString: String { iTuDateSupport.localDayString(from: occurrenceDate) }
    private enum CodingKeys: String, CodingKey { case id, habitId, occurrenceDate, status, habit, checkIn, progressLogs, growthReceipt }
    public init(id: String, habitId: String, occurrenceDate: String, status: HabitOccurrenceStatus = .pending, value: Double = 0, growthReceipt: GrowthAwardReceipt? = nil) { self.id = id; self.habitId = habitId; self.occurrenceDate = occurrenceDate; self.status = status; self.value = value; self.growthReceipt = growthReceipt }
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        if let directHabitId = try container.decodeIfPresent(String.self, forKey: .habitId) { habitId = directHabitId } else { habitId = try container.decodeIfPresent(HabitReference.self, forKey: .habit)?.id ?? "" }
        occurrenceDate = try container.decode(String.self, forKey: .occurrenceDate)
        status = try container.decodeIfPresent(HabitOccurrenceStatus.self, forKey: .status) ?? .pending
        growthReceipt = try container.decodeIfPresent(GrowthAwardReceipt.self, forKey: .growthReceipt)
        if let checkIn = try container.decodeIfPresent(HabitCheckInReference.self, forKey: .checkIn) { value = checkIn.value } else { value = (try container.decodeIfPresent([HabitProgressReference].self, forKey: .progressLogs) ?? []).reduce(0) { $0 + $1.value } }
    }
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: EncodingKeys.self)
        try container.encode(id, forKey: .id); try container.encode(habitId, forKey: .habitId); try container.encode(occurrenceDate, forKey: .occurrenceDate); try container.encode(status, forKey: .status); try container.encode(value, forKey: .value); try container.encodeIfPresent(growthReceipt, forKey: .growthReceipt)
    }
    private enum EncodingKeys: String, CodingKey { case id, habitId, occurrenceDate, status, value, growthReceipt }
    private struct HabitReference: Decodable { let id: String }
    private struct HabitCheckInReference: Decodable { let value: Double }
    private struct HabitProgressReference: Decodable { let value: Double }
}

public struct HabitModel: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var name: String
    public var description: String?
    public var icon: String
    public var color: String
    public var frequency: HabitFrequency
    public var targetValue: Double
    public var targetType: String
    public var unit: String?
    public var targetDaysPerWeek: Int
    public var direction: HabitDirection
    public var scheduleType: String
    public var weekdays: [Int]
    public var intervalDays: Int?
    public var timesPerPeriod: Int?
    public var period: String?
    public var startDate: String
    public var endDate: String?
    public var timeBlockId: String?
    public var tagIds: [String]
    public var allowedSkips: Int
    public var restDays: [Int]
    public var reminderTimes: [String]
    public var checklistItems: [HabitChecklistItemModel]
    public var archivedAt: String?
    public var currentStreak: Int
    public var bestStreak: Int
    public var isCompletedToday: Bool
    public var totalCompletions: Int
    public var createdAt: String
    public var version: Int
    public var stats: HabitStatsModel?

    public enum CodingKeys: String, CodingKey { case id, name, title, description, icon, color, frequency, scheduleType, targetValue, targetType, unit, targetDaysPerWeek, direction, weekdays, archivedAt, intervalDays, timesPerPeriod, period, startDate, endDate, timeBlockId, allowedSkips, restDays, reminderTimes, reminders, checklistItems, tags, currentStreak, bestStreak, isCompletedToday, totalCompletions, createdAt, version, stats }

    public init(id: String, name: String, description: String? = nil, icon: String = "repeat", color: String = "mint", frequency: HabitFrequency = .daily, targetValue: Double = 1, targetType: String = "COUNT", unit: String? = nil, targetDaysPerWeek: Int = 7, direction: HabitDirection = .build, scheduleType: String? = nil, weekdays: [Int] = [], intervalDays: Int? = nil, timesPerPeriod: Int? = nil, period: String? = nil, startDate: String? = nil, endDate: String? = nil, timeBlockId: String? = nil, tagIds: [String] = [], allowedSkips: Int = 0, restDays: [Int] = [], reminderTimes: [String] = [], checklistItems: [HabitChecklistItemModel] = [], archivedAt: String? = nil, currentStreak: Int = 0, bestStreak: Int = 0, isCompletedToday: Bool = false, totalCompletions: Int = 0, createdAt: String = ISO8601DateFormatter().string(from: Date()), version: Int = 1, stats: HabitStatsModel? = nil) {
        self.id = id; self.name = name; self.description = description; self.icon = icon; self.color = color; self.frequency = frequency; self.targetValue = targetValue; self.targetType = targetType; self.unit = unit; self.targetDaysPerWeek = targetDaysPerWeek; self.direction = direction; self.scheduleType = scheduleType ?? "WEEKDAYS"; self.weekdays = weekdays; self.intervalDays = intervalDays; self.timesPerPeriod = timesPerPeriod; self.period = period; self.startDate = startDate ?? createdAt; self.endDate = endDate; self.timeBlockId = timeBlockId; self.tagIds = tagIds; self.allowedSkips = allowedSkips; self.restDays = restDays; self.reminderTimes = reminderTimes; self.checklistItems = checklistItems; self.archivedAt = archivedAt; self.currentStreak = currentStreak; self.bestStreak = bestStreak; self.isCompletedToday = isCompletedToday; self.totalCompletions = totalCompletions; self.createdAt = createdAt; self.version = version; self.stats = stats
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        if let decodedName = try container.decodeIfPresent(String.self, forKey: .name) { name = decodedName } else if let decodedTitle = try container.decodeIfPresent(String.self, forKey: .title) { name = decodedTitle } else { name = "Untitled Habit" }
        description = try container.decodeIfPresent(String.self, forKey: .description); icon = try container.decodeIfPresent(String.self, forKey: .icon) ?? "repeat"; color = try container.decodeIfPresent(String.self, forKey: .color) ?? "mint"
        if let freq = try container.decodeIfPresent(HabitFrequency.self, forKey: .frequency) { frequency = freq } else if let sched = try container.decodeIfPresent(String.self, forKey: .scheduleType), let freq = HabitFrequency(rawValue: sched.uppercased()) { frequency = freq } else { frequency = .daily }
        targetValue = try container.decodeIfPresent(Double.self, forKey: .targetValue) ?? 1; targetType = try container.decodeIfPresent(String.self, forKey: .targetType) ?? "COUNT"; unit = try container.decodeIfPresent(String.self, forKey: .unit); targetDaysPerWeek = try container.decodeIfPresent(Int.self, forKey: .targetDaysPerWeek) ?? 7; direction = try container.decodeIfPresent(HabitDirection.self, forKey: .direction) ?? .build
        scheduleType = try container.decodeIfPresent(String.self, forKey: .scheduleType) ?? "WEEKDAYS"; weekdays = try container.decodeIfPresent([Int].self, forKey: .weekdays) ?? []; intervalDays = try container.decodeIfPresent(Int.self, forKey: .intervalDays); timesPerPeriod = try container.decodeIfPresent(Int.self, forKey: .timesPerPeriod); period = try container.decodeIfPresent(String.self, forKey: .period)
        startDate = try container.decodeIfPresent(String.self, forKey: .startDate) ?? ISO8601DateFormatter().string(from: Date()); endDate = try container.decodeIfPresent(String.self, forKey: .endDate); timeBlockId = try container.decodeIfPresent(String.self, forKey: .timeBlockId)
        let tagAssignments = try container.decodeIfPresent([TaskTagAssignmentDTO].self, forKey: .tags) ?? []; tagIds = tagAssignments.map { $0.tag.id }; allowedSkips = try container.decodeIfPresent(Int.self, forKey: .allowedSkips) ?? 0; restDays = try container.decodeIfPresent([Int].self, forKey: .restDays) ?? []
        if let reminders = try container.decodeIfPresent([HabitReminderReference].self, forKey: .reminders) { reminderTimes = reminders.map(\.timeLocal) } else { reminderTimes = try container.decodeIfPresent([String].self, forKey: .reminderTimes) ?? [] }
        checklistItems = try container.decodeIfPresent([HabitChecklistItemModel].self, forKey: .checklistItems) ?? []; archivedAt = try container.decodeIfPresent(String.self, forKey: .archivedAt); currentStreak = try container.decodeIfPresent(Int.self, forKey: .currentStreak) ?? 0; bestStreak = try container.decodeIfPresent(Int.self, forKey: .bestStreak) ?? 0; isCompletedToday = try container.decodeIfPresent(Bool.self, forKey: .isCompletedToday) ?? false; totalCompletions = try container.decodeIfPresent(Int.self, forKey: .totalCompletions) ?? 0; createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ISO8601DateFormatter().string(from: Date()); version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1; stats = try container.decodeIfPresent(HabitStatsModel.self, forKey: .stats)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id); try container.encode(name, forKey: .name); try container.encodeIfPresent(description, forKey: .description); try container.encode(icon, forKey: .icon); try container.encode(color, forKey: .color); try container.encode(frequency, forKey: .frequency); try container.encode(targetValue, forKey: .targetValue); try container.encode(targetType, forKey: .targetType); try container.encodeIfPresent(unit, forKey: .unit); try container.encode(targetDaysPerWeek, forKey: .targetDaysPerWeek); try container.encode(direction, forKey: .direction); try container.encode(scheduleType, forKey: .scheduleType); try container.encode(weekdays, forKey: .weekdays); try container.encodeIfPresent(intervalDays, forKey: .intervalDays); try container.encodeIfPresent(timesPerPeriod, forKey: .timesPerPeriod); try container.encodeIfPresent(period, forKey: .period); try container.encode(startDate, forKey: .startDate); try container.encodeIfPresent(endDate, forKey: .endDate); try container.encodeIfPresent(timeBlockId, forKey: .timeBlockId)
        if !tagIds.isEmpty { try container.encode(tagIds.map { TaskTagAssignmentDTO(tag: TaskTagDTO(id: $0)) }, forKey: .tags) }
        try container.encode(allowedSkips, forKey: .allowedSkips); try container.encode(restDays, forKey: .restDays); try container.encode(reminderTimes, forKey: .reminderTimes); try container.encode(checklistItems, forKey: .checklistItems); try container.encodeIfPresent(archivedAt, forKey: .archivedAt); try container.encode(currentStreak, forKey: .currentStreak); try container.encode(bestStreak, forKey: .bestStreak); try container.encode(isCompletedToday, forKey: .isCompletedToday); try container.encode(totalCompletions, forKey: .totalCompletions); try container.encode(createdAt, forKey: .createdAt); try container.encode(version, forKey: .version); try container.encodeIfPresent(stats, forKey: .stats)
    }

    private struct HabitReminderReference: Decodable { let timeLocal: String }

    public static func sampleHabits() -> [HabitModel] {
        let now = ISO8601DateFormatter().string(from: Date())
        return [
            HabitModel(id: "habit-1", name: "Morning Meditation", description: "10 minutes of mindfulness before starting work", icon: "brain", color: "mint", frequency: .daily, targetDaysPerWeek: 7, direction: .build, currentStreak: 5, bestStreak: 12, isCompletedToday: true, totalCompletions: 42, createdAt: now, version: 1),
            HabitModel(id: "habit-2", name: "Daily Reading", description: "Read 20 pages of a book", icon: "book", color: "amber", frequency: .daily, targetDaysPerWeek: 7, direction: .build, currentStreak: 3, bestStreak: 8, isCompletedToday: false, totalCompletions: 28, createdAt: now, version: 1),
            HabitModel(id: "habit-3", name: "Hydration Target", description: "Drink at least 2L of water", icon: "drop.fill", color: "teal", frequency: .daily, targetDaysPerWeek: 7, direction: .build, currentStreak: 7, bestStreak: 14, isCompletedToday: true, totalCompletions: 65, createdAt: now, version: 1),
            HabitModel(id: "habit-4", name: "Evening Workout", description: "30 min cardio or strength training", icon: "figure.run", color: "coral", frequency: .weekly, targetDaysPerWeek: 4, direction: .build, currentStreak: 2, bestStreak: 6, isCompletedToday: false, totalCompletions: 19, createdAt: now, version: 1)
        ]
    }
}

public struct HabitTimeBlockModel: Codable, Identifiable, Equatable, Sendable {
    public let id: String; public let name: String; public let icon: String; public let color: String; public let startLocal: String; public let endLocal: String; public let sortOrder: Double
    public init(id: String, name: String, icon: String, color: String, startLocal: String, endLocal: String, sortOrder: Double) { self.id = id; self.name = name; self.icon = icon; self.color = color; self.startLocal = startLocal; self.endLocal = endLocal; self.sortOrder = sortOrder }
}

public struct HabitStatsModel: Codable, Equatable, Sendable {
    public let currentStreak: Int; public let bestStreak: Int; public let streakUnit: String; public let successRate: Double; public let focusedMinutes: Double; public let completed: Int; public let missed: Int; public let failed: Int; public let skipped: Int; public let total: Int; public let last30Rate: Double; public let previous30Rate: Double; public let last90Rate: Double; public let averageValue: Double; public let strongestWeekday: Int?; public let weakestWeekday: Int?; public let heatmap: [HabitDayStateModel]
    public init(currentStreak: Int, bestStreak: Int, streakUnit: String, successRate: Double, focusedMinutes: Double, completed: Int, missed: Int, failed: Int, skipped: Int, total: Int, last30Rate: Double, previous30Rate: Double, last90Rate: Double, averageValue: Double, strongestWeekday: Int?, weakestWeekday: Int?, heatmap: [HabitDayStateModel]) { self.currentStreak = currentStreak; self.bestStreak = bestStreak; self.streakUnit = streakUnit; self.successRate = successRate; self.focusedMinutes = focusedMinutes; self.completed = completed; self.missed = missed; self.failed = failed; self.skipped = skipped; self.total = total; self.last30Rate = last30Rate; self.previous30Rate = previous30Rate; self.last90Rate = last90Rate; self.averageValue = averageValue; self.strongestWeekday = strongestWeekday; self.weakestWeekday = weakestWeekday; self.heatmap = heatmap }
    private enum CodingKeys: String, CodingKey { case currentStreak, bestStreak, streakUnit, successRate, focusedMinutes, completed, missed, failed, skipped, total, last30Rate, previous30Rate, last90Rate, averageValue, strongestWeekday, weakestWeekday, heatmap }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        currentStreak = try values.decodeIfPresent(Int.self, forKey: .currentStreak) ?? 0; bestStreak = try values.decodeIfPresent(Int.self, forKey: .bestStreak) ?? 0; streakUnit = try values.decodeIfPresent(String.self, forKey: .streakUnit) ?? "DAY"; successRate = try values.decodeIfPresent(Double.self, forKey: .successRate) ?? 0; focusedMinutes = try values.decodeIfPresent(Double.self, forKey: .focusedMinutes) ?? 0; completed = try values.decodeIfPresent(Int.self, forKey: .completed) ?? 0
        missed = try values.decodeIfPresent(Int.self, forKey: .missed) ?? values.decodeIfPresent(Int.self, forKey: .failed) ?? 0; failed = try values.decodeIfPresent(Int.self, forKey: .failed) ?? 0; skipped = try values.decodeIfPresent(Int.self, forKey: .skipped) ?? 0; total = try values.decodeIfPresent(Int.self, forKey: .total) ?? completed + missed + skipped; last30Rate = try values.decodeIfPresent(Double.self, forKey: .last30Rate) ?? successRate; previous30Rate = try values.decodeIfPresent(Double.self, forKey: .previous30Rate) ?? 0; last90Rate = try values.decodeIfPresent(Double.self, forKey: .last90Rate) ?? successRate; averageValue = try values.decodeIfPresent(Double.self, forKey: .averageValue) ?? 0; strongestWeekday = try values.decodeIfPresent(Int.self, forKey: .strongestWeekday); weakestWeekday = try values.decodeIfPresent(Int.self, forKey: .weakestWeekday); heatmap = try values.decodeIfPresent([HabitDayStateModel].self, forKey: .heatmap) ?? []
    }
}
