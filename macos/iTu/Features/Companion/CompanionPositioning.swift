import AppKit

struct CompanionPositioning {
    private static let positionKey = "iTu_CompanionWindowFrame"

    static func savePosition(for panel: NSPanel) {
        let frameString = NSStringFromRect(panel.frame)
        UserDefaults.standard.set(frameString, forKey: positionKey)
    }

    static func restorePosition(for panel: NSPanel) {
        if let frameString = UserDefaults.standard.string(forKey: positionKey) {
            let savedFrame = NSRectFromString(frameString)
            
            // Check if savedFrame is visible on any connected screen
            let isVisible = NSScreen.screens.contains { screen in
                screen.frame.intersects(savedFrame)
            }
            
            if isVisible {
                let screenOfFrame = NSScreen.screens.first { $0.frame.intersects(savedFrame) } ?? NSScreen.main
                if let screen = screenOfFrame {
                    let clamped = clampToScreen(frame: savedFrame, screen: screen)
                    panel.setFrame(clamped, display: true)
                    return
                }
            }
        }
        positionAtDefaultCenter(panel: panel)
    }

    static func positionAtDefaultCenter(panel: NSPanel) {
        var targetScreen = NSScreen.main
        let mouseLocation = NSEvent.mouseLocation
        if let screenWithMouse = NSScreen.screens.first(where: { NSMouseInRect(mouseLocation, $0.frame, false) }) {
            targetScreen = screenWithMouse
        }
        
        guard let screen = targetScreen else { return }
        let visibleFrame = screen.visibleFrame
        
        let width: CGFloat = 680
        let height: CGFloat = 450
        let x = visibleFrame.midX - width / 2
        let y = visibleFrame.minY + (visibleFrame.height * 0.15) // bottom-center
        
        panel.setFrame(NSRect(x: x, y: y, width: width, height: height), display: true)
    }

    private static func clampToScreen(frame: NSRect, screen: NSScreen) -> NSRect {
        let visibleFrame = screen.visibleFrame
        var x = frame.origin.x
        var y = frame.origin.y
        let w = min(frame.size.width, visibleFrame.size.width)
        let h = min(frame.size.height, visibleFrame.size.height)
        
        if x < visibleFrame.origin.x {
            x = visibleFrame.origin.x
        } else if x + w > visibleFrame.origin.x + visibleFrame.size.width {
            x = visibleFrame.origin.x + visibleFrame.size.width - w
        }
        
        if y < visibleFrame.origin.y {
            y = visibleFrame.origin.y
        } else if y + h > visibleFrame.origin.y + visibleFrame.size.height {
            y = visibleFrame.origin.y + visibleFrame.size.height - h
        }
        
        return NSRect(x: x, y: y, width: w, height: h)
    }
}
