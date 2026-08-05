import SwiftUI

@main
@MainActor
struct iTuApp: App {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup("iTu", id: "main") {
            RootView()
                .environment(model)
                .frame(minWidth: 980, minHeight: 640)
                .task {
                    await model.bootstrap()
                }
                .preferredColorScheme(preferredColorScheme)
                .onOpenURL { url in
                    FocusURLRouter.shared.handleURL(url)
                }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task {
                        await SystemNotificationManager.shared.refreshStatus()
                        if model.user != nil {
                            await model.loadServerState()
                        }
                    }
                }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1_220, height: 780)

        MenuBarExtra(isInserted: menuBarItemBinding) {
            MenuBarView()
                .environment(model)
                .preferredColorScheme(preferredColorScheme)
        } label: {
            FocusMenuBarLabel(
                timer: model.focusTimer,
                displayMode: model.settingsStore.focusSettings.menuBarDisplayMode
            )
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .environment(model)
                .preferredColorScheme(preferredColorScheme)
                .onChange(of: model.settingsStore.focusSettings) { _, settings in
                    model.focusTimer.configure(settings: settings)
                    model.updateFocusPolicy()
                }
        }
    }

    private var preferredColorScheme: ColorScheme? {
        switch model.settingsStore.themeMode {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    private var menuBarItemBinding: Binding<Bool> {
        Binding(
            get: { model.settingsStore.focusSettings.showMenuBarItem },
            set: { isShown in
                var settings = model.settingsStore.focusSettings
                settings.showMenuBarItem = isShown
                model.settingsStore.focusSettings = settings
            }
        )
    }
}
private struct FocusMenuBarLabel: View {
    @Environment(\.colorScheme) private var colorScheme

    let timer: FocusTimer
    let displayMode: MenuBarDisplayMode

    var body: some View {
        if timer.activeSession == nil {
            Image(systemName: "checkmark.circle")
                .accessibilityLabel("iTu Focus ready")
        } else {
            switch displayMode {
            case .remainingTime:
                HStack(spacing: 3) {
                    if timer.isPaused {
                        Image(systemName: "pause.fill")
                    }

                    Text(timer.formattedRemaining)
                        .monospacedDigit()
                }
                .accessibilityLabel(
                    timer.isPaused
                        ? "Focus paused, \(timer.formattedRemaining)"
                        : "Focus, \(timer.formattedRemaining) remaining"
                )

            case .circularProgress:
                let progress = min(max(timer.progressFraction, 0), 1)
                let isOvertime = timer.displaySeconds < 0

                let icon = MenuBarIconCache.shared.icon(
                    progressFraction: progress,
                    isPaused: timer.isPaused,
                    isOvertime: isOvertime,
                    colorScheme: colorScheme
                )

                Image(nsImage: icon)
                    .renderingMode(.original)
                    .frame(width: 18, height: 18)
                    .accessibilityLabel(
                        timer.isPaused ? "Focus paused" : "Focus progress"
                    )
                    .accessibilityValue(
                        Text("\(Int(progress * 100)) percent")
                    )
            }
        }
    }
}

private struct CircularProgressIconView: View {
    let progressFraction: Double
    let isPaused: Bool
    let isOvertime: Bool

    private var progress: Double {
        min(max(progressFraction, 0), 1)
    }

    private var accent: Color {
        isOvertime ? iTuTheme.amber : iTuTheme.teal
    }

    var body: some View {
        ZStack {
            // Subtle center fill prevents the icon looking empty.
            Circle()
                .fill(accent.opacity(isPaused ? 0.16 : 0.08))

            // Background track.
            Circle()
                .stroke(
                    iTuTheme.inkFaint.opacity(0.5),
                    lineWidth: 2.2
                )

            // Active progress ring.
            Circle()
                .trim(
                    from: 0,
                    to: max(progress, 0.004)
                )
                .stroke(
                    accent,
                    style: StrokeStyle(
                        lineWidth: 2.8,
                        lineCap: .round,
                        lineJoin: .round
                    )
                )
                .rotationEffect(.degrees(-90))

            if isPaused {
                PauseIndicator(color: accent)
            } else if progress >= 0.998 {
                // Small completion indicator.
                Circle()
                    .fill(accent)
                    .frame(width: 4.5, height: 4.5)
            }
        }
        .frame(width: 18, height: 18)
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
private final class MenuBarIconCache {
    static let shared = MenuBarIconCache()

    private var cache: [String: NSImage] = [:]

    func icon(
        progressFraction: Double,
        isPaused: Bool,
        isOvertime: Bool,
        colorScheme: ColorScheme
    ) -> NSImage {
        let clampedProgress = min(max(progressFraction, 0), 1)

        // Generate one image for each 2% progress step.
        let steppedProgress =
            (clampedProgress * 50).rounded() / 50

        let key = [
            String(Int(steppedProgress * 100)),
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
            isOvertime: isOvertime
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
