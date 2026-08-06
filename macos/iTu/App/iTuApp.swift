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
        .windowResizability(.contentSize)
        .defaultSize(width: 1_220, height: 780)

        MenuBarExtra(isInserted: menuBarItemBinding) {
            MenuBarView()
                .environment(model)
                .preferredColorScheme(preferredColorScheme)
        } label: {
            FocusMenuBarLabel(
                timer: model.focusTimer,
                pendingPhase: model.focusTimer.isBreakPending
                    ? model.focusCycleEngine.nextPhase
                    : model.focusTimer.isWorkPending
                        ? .work
                        : nil
            )
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .environment(model)
                .preferredColorScheme(preferredColorScheme)
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

