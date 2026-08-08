import Foundation
import AppKit

@MainActor
protocol AppNavigationRouting: Sendable {
    func openMainWindow()
    func openTask(id: String)
    func openFocus()
    func openHabits()
    func openSettings()
}

@MainActor
final class AppNavigationRouter: AppNavigationRouting {
    private let model: AppModel
    private let openMainWindowAction: @MainActor () -> Void

    init(model: AppModel, openMainWindow: @escaping @MainActor () -> Void) {
        self.model = model
        self.openMainWindowAction = openMainWindow
    }

    func openMainWindow() {
        openMainWindowAction()
    }

    func openTask(id: String) {
        openMainWindowAction()
        model.selectedSection = .inbox
        model.presentedOverlay = .taskEditor(taskID: id)
    }

    func openFocus() {
        openMainWindowAction()
        model.selectedSection = .focus
    }

    func openHabits() {
        openMainWindowAction()
        model.selectedSection = .habits
    }

    func openSettings() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
}
