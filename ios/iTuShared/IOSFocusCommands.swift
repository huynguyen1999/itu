import Foundation
import ActivityKit
import iTuDomain
import iTuOffline

enum IOSFocusAction: String, Sendable {
    case pause
    case resume
    case complete
}

enum IOSFocusCommandError: LocalizedError, Equatable {
    case noActiveSession
    case invalidTransition(action: IOSFocusAction, status: FocusSessionStatus)
    case unavailableAccount

    var errorDescription: String? {
        switch self {
        case .noActiveSession: "No active Focus Session is available."
        case let .invalidTransition(action, status): "Cannot \(action.rawValue) a \(status.rawValue.lowercased()) Focus Session."
        case .unavailableAccount: "The signed-in account is unavailable."
        }
    }
}

enum IOSFocusCommands {
    static func start(
        task: ProductivityTask?,
        title: String?,
        plannedSeconds: Int,
        ownerDeviceID: String = "ios",
        occurredAt: String,
        idempotencyKey: String = ULID.generate()
    ) -> (session: FocusSession, mutation: SyncMutation) {
        let session = FocusSession.optimistic(
            id: ULID.generate(),
            task: task,
            phase: .work,
            plannedSeconds: plannedSeconds,
            startedAt: occurredAt,
            ownerDeviceId: ownerDeviceID
        )
        var sessionWithTitle = session
        sessionWithTitle.customTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? title : nil
        let payload: [String: JSONValue] = [
            "taskId": task.map { .string($0.id) } ?? .null,
            "customTitle": sessionWithTitle.customTitle.map(JSONValue.string) ?? .null,
            "mode": .string(FocusMode.countdown.rawValue),
            "plannedSeconds": .number(Double(plannedSeconds)),
            "ownerDeviceId": .string(ownerDeviceID),
            "idempotencyKey": .string(idempotencyKey),
            "startedAt": .string(occurredAt)
        ]
        let mutation = SyncMutation(id: ULID.generate(), kind: "focussession.create", entityId: session.id, payload: payload, occurredAt: occurredAt)
        return (sessionWithTitle, mutation)
    }

    static func apply(
        _ action: IOSFocusAction,
        to session: FocusSession,
        occurredAt: String,
        idempotencyKey: String = ULID.generate()
    ) throws -> (session: FocusSession, mutation: SyncMutation) {
        guard (action == .pause && session.status == .active)
                || (action == .resume && session.status == .paused)
                || (action == .complete && (session.status == .active || session.status == .paused)) else {
            throw IOSFocusCommandError.invalidTransition(action: action, status: session.status)
        }
        var updated = session
        switch action {
        case .pause:
            updated.status = .paused
            updated.pausedAt = occurredAt
        case .resume:
            if let pausedAt = session.pausedAt,
               let paused = iTuDateSupport.parse(pausedAt),
               let resumed = iTuDateSupport.parse(occurredAt) {
                updated.accumulatedPauseSecs += max(0, Int(resumed.timeIntervalSince(paused)))
            }
            updated.status = .active
            updated.pausedAt = nil
        case .complete:
            updated.status = .completed
            updated.completedAt = occurredAt
        }
        updated.version += 1
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "focussession.action",
            entityId: session.id,
            baseVersion: session.version,
            payload: [
                "action": .string(action.rawValue),
                "occurredAt": .string(occurredAt),
                "idempotencyKey": .string(idempotencyKey),
                "expectedVersion": .number(Double(session.version))
            ],
            occurredAt: occurredAt
        )
        return (updated, mutation)
    }
}

@MainActor
protocol IOSFocusIntentHandler: AnyObject {
    func prepareForFocusIntent() async
    func performFocusIntent(_ action: IOSFocusAction) async throws -> FocusSession
    func startFocusFromIntent() async throws -> FocusSession
}

enum IOSProductivityIntentError: LocalizedError, Equatable {
    case unavailableAccount
    case notFound(String)
    case rejected(String)

