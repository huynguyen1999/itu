import AppKit
import Observation
import SwiftUI

@MainActor
final class StatusItemController: NSObject, NSPopoverDelegate {
    private let model: AppModel
    private let openMainWindow: @MainActor () -> Void

    private(set) var statusItem: NSStatusItem?
    private let popover = NSPopover()
    private var hostingController: NSHostingController<MenuBarPopoverRootView>?
    private var lastSnapshot: MenuBarStatusSnapshot?
    private var isObserving = false
    private var appearanceObservation: NSKeyValueObservation?

    init(
        model: AppModel,
        openMainWindow: @escaping @MainActor () -> Void
    ) {
        self.model = model
        self.openMainWindow = openMainWindow
        super.init()
    }

    func start() {
        guard statusItem == nil else { return }

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem = item

        configureButton(item.button)

        isObserving = true
        observeModel()

        appearanceObservation = item.button?.observe(\.effectiveAppearance, options: [.new]) { [weak self] _, _ in
            Task { @MainActor in
                guard let self, self.currentAppearance() != self.lastSnapshot?.appearance else { return }
                self.updateStatusItem(force: true)
            }
        }

        updateStatusItem(force: true)
    }

    func stop() {
        isObserving = false
        appearanceObservation?.invalidate()
        appearanceObservation = nil

        if popover.isShown {
            popover.close()
        }
        hostingController = nil

        if let statusItem {
            NSStatusBar.system.removeStatusItem(statusItem)
        }
        statusItem = nil
        lastSnapshot = nil
    }

    private func configureButton(_ button: NSStatusBarButton?) {
        guard let button else { return }
        button.target = self
        button.action = #selector(togglePopover)
        button.sendAction(on: [.leftMouseUp])
        button.imageScaling = .scaleProportionallyDown
        button.cell?.usesSingleLineMode = true
        button.cell?.lineBreakMode = .byTruncatingTail
    }

    private func currentAppearance() -> MenuBarAppearance {
        guard let button = statusItem?.button else { return .light }
        let match = button.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua])
        return match == .darkAqua ? .dark : .light
    }

    func updateStatusItem(force: Bool) {
        guard let statusItem else { return }

        let appearance = currentAppearance()
        let snapshot = MenuBarStatusPresentation.snapshot(model: model, appearance: appearance)

        guard force || snapshot != lastSnapshot else { return }
        lastSnapshot = snapshot

        AppPerformanceSignposts.recordStatusUpdate()

        statusItem.isVisible = snapshot.isVisible
        if !snapshot.isVisible {
            if popover.isShown {
                popover.close()
            }
            return
        }

        guard let button = statusItem.button else { return }

        switch snapshot.layout {
        case .focus:
            let font = button.font ?? NSFont.systemFont(ofSize: NSFont.systemFontSize)
            let displayTitle = snapshot.title + "  "
            button.title = displayTitle
            button.toolTip = snapshot.title

            let icon = MenuBarIconCache.shared.icon(
                progressFraction: snapshot.progress,
                isPaused: snapshot.isPaused,
                isOvertime: snapshot.isOvertime,
                phase: snapshot.phase ?? .work,
                colorScheme: appearance.colorScheme
            )
            button.image = icon
            button.imagePosition = .imageTrailing

            let titleWidth = (displayTitle as NSString).size(withAttributes: [.font: font]).width
            let iconWidth: CGFloat = 18
            let contentSpacing: CGFloat = 8
            let padding: CGFloat = 12
            let calculatedWidth = min(titleWidth, 152) + iconWidth + contentSpacing + padding
            statusItem.length = calculatedWidth

        case .shortBreak, .longBreak, .pendingShortBreak, .pendingLongBreak:
            button.title = ""
            button.toolTip = snapshot.accessibilityLabel

            let phase: FocusPhase = snapshot.phase ?? (snapshot.layout == .longBreak || snapshot.layout == .pendingLongBreak ? .longBreak : .shortBreak)
            let icon = MenuBarIconCache.shared.icon(
                progressFraction: snapshot.progress,
                isPaused: snapshot.isPaused,
                isOvertime: snapshot.isOvertime,
                phase: phase,
                colorScheme: appearance.colorScheme
            )
            button.image = icon
            button.imagePosition = .imageOnly
            statusItem.length = NSStatusItem.squareLength

        case .pendingFocus:
            button.title = ""
            button.toolTip = snapshot.accessibilityLabel

            let icon = MenuBarIconCache.shared.icon(
                progressFraction: 0,
                isPaused: false,
                isOvertime: false,
                phase: .work,
                colorScheme: appearance.colorScheme
            )
            button.image = icon
            button.imagePosition = .imageOnly
            statusItem.length = NSStatusItem.squareLength

        case .idle:
            button.title = ""
            button.toolTip = snapshot.accessibilityLabel

            let icon = NSImage(
                systemSymbolName: "checkmark.circle",
                accessibilityDescription: snapshot.accessibilityLabel
            )
            button.image = icon
            button.imagePosition = .imageOnly
            statusItem.length = NSStatusItem.squareLength
        }
    }

    private func observeModel() {
        guard isObserving else { return }

        withObservationTracking {
            _ = MenuBarStatusPresentation.snapshot(
                model: model,
                appearance: currentAppearance()
            )
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self, self.isObserving else { return }
                self.updateStatusItem(force: false)
                self.observeModel()
            }
        }
    }

    private func ensurePopoverConfigured() {
        guard hostingController == nil else { return }
        let rootView = MenuBarPopoverRootView(
            model: model,
            onOpenMainWindow: { [weak self] in
                self?.popover.close()
                self?.openMainWindow()
            }
        )
        let controller = NSHostingController(rootView: rootView)
        hostingController = controller
        popover.contentViewController = controller
        popover.contentSize = NSSize(width: 320, height: 520)
        popover.behavior = .transient
        popover.delegate = self
    }

    @objc private func togglePopover() {
        guard let button = statusItem?.button, statusItem?.isVisible == true else { return }

        if popover.isShown {
            popover.performClose(nil)
        } else {
            ensurePopoverConfigured()
            updateStatusItem(force: false)
            popover.show(
                relativeTo: button.bounds,
                of: button,
                preferredEdge: .minY
            )
        }
    }

    nonisolated func popoverDidClose(_ notification: Notification) {
        Task { @MainActor in
            self.statusItem?.button?.highlight(false)
        }
    }
}
