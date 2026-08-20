import Foundation
import UIKit
import iTuDomain

@MainActor
extension AppModel {
    var appUpdateOptionalPolicy: AppUpdatePolicy? {
        appUpdateCoordinator.optionalUpdate
    }

    var appUpdateRequiresUpdate: Bool {
        appUpdateCoordinator.requiresUpdate
    }

    func checkAppUpdateIfNeeded() async {
        await appUpdateCoordinator.checkIfNeeded()
        syncAppUpdateState()
    }

    func checkAppUpdateManually() async {
        await appUpdateCoordinator.checkManually()
        syncAppUpdateState()
    }

    func dismissOptionalAppUpdate() {
        appUpdateCoordinator.dismissOptionalUpdate()
        syncAppUpdateState()
    }

    func openAppUpdateURL() {
        guard let url = appUpdatePolicy?.update?.url else { return }
        UIApplication.shared.open(url)
    }

    private func syncAppUpdateState() {
        appUpdateState = appUpdateCoordinator.state
        appUpdatePolicy = appUpdateCoordinator.policy
        appUpdateLastCheckedAt = appUpdateCoordinator.lastCheckedAt
    }
}
