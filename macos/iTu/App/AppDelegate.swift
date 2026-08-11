import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItemController: StatusItemController?
    private(set) var companionWindowController: CompanionWindowController?
    private weak var model: AppModel?

    func installStatusItem(
        model: AppModel,
        openMainWindow: @escaping @MainActor () -> Void
    ) {
        guard statusItemController == nil else { return }
        self.model = model
        let controller = StatusItemController(
            model: model,
            openMainWindow: openMainWindow
        )
        statusItemController = controller
        controller.start()
    }

    func setupCompanion(model: AppModel, router: AppNavigationRouter) {
        guard companionWindowController == nil else { return }
        let controller = CompanionWindowController(model: model, router: router)
        self.companionWindowController = controller

        GlobalShortcutService.shared.setup { [weak controller] in
            guard model.settingsStore.showCompanionShortcut else { return }
            controller?.toggle()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        Task { @MainActor [weak self] in
            guard let model = self?.model else { return }
            await model.flushUsageForLifecycle()
            model.stopUsageTracking()
        }
        statusItemController?.stop()
        statusItemController = nil
        companionWindowController = nil
    }
}
