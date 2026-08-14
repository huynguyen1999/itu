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
                        await model.retryCredentialRestorationIfNeeded()
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
            let openMainWindow = { @MainActor in
                NSApp.activate(ignoringOtherApps: true)
                let existingWindow = NSApp.windows.first { w in
                    !(w is NSPanel)
                        && w.className != "NSStatusBarWindow"
                        && w.className != "NSMenuWindow"
                        && (w.title.contains("iTu") || w.identifier?.rawValue.contains("main") == true)
                } ?? NSApp.windows.first { w in
                    !(w is NSPanel)
                        && w.className != "NSStatusBarWindow"
                        && w.className != "NSMenuWindow"
                        && w.canBecomeMain
                }
                
                if let existingWindow {
                    if existingWindow.isMiniaturized {
                        existingWindow.deminiaturize(nil)
                    }
                    existingWindow.makeKeyAndOrderFront(nil)
                    existingWindow.orderFrontRegardless()
                } else {
                    openWindow(id: "main")
                }
            }
            appDelegate.installStatusItem(
                model: model,
                openMainWindow: openMainWindow
            )
            let router = AppNavigationRouter(model: model, openMainWindow: openMainWindow)
            appDelegate.setupCompanion(model: model, router: router)
        }
    }
}

