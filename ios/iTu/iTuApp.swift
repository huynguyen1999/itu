import SwiftUI

@main
struct iTuApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        IOSHealthBackgroundRefreshCoordinator.shared.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .task {
                    IOSLocalNotificationScheduler.shared.setNavigationHandler { [weak model] destination in
                        model?.requestNavigation(to: destination)
                    }
                    IOSHealthBackgroundRefreshCoordinator.shared.setHandler { [model] in
                        await model.refreshHealthAndWait()
                    }
                    await model.restoreSession()
                    await model.refreshNotificationAuthorization()
                }
                .onOpenURL { url in
                    guard let deepLink = IOSDeepLink(url: url),
                          let destination = IOSDestination(rawValue: deepLink.destinationRawValue) else { return }
                    model.requestNavigation(to: destination)
                }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task {
                await model.reconcileForeground()
                await model.refreshNotificationAuthorization()
                model.refreshHealth()
                IOSHealthBackgroundRefreshCoordinator.shared.scheduleNext()
            }
        }
    }
}
