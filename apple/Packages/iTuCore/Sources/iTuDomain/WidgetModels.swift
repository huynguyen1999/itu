import Foundation

public struct WidgetTaskSnapshot: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let status: TaskStatus
    public let dueAt: String?
    public let scheduledStartAt: String?

    public init(
        id: String,
        title: String,
        status: TaskStatus,
        dueAt: String? = nil,
        scheduledStartAt: String? = nil
    ) {
        self.id = id
        self.title = title
        self.status = status
        self.dueAt = dueAt
        self.scheduledStartAt = scheduledStartAt
    }
}

public struct WidgetFocusSnapshot: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let status: FocusSessionStatus
    public let phase: FocusPhase
    public let plannedSeconds: Int?
    public let startedAt: String
    public let pausedAt: String?
    public let accumulatedPauseSeconds: Int

    public init(
        id: String,
        title: String,
        status: FocusSessionStatus,
        phase: FocusPhase,
        plannedSeconds: Int?,
        startedAt: String,
        pausedAt: String? = nil,
        accumulatedPauseSeconds: Int = 0
    ) {
        self.id = id
        self.title = title
        self.status = status
        self.phase = phase
        self.plannedSeconds = plannedSeconds
        self.startedAt = startedAt
        self.pausedAt = pausedAt
        self.accumulatedPauseSeconds = accumulatedPauseSeconds
    }

    /// Returns countdown seconds at a fixed instant. Paused sessions stop at `pausedAt`.
    public func remainingSeconds(at now: Date) -> Int? {
        guard status == .active || status == .paused,
              let plannedSeconds,
              plannedSeconds >= 0,
              let started = Self.parseDate(startedAt) else { return nil }

        let endpoint: Date
        if status == .paused {
            guard let pausedAt, let paused = Self.parseDate(pausedAt) else { return nil }
            endpoint = paused
        } else {
            endpoint = now
        }

        let elapsedInterval = endpoint.timeIntervalSince(started)
        guard elapsedInterval.isFinite else { return nil }
        let elapsed = max(0, Int(elapsedInterval))
        let pauses = max(0, accumulatedPauseSeconds)
        return max(0, plannedSeconds - max(0, elapsed - pauses))
    }

    /// Returns the absolute deadline for an active countdown, or nil while paused/finished.
    public func deadline(at now: Date) -> Date? {
        guard status == .active,
              remainingSeconds(at: now) != nil,
              let plannedSeconds,
              let started = Self.parseDate(startedAt) else { return nil }

        return started.addingTimeInterval(
            Double(max(0, plannedSeconds) + max(0, accumulatedPauseSeconds))
        )
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }

        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: value)
    }
}

public struct WidgetSnapshot: Codable, Equatable, Sendable {
    public static let currentSchemaVersion = 1

    public let schemaVersion: Int
    public let accountID: String
    public let generatedAt: String
    public let localDate: String
    public let taskTotal: Int
    public let taskCompleted: Int
    public let taskRemaining: Int
    public let nextTask: WidgetTaskSnapshot?
    public let todayTasks: [WidgetTaskSnapshot]
    public let habitsRemaining: Int
    public let activeFocus: WidgetFocusSnapshot?

    public init(
        schemaVersion: Int = WidgetSnapshot.currentSchemaVersion,
        accountID: String,
        generatedAt: String,
        localDate: String,
        taskTotal: Int,
        taskCompleted: Int,
        taskRemaining: Int,
        nextTask: WidgetTaskSnapshot? = nil,
        todayTasks: [WidgetTaskSnapshot] = [],
        habitsRemaining: Int,
        activeFocus: WidgetFocusSnapshot? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.accountID = accountID
        self.generatedAt = generatedAt
        self.localDate = localDate
        self.taskTotal = taskTotal
        self.taskCompleted = taskCompleted
        self.taskRemaining = taskRemaining
        self.nextTask = nextTask
        self.todayTasks = todayTasks
        self.habitsRemaining = habitsRemaining
        self.activeFocus = activeFocus
    }
}

public enum WidgetSnapshotStoreError: Error, Equatable, Sendable {
    case corruptData
    case unsupportedSchemaVersion(Int)
    case accountMismatch(expected: String, actual: String)
}

/// A caller-owned, account-scoped JSON file for widget data.
public struct WidgetSnapshotStore: Sendable {
    public let fileURL: URL
    public let expectedAccountID: String

    public init(fileURL: URL, expectedAccountID: String) {
        precondition(!expectedAccountID.isEmpty, "expectedAccountID must not be empty")
        self.fileURL = fileURL
        self.expectedAccountID = expectedAccountID
    }

    public func save(_ snapshot: WidgetSnapshot) throws {
        guard snapshot.schemaVersion == WidgetSnapshot.currentSchemaVersion else {
            throw WidgetSnapshotStoreError.unsupportedSchemaVersion(snapshot.schemaVersion)
        }
        guard snapshot.accountID == expectedAccountID else {
            throw WidgetSnapshotStoreError.accountMismatch(expected: expectedAccountID, actual: snapshot.accountID)
        }

        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: fileURL, options: [.atomic])
    }

    public func load() throws -> WidgetSnapshot? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }

        do {
            let snapshot = try JSONDecoder().decode(WidgetSnapshot.self, from: Data(contentsOf: fileURL))
            guard snapshot.schemaVersion == WidgetSnapshot.currentSchemaVersion else {
                throw WidgetSnapshotStoreError.unsupportedSchemaVersion(snapshot.schemaVersion)
            }
            guard snapshot.accountID == expectedAccountID else {
                throw WidgetSnapshotStoreError.accountMismatch(expected: expectedAccountID, actual: snapshot.accountID)
            }
            return snapshot
        } catch let error as WidgetSnapshotStoreError {
            throw error
        } catch {
            throw WidgetSnapshotStoreError.corruptData
        }
    }

    public func clear() throws {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        try FileManager.default.removeItem(at: fileURL)
    }
}
