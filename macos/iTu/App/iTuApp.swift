import SwiftUI

@main
@MainActor
struct iTuApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup("iTu", id: "main") {
            RootView()
                .environment(model)
                .modifier(
                    StatusItemInstaller(
                        model: model,
                        appDelegate: appDelegate
                    )
                )
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
}

private struct StatusItemInstaller: ViewModifier {
    @Environment(\.openWindow) private var openWindow
    let model: AppModel
    let appDelegate: AppDelegate

    func body(content: Content) -> some View {
        content.onAppear {
            appDelegate.installStatusItem(
                model: model,
                openMainWindow: {
                    NSApp.activate(ignoringOtherApps: true)
                    openWindow(id: "main")
                }
            )
        }
    }
}


