import AppKit

final class CompanionPanel: NSPanel {
    var onEscape: (() -> Void)?
    var onCommandW: (() -> Void)?
    var onCommandComma: (() -> Void)?

    init(contentRect: NSRect) {
        super.init(
            contentRect: contentRect,
            styleMask: [.borderless, .resizable, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        self.isMovableByWindowBackground = true
        self.hidesOnDeactivate = true
        self.level = .floating
        self.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        self.isReleasedWhenClosed = false
        self.backgroundColor = .clear
        self.hasShadow = true
        self.minSize = NSSize(width: 650, height: 520)
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    override func cancelOperation(_ sender: Any?) {
        onEscape?()
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if event.modifierFlags.contains(.command) {
            if event.charactersIgnoringModifiers == "w" {
                onCommandW?()
                return true
            }
            if event.charactersIgnoringModifiers == "," {
                onCommandComma?()
                return true
            }
        }
        return super.performKeyEquivalent(with: event)
    }
}
