import Foundation

struct FocusStateResult: Codable, Equatable, Sendable {
    let active: Bool
    let status: String
    let phase: String
    let remainingSeconds: Int
    let elapsedSeconds: Int
    let plannedSeconds: Int
    let title: String
    let taskId: String?
    let isPaused: Bool
    let cycle: Int
    let cyclesBeforeLongBreak: Int
    let nextPhase: String
    let syncStatus: String
}

@MainActor
final class FocusCommandService {
    static let shared = FocusCommandService()

    private init() {}

    private var timer: FocusTimer?
    private var cycleEngine: FocusCycleEngine?
    private var settingsStore: SettingsStore?

    func register(timer: FocusTimer, cycleEngine: FocusCycleEngine, settingsStore: SettingsStore) {
        self.timer = timer
        self.cycleEngine = cycleEngine
        self.settingsStore = settingsStore
    }

    func startFocus(
        customTitle: String? = nil,
        plannedSeconds: Int? = nil,
        taskId: String? = nil,
        tagIds: [String]? = nil,
        presetId: String? = nil,
        policyId: String? = nil,
        idempotencyKey: String? = nil
    ) -> FocusSession {
        guard let timer else {
            fatalError("FocusCommandService not registered")
        }
        let settings = settingsStore?.focusSettings ?? FocusSettings()
        let seconds = plannedSeconds ?? (settings.defaultWorkMinutes * 60)
        timer.setExactDuration(seconds: seconds)
        if let customTitle { timer.customTitle = customTitle }
        if let tagIds { timer.selectedTagIds = Set(tagIds) }
        let session = timer.startOptimisticSession(
            phase: .work,
            plannedSeconds: seconds,
            taskId: taskId,
            customTitle: customTitle,
            idempotencyKey: idempotencyKey
        )
        AudioPlayerManager.shared.playIfEnabled()
        return session
    }

    func startShortBreak(
        plannedSeconds: Int? = nil,
        idempotencyKey: String? = nil
    ) -> FocusSession {
        guard let timer, let cycleEngine else {
            fatalError("FocusCommandService not registered")
        }
        cycleEngine.handleManualShortBreakStarted()
        let settings = settingsStore?.focusSettings ?? FocusSettings()
        let seconds = plannedSeconds ?? (settings.shortBreakMinutes * 60)
        let session = timer.startOptimisticSession(
            phase: .shortBreak,
            plannedSeconds: seconds,
            taskId: nil,
            customTitle: "Short break",
            idempotencyKey: idempotencyKey
        )
        AudioPlayerManager.shared.playIfEnabled()
        return session
    }

    func startLongBreak(
        plannedSeconds: Int? = nil,
        idempotencyKey: String? = nil
    ) -> FocusSession {
        guard let timer, let cycleEngine else {
            fatalError("FocusCommandService not registered")
        }
        cycleEngine.handleManualLongBreakStarted()
        let settings = settingsStore?.focusSettings ?? FocusSettings()
        let seconds = plannedSeconds ?? (settings.longBreakMinutes * 60)
        let session = timer.startOptimisticSession(
            phase: .longBreak,
            plannedSeconds: seconds,
            taskId: nil,
            customTitle: "Long break",
            idempotencyKey: idempotencyKey
        )
        AudioPlayerManager.shared.playIfEnabled()
        return session
    }

    func pause() -> FocusSession? {
        guard let timer else { return nil }
        timer.pauseActiveSession()
        AudioPlayerManager.shared.pause()
        return timer.activeSession
    }

    func resume() -> FocusSession? {
        guard let timer else { return nil }
        timer.resumeActiveSession()
        AudioPlayerManager.shared.playIfEnabled()
        return timer.activeSession
    }

    func complete() -> FocusSession? {
        guard let timer, let cycleEngine else { return nil }
        guard let current = timer.activeSession else { return nil }
        let completed = timer.completeActiveSession()
        cycleEngine.handleSessionCompleted(phase: current.phase, isManual: false)
        AudioPlayerManager.shared.pause()
        return completed
    }

    func abandon() -> FocusSession? {
        guard let timer, let cycleEngine else { return nil }
        guard let current = timer.activeSession else { return nil }
        let abandoned = timer.abandonActiveSession()
        cycleEngine.handleSessionAbandoned(phase: current.phase)
        AudioPlayerManager.shared.pause()
        return abandoned
    }

    func getRemainingSeconds() -> Int {
        timer?.displaySeconds ?? 0
    }

    func getSessionTitle() -> String {
        timer?.currentTitle ?? "Focus"
    }

    func getFocusState() -> FocusStateResult {
        guard let timer, let cycleEngine else {
            return FocusStateResult(
                active: false,
                status: "idle",
                phase: "WORK",
                remainingSeconds: 0,
                elapsedSeconds: 0,
                plannedSeconds: 0,
                title: "Focus",
                taskId: nil,
                isPaused: false,
                cycle: 1,
                cyclesBeforeLongBreak: 4,
                nextPhase: "SHORT_BREAK",
                syncStatus: "up-to-date"
            )
        }

        let session = timer.activeSession
        let settings = settingsStore?.focusSettings ?? FocusSettings()

        return FocusStateResult(
            active: session != nil,
            status: session?.status.rawValue.lowercased() ?? "idle",
            phase: session?.phase.rawValue ?? timer.pendingPhase.rawValue,
            remainingSeconds: timer.displaySeconds,
            elapsedSeconds: timer.elapsedSeconds,
            plannedSeconds: session?.plannedSeconds ?? timer.selectedDurationSeconds,
            title: timer.currentTitle,
            taskId: session?.taskId,
            isPaused: session?.status == .paused,
            cycle: cycleEngine.currentCycle,
            cyclesBeforeLongBreak: settings.cyclesBeforeLongBreak,
            nextPhase: cycleEngine.nextPhase.rawValue,
            syncStatus: "up-to-date"
        )
    }
}
