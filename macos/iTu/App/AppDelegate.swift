import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItemController: StatusItemController?

    func installStatusItem(
        model: AppModel,
        openMainWindow: @escaping @MainActor () -> Void
    ) {
        guard statusItemController == nil else { return }
        let controller = StatusItemController(
            model: model,
            openMainWindow: openMainWindow
        )
        statusItemController = controller
        controller.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        statusItemController?.stop()
        statusItemController = nil
    }
}
