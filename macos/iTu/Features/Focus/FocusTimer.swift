import Foundation
import Observation

enum TimerMode: String, CaseIterable, Identifiable {
    case focus
    case shortBreak
    case longBreak

    var id: String { rawValue }

    var title: String {
        switch self {
        case .focus: "Focus"
        case .shortBreak: "Short break"
        case .longBreak: "Long break"
        }
    }

    var defaultMinutes: Int {
        switch self {
        case .focus: 30
        case .shortBreak: 5
        case .longBreak: 15
        }
    }

    var phase: FocusPhase {
        switch self {
        case .focus: .work
        case .shortBreak: .shortBreak
        case .longBreak: .longBreak
        }
    }
}

@MainActor
@Observable
final class FocusTimer {
    var timerMode: TimerMode = .focus
    var selectedMinutes = 30
    var selectedDurationSeconds = 1800
    var customTitle: String = ""
    var selectedTagIds: Set<String> = []
    var linkedTask: ProductivityTask?
    var activeSession: FocusSession?
    var history: [FocusSession] = []
    var summary = FocusSummary()
    var isLoading = false
    var isMutating = false
    var errorMessage: String?
    var countExceededFocusTime = true
    var overtimeEnabled: Bool {
        get { countExceededFocusTime }
        set { countExceededFocusTime = newValue }
    }
    var finishSoundEnabled = true
    var desktopNotificationEnabled = true
    var compactAudio = true

    var pendingPhase: FocusPhase = .work
    var isBreakPending: Bool = false
    var isWorkPending: Bool = false

    var currentTitle: String {
        if let title = activeSession?.customTitle, !title.isEmpty {
            return title
        }
        if let title = activeSession?.taskTitleSnapshot, !title.isEmpty {
            return title
        }
        if let title = linkedTask?.title, !title.isEmpty {
            return title
        }
        if !customTitle.isEmpty {
            return customTitle
        }
        let phase = activeSession?.phase ?? pendingPhase
        return phase == .work ? "Focus" : (phase == .shortBreak ? "Short break" : "Long break")
    }

    private var now = Date()
    private var ticker: Task<Void, Never>?
    private var notificationFiredSessionID: String? = UserDefaults.standard.string(forKey: "iTu.FocusNotificationFiredSessionID")

