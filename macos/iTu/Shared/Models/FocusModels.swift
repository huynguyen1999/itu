import Foundation

enum FocusMode: String, Codable, Sendable {
    case countdown = "COUNTDOWN"
    case stopwatch = "STOPWATCH"
}

enum FocusPhase: String, Codable, Sendable {
    case work = "WORK"
    case shortBreak = "SHORT_BREAK"
    case longBreak = "LONG_BREAK"
}

enum FocusSessionStatus: String, Codable, Sendable {
    case active = "ACTIVE"
    case paused = "PAUSED"
    case completed = "COMPLETED"
    case abandoned = "ABANDONED"
}

struct FocusPreset: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
    let workMinutes: Int
    let shortBreakMinutes: Int
    let longBreakMinutes: Int
    let cyclesBeforeLong: Int
    let autoStartBreaks: Bool
    let autoStartWork: Bool
    let isDefault: Bool
}

struct FocusSession: Codable, Equatable, Sendable, Identifiable {
    let id: String
    var taskId: String?
    let mode: FocusMode
    let phase: FocusPhase
    var status: FocusSessionStatus
    var plannedSeconds: Int?
    var accumulatedPauseSecs: Int
    let cycle: Int
    var taskTitleSnapshot: String?
    var customTitle: String?
    let taskListTitleSnapshot: String?
    let projectTitleSnapshot: String?
    let tagNamesSnapshot: [String]
    var startedAt: String
    var pausedAt: String?
    var completedAt: String?
    let adjustedStartedAt: String?
    let adjustedCompletedAt: String?
    let reflection: String?
    let ownerDeviceId: String?
    var version: Int
    let preset: FocusPreset?

    static func optimistic(
        id: String,
        task: ProductivityTask?,
        phase: FocusPhase,
        plannedSeconds: Int,
        startedAt: String
    ) -> FocusSession {
        FocusSession(
            id: id,
            taskId: task?.id,
            mode: .countdown,
            phase: phase,
            status: .active,
            plannedSeconds: plannedSeconds,
            accumulatedPauseSecs: 0,
            cycle: 1,
            taskTitleSnapshot: task?.title,
            customTitle: nil,
            taskListTitleSnapshot: nil,
            projectTitleSnapshot: nil,
            tagNamesSnapshot: [],
            startedAt: startedAt,
            pausedAt: nil,
            completedAt: nil,
            adjustedStartedAt: nil,
            adjustedCompletedAt: nil,
            reflection: nil,
            ownerDeviceId: "macos",
            version: 1,
            preset: nil
        )
    }
}

struct FocusSummary: Decodable, Equatable, Sendable {
    let totalSessions: Int
    let completedSessions: Int
    let abandonedSessions: Int
    let focusedSeconds: Int

    private enum CodingKeys: String, CodingKey {
        case totalSessions
        case completedSessions
        case abandonedSessions
        case focusedSeconds
        case totalFocusedMinutes
    }

    init(totalSessions: Int = 0, completedSessions: Int = 0, abandonedSessions: Int = 0, focusedSeconds: Int = 0) {
        self.totalSessions = totalSessions
        self.completedSessions = completedSessions
        self.abandonedSessions = abandonedSessions
        self.focusedSeconds = focusedSeconds
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        completedSessions = try values.decodeIfPresent(Int.self, forKey: .completedSessions) ?? 0
        abandonedSessions = try values.decodeIfPresent(Int.self, forKey: .abandonedSessions) ?? 0
        totalSessions = try values.decodeIfPresent(Int.self, forKey: .totalSessions)
            ?? completedSessions + abandonedSessions
        focusedSeconds = try values.decodeIfPresent(Int.self, forKey: .focusedSeconds)
            ?? (try values.decodeIfPresent(Int.self, forKey: .totalFocusedMinutes) ?? 0) * 60
    }
}

struct FocusSound: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
    let originalName: String?
    let url: String
    let mimeType: String
    let sizeBytes: Int
    let durationSeconds: Double?
    let version: Int
    let category: String
    let source: String
    let defaultVolume: Double
}

struct FocusSoundPreference: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let soundKey: String
    var enabled: Bool
    var sortOrder: Int
    var volume: Double
    let updatedAt: String
}

struct FocusSoundCatalog: Codable, Equatable, Sendable {
    let sounds: [FocusSound]
    let preferences: [FocusSoundPreference]
}
