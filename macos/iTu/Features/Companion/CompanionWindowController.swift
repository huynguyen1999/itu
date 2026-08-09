import SwiftUI
import AppKit

@MainActor
final class CompanionWindowController {
    private let model: AppModel
    private let router: AppNavigationRouter
    private var panel: CompanionPanel?
    private var viewModel: CompanionViewModel?

    init(model: AppModel, router: AppNavigationRouter) {
        self.model = model
        self.router = router
    }

    func showOrFocus() {
        if panel == nil {
            let initialRect = NSRect(x: 0, y: 0, width: 650, height: 520)
            let panel = CompanionPanel(contentRect: initialRect)
            
            let viewModel = CompanionViewModel(model: model, router: router) { [weak self] in
                self?.hide()
            }
            self.viewModel = viewModel
            let hostedView = CompanionView(viewModel: viewModel)
                .environment(model)
            let hostingController = NSHostingController(rootView: hostedView)
            
            panel.contentViewController = hostingController
            panel.onEscape = { [weak self] in
                guard let self else { return }
                if self.viewModel?.handleEscape() != true { self.hide() }
            }
            panel.onCommandW = { [weak self] in
                self?.hide()
            }
            panel.onCommandComma = { [weak self] in
                self?.hide()
                self?.router.openSettings()
            }

            NotificationCenter.default.addObserver(
                forName: NSWindow.didResignKeyNotification,
                object: panel,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.hide()
                }
            }
            
            self.panel = panel
        }
        
        guard let panel = self.panel else { return }

        viewModel?.prepareForPresentation()
        
        panel.level = model.settingsStore.companionKeepAbove ? .floating : .normal
        
        if model.settingsStore.companionRememberPosition {
            CompanionPositioning.restorePosition(for: panel)
        } else {
            CompanionPositioning.positionAtDefaultCenter(panel: panel)
        }
        
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func hide() {
        guard let panel = panel else { return }
        viewModel?.prepareForDismissal()
        if model.settingsStore.companionRememberPosition {
            CompanionPositioning.savePosition(for: panel)
        }
        panel.orderOut(nil)
    }

    func toggle() {
        if let panel = panel, panel.isVisible, panel.isKeyWindow {
            hide()
        } else {
            showOrFocus()
        }
    }

    func resetPosition() {
        UserDefaults.standard.removeObject(forKey: "iTu_CompanionWindowFrame")
        if let panel = panel {
            CompanionPositioning.positionAtDefaultCenter(panel: panel)
        }
    }
}
