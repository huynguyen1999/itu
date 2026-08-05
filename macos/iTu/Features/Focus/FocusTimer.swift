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
    var overtimeEnabled = true
    var finishSoundEnabled = true
    var desktopNotificationEnabled = true
    var compactAudio = true

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
        return "Focus"
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
                self?.deliverCompletionNotificationIfNeeded()
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
        return overtimeEnabled ? remaining : max(0, remaining)
    }

    var formattedRemaining: String {
        let display = displaySeconds
        let seconds = display < 0 ? (display == Int.min ? Int.max : -display) : display
        let prefix = display < 0 ? "+" : ""
        return String(format: "%@%02d:%02d", prefix, seconds / 60, seconds % 60)
    }

    var progressFraction: Double {
        guard let session = activeSession else { return 0 }
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
            $0.status == .completed
                && Self.parseDate($0.adjustedStartedAt ?? $0.startedAt).map(Calendar.current.isDateInToday) == true
        }.count
    }

    var todayFocusedMinutes: Int {
        history
            .filter {
                $0.status == .completed
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
        overtimeEnabled = settings.overtimeEnabled
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
        let taskTitle = session.customTitle ?? session.taskTitleSnapshot ?? "Focus Session"
        SystemNotificationManager.shared.deliver(
            title: "Focus Timer Complete! 🎯",
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
