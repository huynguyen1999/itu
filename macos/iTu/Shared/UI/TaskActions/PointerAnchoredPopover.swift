import AppKit
import SwiftUI

/// Presents an `NSPopover` anchored to the pointer location, either from a screen
/// point (ellipsis click) or a window point (right-click). Transient behavior
/// dismisses it on outside click or Escape.
struct PointerAnchoredPopover<Content: View>: NSViewRepresentable {
    @Binding var isPresented: Bool
    let screenPoint: CGPoint
    let windowPoint: CGPoint?
    let onDismiss: () -> Void
    @ViewBuilder let content: () -> Content

    func makeCoordinator() -> Coordinator {
        Coordinator(onDismiss: onDismiss)
    }

    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        view.isHidden = true
        context.coordinator.hostView = view
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        context.coordinator.onDismiss = onDismiss
        context.coordinator.update(
            isPresented: isPresented,
            screenPoint: screenPoint,
            windowPoint: windowPoint,
            content: content
        )
    }

    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        coordinator.close()
    }

    @MainActor
    final class Coordinator: NSObject, NSPopoverDelegate {
        weak var hostView: NSView?
        var onDismiss: () -> Void
        private var popover: NSPopover?
        private var lastPresentedPoint: CGPoint?
        private var lastPresentedWindowPoint: CGPoint?

        init(onDismiss: @escaping () -> Void) {
            self.onDismiss = onDismiss
        }

        func update<PopoverContent: View>(
            isPresented: Bool,
            screenPoint: CGPoint,
            windowPoint: CGPoint?,
            content: () -> PopoverContent
        ) {
            guard isPresented else {
                close()
                return
            }

            guard let hostView, let contentView = hostView.window?.contentView else { return }

            if let popover, popover.isShown {
                if lastPresentedPoint != screenPoint || lastPresentedWindowPoint != windowPoint {
                    close()
                } else {
                    return
                }
            }

            let hostingController = NSHostingController(rootView: content())
            let nextPopover = NSPopover()
            nextPopover.behavior = .transient
            nextPopover.delegate = self
            nextPopover.contentViewController = hostingController
            nextPopover.contentSize = NSSize(width: 320, height: 300)
            popover = nextPopover
            lastPresentedPoint = screenPoint
            lastPresentedWindowPoint = windowPoint

            let anchorWindowPoint = windowPoint ?? hostView.window?.convertPoint(fromScreen: screenPoint) ?? .zero
            let anchorPoint = contentView.convert(anchorWindowPoint, from: nil)
            nextPopover.show(
                relativeTo: pointerPopoverAnchorRect(at: anchorPoint),
                of: contentView,
                preferredEdge: .maxY
            )
        }

        func close() {
            popover?.performClose(nil)
            popover = nil
            lastPresentedPoint = nil
            lastPresentedWindowPoint = nil
        }

        func popoverDidClose(_ notification: Notification) {
            popover = nil
            lastPresentedPoint = nil
            lastPresentedWindowPoint = nil
            onDismiss()
        }
    }
}

func pointerPopoverAnchorRect(at point: NSPoint) -> NSRect {
    NSRect(origin: point, size: NSSize(width: 1, height: 1))
}
