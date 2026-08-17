import Foundation

public enum FocusMode: String, Codable, Sendable { case countdown = "COUNTDOWN"; case stopwatch = "STOPWATCH" }
public enum FocusPhase: String, Codable, Sendable { case work = "WORK"; case shortBreak = "SHORT_BREAK"; case longBreak = "LONG_BREAK" }
public enum FocusSessionStatus: String, Codable, Sendable { case active = "ACTIVE"; case paused = "PAUSED"; case completed = "COMPLETED"; case abandoned = "ABANDONED" }

public struct FocusPreset: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let workMinutes: Int
    public let shortBreakMinutes: Int
    public let longBreakMinutes: Int
    public let cyclesBeforeLong: Int
    public let autoStartBreaks: Bool
    public let autoStartWork: Bool
    public let isDefault: Bool
    public init(id: String, name: String, workMinutes: Int, shortBreakMinutes: Int, longBreakMinutes: Int, cyclesBeforeLong: Int, autoStartBreaks: Bool, autoStartWork: Bool, isDefault: Bool) {
        self.id = id; self.name = name; self.workMinutes = workMinutes; self.shortBreakMinutes = shortBreakMinutes; self.longBreakMinutes = longBreakMinutes; self.cyclesBeforeLong = cyclesBeforeLong; self.autoStartBreaks = autoStartBreaks; self.autoStartWork = autoStartWork; self.isDefault = isDefault
    }
}

public struct FocusSession: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public var taskId: String?
    public let mode: FocusMode
    public let phase: FocusPhase
    public var status: FocusSessionStatus
    public var plannedSeconds: Int?
    public var accumulatedPauseSecs: Int
    public let cycle: Int
    public var taskTitleSnapshot: String?
    public var customTitle: String?
    public let taskListTitleSnapshot: String?
    public let projectTitleSnapshot: String?
    public let tagNamesSnapshot: [String]
    public var startedAt: String
    public var pausedAt: String?
    public var completedAt: String?
    public let adjustedStartedAt: String?
    public let adjustedCompletedAt: String?
    public let reflection: String?
    public let ownerDeviceId: String?
    public var version: Int
    public let preset: FocusPreset?

    public init(id: String, taskId: String?, mode: FocusMode, phase: FocusPhase, status: FocusSessionStatus, plannedSeconds: Int?, accumulatedPauseSecs: Int, cycle: Int, taskTitleSnapshot: String?, customTitle: String?, taskListTitleSnapshot: String?, projectTitleSnapshot: String?, tagNamesSnapshot: [String], startedAt: String, pausedAt: String?, completedAt: String?, adjustedStartedAt: String?, adjustedCompletedAt: String?, reflection: String?, ownerDeviceId: String?, version: Int, preset: FocusPreset?) {
        self.id = id; self.taskId = taskId; self.mode = mode; self.phase = phase; self.status = status; self.plannedSeconds = plannedSeconds; self.accumulatedPauseSecs = accumulatedPauseSecs; self.cycle = cycle; self.taskTitleSnapshot = taskTitleSnapshot; self.customTitle = customTitle; self.taskListTitleSnapshot = taskListTitleSnapshot; self.projectTitleSnapshot = projectTitleSnapshot; self.tagNamesSnapshot = tagNamesSnapshot; self.startedAt = startedAt; self.pausedAt = pausedAt; self.completedAt = completedAt; self.adjustedStartedAt = adjustedStartedAt; self.adjustedCompletedAt = adjustedCompletedAt; self.reflection = reflection; self.ownerDeviceId = ownerDeviceId; self.version = version; self.preset = preset
    }

    public static func optimistic(id: String, task: ProductivityTask?, phase: FocusPhase, plannedSeconds: Int, startedAt: String, ownerDeviceId: String = "macos") -> FocusSession {
        FocusSession(id: id, taskId: task?.id, mode: .countdown, phase: phase, status: .active, plannedSeconds: plannedSeconds, accumulatedPauseSecs: 0, cycle: 1, taskTitleSnapshot: task?.title, customTitle: nil, taskListTitleSnapshot: nil, projectTitleSnapshot: nil, tagNamesSnapshot: [], startedAt: startedAt, pausedAt: nil, completedAt: nil, adjustedStartedAt: nil, adjustedCompletedAt: nil, reflection: nil, ownerDeviceId: ownerDeviceId, version: 1, preset: nil)
    }
}

public struct FocusSummary: Decodable, Equatable, Sendable {
    public let totalSessions: Int
    public let completedSessions: Int
    public let abandonedSessions: Int
    public let focusedSeconds: Int
    private enum CodingKeys: String, CodingKey { case totalSessions, completedSessions, abandonedSessions, focusedSeconds, totalFocusedMinutes }
    public init(totalSessions: Int = 0, completedSessions: Int = 0, abandonedSessions: Int = 0, focusedSeconds: Int = 0) { self.totalSessions = totalSessions; self.completedSessions = completedSessions; self.abandonedSessions = abandonedSessions; self.focusedSeconds = focusedSeconds }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        completedSessions = try values.decodeIfPresent(Int.self, forKey: .completedSessions) ?? 0
        abandonedSessions = try values.decodeIfPresent(Int.self, forKey: .abandonedSessions) ?? 0
        totalSessions = try values.decodeIfPresent(Int.self, forKey: .totalSessions) ?? completedSessions + abandonedSessions
        focusedSeconds = try values.decodeIfPresent(Int.self, forKey: .focusedSeconds) ?? (try values.decodeIfPresent(Int.self, forKey: .totalFocusedMinutes) ?? 0) * 60
    }
}

public struct FocusSound: Codable, Equatable, Sendable, Identifiable {
    public let id: String; public let name: String; public let originalName: String?; public let url: String; public let mimeType: String; public let sizeBytes: Int; public let durationSeconds: Double?; public let version: Int; public let category: String; public let source: String; public let defaultVolume: Double
    public init(id: String, name: String, originalName: String?, url: String, mimeType: String, sizeBytes: Int, durationSeconds: Double?, version: Int, category: String, source: String, defaultVolume: Double) { self.id = id; self.name = name; self.originalName = originalName; self.url = url; self.mimeType = mimeType; self.sizeBytes = sizeBytes; self.durationSeconds = durationSeconds; self.version = version; self.category = category; self.source = source; self.defaultVolume = defaultVolume }
}

public struct FocusSoundPreference: Codable, Equatable, Sendable, Identifiable {
    public let id: String; public let soundKey: String; public var enabled: Bool; public var sortOrder: Int; public var volume: Double; public let updatedAt: String
    public init(id: String, soundKey: String, enabled: Bool, sortOrder: Int, volume: Double, updatedAt: String) { self.id = id; self.soundKey = soundKey; self.enabled = enabled; self.sortOrder = sortOrder; self.volume = volume; self.updatedAt = updatedAt }
}

public struct FocusSoundCatalog: Codable, Equatable, Sendable {
    public let sounds: [FocusSound]
    public let preferences: [FocusSoundPreference]
    public init(sounds: [FocusSound], preferences: [FocusSoundPreference]) { self.sounds = sounds; self.preferences = preferences }
}