    var errorDescription: String? {
        switch self {
        case .unavailableAccount:
            "The signed-in account is unavailable."
        case let .notFound(kind):
            "The requested \(kind) could not be found."
        case let .rejected(action):
            "Could not \(action)."
        }
    }
}

@MainActor
protocol IOSProductivityIntentHandler: AnyObject {
    func createTaskFromIntent(title: String) async -> Bool
    func completeTaskFromIntent(id: String) async -> Bool
    func completeHabitFromIntent(id: String) async -> Bool
    func incrementHabitFromIntent(id: String) async -> Bool
}

@MainActor
enum IOSAppProcessRegistry {
    private static weak var focusHandler: (any IOSFocusIntentHandler)?
    private static weak var productivityHandler: (any IOSProductivityIntentHandler)?

    static func register(_ handler: any IOSFocusIntentHandler) {
        focusHandler = handler
    }

    static func registerProductivity(_ handler: any IOSProductivityIntentHandler) {
        productivityHandler = handler
    }

    static func perform(_ action: IOSFocusAction) async throws -> FocusSession {
        guard let focusHandler else { throw IOSFocusCommandError.unavailableAccount }
        await focusHandler.prepareForFocusIntent()
        return try await focusHandler.performFocusIntent(action)
    }

    static func start() async throws -> FocusSession {
        guard let focusHandler else { throw IOSFocusCommandError.unavailableAccount }
        await focusHandler.prepareForFocusIntent()
        return try await focusHandler.startFocusFromIntent()
    }

    static func createTask(title: String) async throws {
        guard let productivityHandler else { throw IOSProductivityIntentError.unavailableAccount }
        guard await productivityHandler.createTaskFromIntent(title: title) else {
            throw IOSProductivityIntentError.rejected("create the task")
        }
    }

    static func completeTask(id: String) async throws {
        guard let productivityHandler else { throw IOSProductivityIntentError.unavailableAccount }
        guard await productivityHandler.completeTaskFromIntent(id: id) else {
            throw IOSProductivityIntentError.notFound("task")
        }
    }

    static func completeHabit(id: String) async throws {
        guard let productivityHandler else { throw IOSProductivityIntentError.unavailableAccount }
        guard await productivityHandler.completeHabitFromIntent(id: id) else {
            throw IOSProductivityIntentError.notFound("habit")
        }
    }

    static func incrementHabit(id: String) async throws {
        guard let productivityHandler else { throw IOSProductivityIntentError.unavailableAccount }
        guard await productivityHandler.incrementHabitFromIntent(id: id) else {
            throw IOSProductivityIntentError.notFound("habit")
        }
    }
}

enum IOSFocusIntentExecutor {
    static func execute(_ action: IOSFocusAction) async throws -> FocusSession {
        try await IOSAppProcessRegistry.perform(action)
    }

    static func start() async throws -> FocusSession {
        try await IOSAppProcessRegistry.start()
    }
}

enum IOSProductivityIntentExecutor {
    static func createTask(title: String) async throws {
        try await IOSAppProcessRegistry.createTask(title: title)
    }

    static func completeTask(id: String) async throws {
        try await IOSAppProcessRegistry.completeTask(id: id)
    }

    static func completeHabit(id: String) async throws {
        try await IOSAppProcessRegistry.completeHabit(id: id)
    }

    static func incrementHabit(id: String) async throws {
        try await IOSAppProcessRegistry.incrementHabit(id: id)
    }
}

@available(iOS 16.1, *)
struct FocusActivityAttributes: ActivityAttributes {
    let sessionID: String
    let title: String

    struct ContentState: Codable, Hashable {
        let status: String
        let phase: String
        let plannedSeconds: Int?
        let startedAt: String
        let pausedAt: String?
        let accumulatedPauseSeconds: Int
        let generatedAt: String