    init() {
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                self?.now = Date()
                self?.evaluateAutoCompletionAndNotification()
            }
        }
    }

    var isRunning: Bool {
        activeSession?.status == .active
    }

    var isPaused: Bool {
        activeSession?.status == .paused
    }

    var elapsedSeconds: Int {
        guard let session = activeSession else { return 0 }
        let endDate = session.pausedAt.flatMap(Self.parseDate) ?? now
        guard let startDate = Self.parseDate(session.startedAt) else { return 0 }
        let diff = endDate.timeIntervalSince(startDate)
        guard diff.isFinite && diff > 0 && diff < 86400000 else { return 0 }
        return max(0, Int(diff) - max(0, session.accumulatedPauseSecs))
    }

    var displaySeconds: Int {
        guard let session = activeSession else { return selectedDurationSeconds }
        if session.mode == .stopwatch {
            return elapsedSeconds
        }
        let remaining = (session.plannedSeconds ?? 0) - elapsedSeconds
        if session.phase == .work {
            return countExceededFocusTime ? remaining : max(0, remaining)
        } else {
            // Breaks never enter overtime
            return max(0, remaining)
        }
    }

    var formattedRemaining: String {
        let display = displaySeconds
        let seconds = display < 0 ? (display == Int.min ? Int.max : -display) : display
        let prefix = display < 0 ? "+" : ""
        return String(format: "%@%02d:%02d", prefix, seconds / 60, seconds % 60)
    }

    var progressFraction: Double {
        if isBreakPending || isWorkPending { return 1.0 }
        guard let session = activeSession else { return 0 }
        if displaySeconds <= 0 { return 1.0 }
        let total = max(1, session.plannedSeconds ?? selectedDurationSeconds)
        return min(1, max(0, Double(elapsedSeconds) / Double(total)))
    }

    var completedSessionsCount: Int {
        summary.completedSessions
    }

    var totalFocusedMinutes: Int {
        summary.focusedSeconds / 60
    }

    var todayCompletedSessionsCount: Int {
        history.filter {
            $0.phase == .work
                && $0.status == .completed
                && Self.parseDate($0.adjustedStartedAt ?? $0.startedAt).map(Calendar.current.isDateInToday) == true
        }.count
    }

    var todayFocusedMinutes: Int {
        history
            .filter {
                $0.phase == .work
                    && $0.status == .completed
                    && Self.parseDate($0.adjustedStartedAt ?? $0.startedAt).map(Calendar.current.isDateInToday) == true
            }
            .reduce(0) { total, session in
                let startValue = session.adjustedStartedAt ?? session.startedAt
                let endValue = session.adjustedCompletedAt ?? session.completedAt ?? startValue
                guard let start = Self.parseDate(startValue), let end = Self.parseDate(endValue) else {
                    return total
                }
                let diff = end.timeIntervalSince(start)
                guard diff.isFinite && diff > 0 && diff < 86400000 else { return total }
                let mins = max(0, Int(diff) - max(0, session.accumulatedPauseSecs)) / 60
                return total &+ mins
            }
    }

    func setMode(_ mode: TimerMode) {
        guard activeSession == nil else { return }
        timerMode = mode
        selectedMinutes = mode.defaultMinutes
        selectedDurationSeconds = mode.defaultMinutes * 60
    }

    func setDuration(minutes: Int) {
        guard activeSession == nil else { return }
        selectedMinutes = minutes
        selectedDurationSeconds = minutes * 60
    }

    func setExactDuration(seconds: Int) {
        guard activeSession == nil else { return }
        selectedDurationSeconds = max(1, seconds)
        selectedMinutes = max(1, selectedDurationSeconds / 60)
    }

    func configure(settings: FocusSettings) {
        countExceededFocusTime = settings.countExceededFocusTime
        finishSoundEnabled = settings.finishSoundEnabled
        desktopNotificationEnabled = settings.desktopNotificationEnabled
        compactAudio = settings.compactAudio
        if activeSession == nil {
            selectedMinutes = max(1, settings.defaultWorkMinutes)
            selectedDurationSeconds = selectedMinutes * 60
        }
    }

    func apply(active: FocusSession?) {
        if active?.id != activeSession?.id {
            notificationFiredSessionID = nil
        }
        activeSession = active
        if let active {
            selectedMinutes = max(1, (active.plannedSeconds ?? 60) / 60)
        }
    }

    func startOptimisticSession(
        phase: FocusPhase,
        plannedSeconds: Int,
        taskId: String?,
        customTitle: String?,
        idempotencyKey: String?
    ) -> FocusSession {
        isBreakPending = false
        isWorkPending = false
        let session = FocusSession.optimistic(
            id: UUID().uuidString,
            task: linkedTask,
            phase: phase,
            plannedSeconds: plannedSeconds,
            startedAt: ISO8601DateFormatter().string(from: Date())
        )
        var mutableSession = session
        mutableSession.taskId = taskId ?? linkedTask?.id
        mutableSession.customTitle = customTitle
        activeSession = mutableSession
        return mutableSession
    }

    func pauseActiveSession() {
        guard var session = activeSession, session.status == .active else { return }
        session.status = .paused
        session.pausedAt = ISO8601DateFormatter().string(from: Date())
        activeSession = session
    }

    func resumeActiveSession() {
        guard var session = activeSession, session.status == .paused else { return }
        if let pausedAtStr = session.pausedAt, let pausedDate = Self.parseDate(pausedAtStr) {
            let pauseDuration = Int(Date().timeIntervalSince(pausedDate))
            session.accumulatedPauseSecs += max(0, pauseDuration)
        }
        session.status = .active
        session.pausedAt = nil
        activeSession = session
    }

    func completeActiveSession() -> FocusSession? {
        guard var session = activeSession else { return nil }
        session.status = .completed
        session.completedAt = ISO8601DateFormatter().string(from: Date())
        if session.phase == .work {
            history.append(session)
        } else {
            // Completed breaks appear in history
            history.append(session)
        }
        activeSession = nil
        return session
    }

    func abandonActiveSession() -> FocusSession? {
        guard var session = activeSession else { return nil }
        session.status = .abandoned
        session.completedAt = ISO8601DateFormatter().string(from: Date())
        if session.phase == .work {
            history.append(session)
        }
        activeSession = nil
        return session
    }

    private func evaluateAutoCompletionAndNotification() {
        guard let session = activeSession, session.status == .active, session.mode == .countdown else { return }

        let remaining = displaySeconds
        if remaining <= 0 {
            deliverCompletionNotificationIfNeeded()

            if session.phase == .work {
                if !countExceededFocusTime {
                    // Disabled overtime -> auto complete work session once, audio continues
                    _ = completeActiveSession()
                    isBreakPending = true
                }
            } else {
                // Break phases always end at 00:00 -> auto complete break session
                _ = completeActiveSession()
                isWorkPending = true
            }
        }
    }

    private func deliverCompletionNotificationIfNeeded() {
        guard let session = activeSession,
              Self.shouldDeliverCompletionNotification(
                enabled: desktopNotificationEnabled,
                session: session,
                displaySeconds: displaySeconds,
                firedSessionID: notificationFiredSessionID
              ) else { return }

        notificationFiredSessionID = session.id
        UserDefaults.standard.set(session.id, forKey: "iTu.FocusNotificationFiredSessionID")
        let taskTitle = session.customTitle ?? session.taskTitleSnapshot ?? (session.phase == .work ? "Focus Session" : "Break")
        SystemNotificationManager.shared.deliver(
            title: session.phase == .work ? "Focus Timer Complete! 🎯" : "Break Complete! ☕️",
            body: "\(taskTitle) is complete.",
            identifier: "focus-complete-\(session.id)"
        )
    }

    static func shouldDeliverCompletionNotification(
        enabled: Bool,
        session: FocusSession,
        displaySeconds: Int,
        firedSessionID: String?
    ) -> Bool {
        enabled
            && session.status == .active
            && session.mode == .countdown
            && displaySeconds <= 0
            && firedSessionID != session.id
    }

    static func parseDate(_ value: String) -> Date? {
        let formatterWithFractional = ISO8601DateFormatter()
        formatterWithFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatterWithFractional.date(from: value) {
            return date
        }
        let standardFormatter = ISO8601DateFormatter()
        return standardFormatter.date(from: value)
    }
}
