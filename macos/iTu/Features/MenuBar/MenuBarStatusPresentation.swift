import AppKit
import SwiftUI

struct MenuBarStatusSnapshot: Equatable {
    enum Layout: Equatable {
        case idle
        case focus
        case shortBreak
        case longBreak
        case pendingFocus
        case pendingShortBreak
        case pendingLongBreak
    }

    let layout: Layout
    let title: String
    let progressStep: Int
    let isPaused: Bool
    let isOvertime: Bool
    let isVisible: Bool
    let accessibilityLabel: String
    let appearance: MenuBarAppearance
    let phase: FocusPhase?
    let progressFraction: Double

    var progress: Double {
        progressFraction
    }
}

enum MenuBarStatusPresentation {
    @MainActor
    static func snapshot(
        model: AppModel,
        appearance: MenuBarAppearance
    ) -> MenuBarStatusSnapshot {
        let isVisible = model.settingsStore.focusSettings.showMenuBarItem
        let timer = model.focusTimer

        if let session = timer.activeSession {
            let progress = min(max(timer.progressFraction, 0), 1)
            let isOvertime = timer.displaySeconds < 0
            let isPaused = timer.isPaused
            let rawTitle = timer.currentTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = rawTitle.isEmpty ? "Focus" : rawTitle
            let percent = Int((progress * 100).rounded())

            let step: Int
            if progress >= 1.0 {
                step = 50
            } else {
                step = Int(floor(progress * 50))
            }

            switch session.phase {
            case .work:
                let accessibilityLabel: String
                if isOvertime {
                    accessibilityLabel = "Focus overtime, \(title)"
                } else if isPaused {
                    accessibilityLabel = "Focus paused, \(title), \(percent) percent complete"
                } else {
                    accessibilityLabel = "Focus, \(title), \(percent) percent complete"
                }

                return MenuBarStatusSnapshot(
                    layout: .focus,
                    title: title,
                    progressStep: step,
                    isPaused: isPaused,
                    isOvertime: isOvertime,
                    isVisible: isVisible,
                    accessibilityLabel: accessibilityLabel,
                    appearance: appearance,
                    phase: .work,
                    progressFraction: progress
                )

            case .shortBreak:
                let accessibilityLabel = isPaused
                    ? "Short break paused, \(percent) percent complete"
                    : "Short break, \(percent) percent complete"

                return MenuBarStatusSnapshot(
                    layout: .shortBreak,
                    title: "",
                    progressStep: step,
                    isPaused: isPaused,
                    isOvertime: isOvertime,
                    isVisible: isVisible,
                    accessibilityLabel: accessibilityLabel,
                    appearance: appearance,
                    phase: .shortBreak,
                    progressFraction: progress
                )

            case .longBreak:
                let accessibilityLabel = isPaused
                    ? "Long break paused, \(percent) percent complete"
                    : "Long break, \(percent) percent complete"

                return MenuBarStatusSnapshot(
                    layout: .longBreak,
                    title: "",
                    progressStep: step,
                    isPaused: isPaused,
                    isOvertime: isOvertime,
                    isVisible: isVisible,
                    accessibilityLabel: accessibilityLabel,
                    appearance: appearance,
                    phase: .longBreak,
                    progressFraction: progress
                )
            }
        } else if timer.isBreakPending {
            let pendingPhase = model.focusCycleEngine.nextPhase
            let layout: MenuBarStatusSnapshot.Layout = (pendingPhase == .longBreak) ? .pendingLongBreak : .pendingShortBreak
            let phase: FocusPhase = (pendingPhase == .longBreak) ? .longBreak : .shortBreak
            let accessName = phase == .longBreak ? "Long break" : "Short break"

            return MenuBarStatusSnapshot(
                layout: layout,
                title: "",
                progressStep: 0,
                isPaused: false,
                isOvertime: false,
                isVisible: isVisible,
                accessibilityLabel: "\(accessName) ready",
                appearance: appearance,
                phase: phase,
                progressFraction: 0.0
            )
        } else if timer.isWorkPending {
            return MenuBarStatusSnapshot(
                layout: .pendingFocus,
                title: "",
                progressStep: 0,
                isPaused: false,
                isOvertime: false,
                isVisible: isVisible,
                accessibilityLabel: "Focus session ready",
                appearance: appearance,
                phase: .work,
                progressFraction: 0.0
            )
        } else {
            return MenuBarStatusSnapshot(
                layout: .idle,
                title: "",
                progressStep: 0,
                isPaused: false,
                isOvertime: false,
                isVisible: isVisible,
                accessibilityLabel: "iTu Focus ready",
                appearance: appearance,
                phase: nil,
                progressFraction: 0.0
            )
        }
    }
}