        init(focus: WidgetFocusSnapshot, generatedAt: String = iTuDateSupport.string(from: Date())) {
            status = focus.status.rawValue
            phase = focus.phase.rawValue
            plannedSeconds = focus.plannedSeconds
            startedAt = focus.startedAt
            pausedAt = focus.pausedAt
            accumulatedPauseSeconds = focus.accumulatedPauseSeconds
            self.generatedAt = generatedAt
        }
    }
}

enum IOSFocusLiveActivityCoordinator {
    @available(iOS 16.1, *)
    private enum PendingUpdate {
        case focus(WidgetFocusSnapshot)
        case end
    }

    @available(iOS 16.1, *)
    private actor UpdateQueue {
        private var pending: PendingUpdate?
        private var running = false
        private var ending = false
        private var epoch: UInt64 = 0
        private var waiters: [CheckedContinuation<Void, Never>] = []

        func enqueue(_ focus: WidgetFocusSnapshot?, epoch requestedEpoch: UInt64) async {
            guard !ending, requestedEpoch == epoch else { return }
            pending = focus.map(PendingUpdate.focus) ?? .end
            await drain()
        }

        func endAll(epoch requestedEpoch: UInt64) async {
            epoch = requestedEpoch
            ending = true
            pending = .end
            if running {
                await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                    waiters.append(continuation)
                }
            } else {
                await drain()
            }
            ending = false
        }

        private func drain() async {
            guard !running else { return }
            running = true
            while let update = pending {
                pending = nil
                switch update {
                case let .focus(focus): await IOSFocusLiveActivityCoordinator.syncAvailable(focus)
                case .end: await IOSFocusLiveActivityCoordinator.syncAvailable(nil)
                }
            }
            running = false
            let completedWaiters = waiters
            waiters.removeAll()
            completedWaiters.forEach { $0.resume() }
        }
    }

    @available(iOS 16.1, *)
    private static let updateQueue = UpdateQueue()
    @MainActor private static var updateEpoch: UInt64 = 0

    @MainActor
    static func sync(_ focus: WidgetFocusSnapshot?) {
        guard #available(iOS 16.1, *) else { return }
        let epoch = updateEpoch
        Task { await updateQueue.enqueue(focus, epoch: epoch) }
    }

    @MainActor
    static func endAll() async {
        guard #available(iOS 16.1, *) else { return }
        updateEpoch &+= 1
        await updateQueue.endAll(epoch: updateEpoch)
    }

    @available(iOS 16.1, *)
    private static func syncAvailable(_ focus: WidgetFocusSnapshot?) async {
        let activities = Activity<FocusActivityAttributes>.activities
        guard let focus else {
            for activity in activities {
                if #available(iOS 16.2, *) {
                    await activity.end(ActivityContent(state: activity.content.state, staleDate: nil), dismissalPolicy: .immediate)
                } else {
                    await activity.end(using: activity.contentState, dismissalPolicy: .immediate)
                }
            }
            return
        }
        let now = Date()
        let state = FocusActivityAttributes.ContentState(
            focus: focus,
            generatedAt: iTuDateSupport.string(from: now)
        )
        let staleDate = focus.deadline(at: now)
        if let activity = activities.first(where: { $0.attributes.sessionID == focus.id }) {
            if #available(iOS 16.2, *) {
                await activity.update(ActivityContent(state: state, staleDate: staleDate))
            } else {
                await activity.update(using: state)
            }
            return
        }
        for activity in activities {
            if #available(iOS 16.2, *) {
                await activity.end(ActivityContent(state: activity.content.state, staleDate: nil), dismissalPolicy: .immediate)
            } else {
                await activity.end(using: activity.contentState, dismissalPolicy: .immediate)
            }
        }
        let attributes = FocusActivityAttributes(sessionID: focus.id, title: focus.title)
        do {
            if #available(iOS 16.2, *) {
                _ = try Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: staleDate), pushType: nil)
            } else {
                _ = try Activity.request(attributes: attributes, contentState: state, pushType: nil)
            }
        } catch {
            // Activities are optional UI; local focus remains authoritative.
        }
    }
}
