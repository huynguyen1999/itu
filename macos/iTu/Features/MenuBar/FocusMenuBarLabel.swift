import SwiftUI

struct FocusMenuBarLabel: View {
    @Environment(\.colorScheme) private var colorScheme

    let timer: FocusTimer
    var pendingPhase: FocusPhase? = nil

    var body: some View {
        if let session = timer.activeSession {
            activeLabel(for: session.phase)
        } else if let pendingPhase {
            pendingLabel(for: pendingPhase)
        } else {
            idleLabel
        }
    }

    @ViewBuilder
    private func activeLabel(for phase: FocusPhase) -> some View {
        let progress = min(max(timer.progressFraction, 0), 1)
        let isOvertime = timer.displaySeconds < 0
        let style = phase.menuBarStyle

        switch phase {
        case .work:
            HStack(spacing: 6) {
                Text("\(timer.currentTitle) • \(timer.formattedRemaining)")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: 160, alignment: .trailing)

                progressIcon(progressFraction: progress, isPaused: timer.isPaused, isOvertime: isOvertime, phase: phase)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabelForActive(style: style, isPaused: timer.isPaused, isOvertime: isOvertime, progress: progress))

        case .shortBreak, .longBreak:
            HStack(spacing: 6) {
                Text(timer.formattedRemaining)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                progressIcon(progressFraction: progress, isPaused: timer.isPaused, isOvertime: isOvertime, phase: phase)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabelForActive(style: style, isPaused: timer.isPaused, isOvertime: isOvertime, progress: progress))
        }
    }

    private func accessibilityLabelForActive(style: MenuBarPhaseStyle, isPaused: Bool, isOvertime: Bool, progress: Double) -> String {
        let percent = Int((progress * 100).rounded())
        if style.centerSymbolName == nil {
            let title = timer.currentTitle
            if isOvertime {
                return "Focus overtime, \(title)"
            } else if isPaused {
                return "Focus paused, \(title), \(percent) percent complete"
            } else {
                return "Focus, \(title), \(percent) percent complete"
            }
        } else {
            if isPaused {
                return "\(style.accessibilityName) paused, \(percent) percent complete"
            } else {
                return "\(style.accessibilityName), \(percent) percent complete"
            }
        }
    }

    @ViewBuilder
    private func pendingLabel(for phase: FocusPhase) -> some View {
        let style = phase.menuBarStyle
        switch phase {
        case .work:
            progressIcon(progressFraction: 0, isPaused: false, isOvertime: false, phase: phase)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Focus session ready")
        case .shortBreak, .longBreak:
            progressIcon(progressFraction: 0, isPaused: false, isOvertime: false, phase: phase)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(style.accessibilityName) ready")
        }
    }

    private var idleLabel: some View {
        Image(systemName: "checkmark.circle")
            .accessibilityLabel("iTu Focus ready")
    }

    private func progressIcon(progressFraction: Double, isPaused: Bool, isOvertime: Bool, phase: FocusPhase) -> some View {
        let icon = MenuBarIconCache.shared.icon(
            progressFraction: progressFraction,
            isPaused: isPaused,
            isOvertime: isOvertime,
            phase: phase,
            colorScheme: colorScheme
        )
        return Image(nsImage: icon)
            .renderingMode(.original)
            .frame(width: 18, height: 18)
    }
}
