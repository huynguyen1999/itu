import AppKit
import SwiftUI

// MARK: - Right-Click Interceptor Component

struct RightClickDetector: NSViewRepresentable {
    let onRightClick: (CGPoint) -> Void

    func makeNSView(context: Context) -> RightClickHostingView {
        let view = RightClickHostingView()
        view.onRightClick = onRightClick
        view.startMonitoring()
        return view
    }

    func updateNSView(_ nsView: RightClickHostingView, context: Context) {
        nsView.onRightClick = onRightClick
    }

    static func dismantleNSView(_ nsView: RightClickHostingView, coordinator: ()) {
        nsView.stopMonitoring()
    }
}

final class RightClickHostingView: NSView {
    var onRightClick: ((CGPoint) -> Void)?
    private var eventMonitor: Any?

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil {
            stopMonitoring()
        } else {
            startMonitoring()
        }
    }

    func startMonitoring() {
        guard eventMonitor == nil else { return }
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .rightMouseDown) { [weak self] event in
            guard let self, let window, event.window === window else { return event }
            let point = convert(event.locationInWindow, from: nil)
            guard bounds.contains(point) else { return event }
            onRightClick?(event.locationInWindow)
            return event
        }
    }

    func stopMonitoring() {
        guard let eventMonitor else { return }
        NSEvent.removeMonitor(eventMonitor)
        self.eventMonitor = nil
    }

}
