import Foundation
import Observation

@MainActor
@Observable
final class FocusCycleEngine {
    private(set) var currentCycle: Int = 1
    private(set) var completedWorkCount: Int = 0

    var cyclesBeforeLongBreak: Int = 4

    func configure(cyclesBeforeLongBreak: Int) {
        self.cyclesBeforeLongBreak = max(1, min(20, cyclesBeforeLongBreak))
    }

    var nextPhase: FocusPhase {
        if completedWorkCount >= cyclesBeforeLongBreak {
            return .longBreak
        } else {
            return .shortBreak
        }
    }

    var cycleProgressString: String {
        "\(completedWorkCount)/\(cyclesBeforeLongBreak)"
    }

    func handleSessionCompleted(phase: FocusPhase, isManual: Bool) {
        switch phase {
        case .work:
            completedWorkCount += 1
            if completedWorkCount >= cyclesBeforeLongBreak {
                // Completed work cycle reached
                currentCycle = cyclesBeforeLongBreak
            } else {
                currentCycle = completedWorkCount + 1
            }

        case .shortBreak:
            // Completed short break does not change work count
            break

        case .longBreak:
            // Completed long break resets cycle
            resetCycle()
        }
    }

    func handleSessionAbandoned(phase: FocusPhase) {
        // Abandoned work or break sessions do not increment cycle progress
    }

    func handleManualShortBreakStarted() {
        // Manual short break leaves cycle progress unchanged
    }

    func handleManualLongBreakStarted() {
        // Manual long break leaves cycle progress unchanged (only scheduled long break completion or explicit reset clears cycle)
    }

    func skipScheduledBreak() {
        if nextPhase == .longBreak {
            resetCycle()
        }
    }

    func resetCycle() {
        completedWorkCount = 0
        currentCycle = 1
    }
}
