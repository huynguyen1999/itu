import SwiftUI

struct MenuBarPhaseStyle {
    let accent: Color
    let centerSymbolName: String?
    let accessibilityName: String
}

extension FocusPhase {
    var menuBarStyle: MenuBarPhaseStyle {
        switch self {
        case .work:
            MenuBarPhaseStyle(
                accent: iTuTheme.teal,
                centerSymbolName: nil,
                accessibilityName: "Focus"
            )

        case .shortBreak:
            MenuBarPhaseStyle(
                accent: iTuTheme.amber,
                centerSymbolName: "cup.and.saucer.fill",
                accessibilityName: "Short break"
            )

        case .longBreak:
            MenuBarPhaseStyle(
                accent: iTuTheme.coral,
                centerSymbolName: "moon.fill",
                accessibilityName: "Long break"
            )
        }
    }
}

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
            HStack(spacing: 4) {
                Text(timer.currentTitle)
                    .font(.system(size: 9))
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: 140, alignment: .trailing)

                progressIcon(progressFraction: progress, isPaused: timer.isPaused, isOvertime: isOvertime, phase: phase)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabelForActive(style: style, isPaused: timer.isPaused, isOvertime: isOvertime, progress: progress))

        case .shortBreak, .longBreak:
            progressIcon(progressFraction: progress, isPaused: timer.isPaused, isOvertime: isOvertime, phase: phase)
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

private struct CircularProgressIconView: View {
    let progressFraction: Double
    let isPaused: Bool
    let isOvertime: Bool
    let phase: FocusPhase

    private var style: MenuBarPhaseStyle {
        phase.menuBarStyle
    }

    private var visibleProgress: Double {
        min(max(progressFraction, 0), 1)
    }

    var body: some View {
        ZStack {
            // Subtle center fill
            Circle()
                .fill(style.accent.opacity(isPaused ? 0.16 : 0.08))

            // Background track
            Circle()
                .stroke(
                    iTuTheme.inkFaint.opacity(0.5),
                    lineWidth: 2.0
                )

            // Active progress ring
            Circle()
                .trim(from: 0, to: max(visibleProgress, 0.004))
                .stroke(
                    style.accent,
                    style: StrokeStyle(
                        lineWidth: 2.5,
                        lineCap: .round
                    )
                )
                .rotationEffect(.degrees(-90))

            centerContent
        }
        .frame(width: 18, height: 18)
    }

    @ViewBuilder
    private var centerContent: some View {
        if isPaused {
            PauseIndicator(color: style.accent)
        } else if isOvertime && phase == .work {
            Image(systemName: "plus")
                .font(.system(size: 7, weight: .bold))
                .foregroundStyle(style.accent)
        } else if let symbolName = style.centerSymbolName {
            if phase == .shortBreak {
                Image(systemName: symbolName)
                    .font(.system(size: 6, weight: .semibold))
                    .foregroundStyle(style.accent)
            } else {
                Image(systemName: symbolName)
                    .font(.system(size: 7, weight: .semibold))
                    .foregroundStyle(style.accent)
            }
        } else if visibleProgress >= 0.998 {
            Circle()
                .fill(style.accent)
                .frame(width: 4, height: 4)
        }
    }
}

private struct PauseIndicator: View {
    let color: Color

    var body: some View {
        HStack(spacing: 1.5) {
            Capsule()
                .fill(color)
                .frame(width: 2, height: 6)

            Capsule()
                .fill(color)
                .frame(width: 2, height: 6)
        }
    }
}

@MainActor
final class MenuBarIconCache {
    static let shared = MenuBarIconCache()

    private var cache: [String: NSImage] = [:]

    func icon(
        progressFraction: Double,
        isPaused: Bool,
        isOvertime: Bool,
        phase: FocusPhase,
        colorScheme: ColorScheme
    ) -> NSImage {
        let clampedProgress = min(max(progressFraction, 0), 1)

        let steppedProgress: Double
        if clampedProgress >= 1.0 {
            steppedProgress = 1.0
        } else {
            steppedProgress = floor(clampedProgress * 50) / 50
        }

        let key = [
            String(Int((steppedProgress * 100).rounded())),
            phase.rawValue,
            isPaused ? "paused" : "running",
            isOvertime ? "overtime" : "normal",
            colorScheme == .dark ? "dark" : "light"
        ].joined(separator: "_")

        if let cachedImage = cache[key] {
            return cachedImage
        }

        let view = CircularProgressIconView(
            progressFraction: steppedProgress,
            isPaused: isPaused,
            isOvertime: isOvertime,
            phase: phase
        )
        .environment(\.colorScheme, colorScheme)
        .padding(1)

        let renderer = ImageRenderer(content: view)
        renderer.scale = 2

        guard let image = renderer.nsImage else {
            return NSImage(
                systemSymbolName: "circle",
                accessibilityDescription: nil
            ) ?? NSImage()
        }

        image.size = NSSize(width: 18, height: 18)
        image.isTemplate = false

        cache[key] = image
        return image
    }
}
