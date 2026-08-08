import Foundation
import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    static let companionWindow = Self("companionWindow", default: .init(.space, modifiers: [.option]))
}

@MainActor
final class GlobalShortcutService {
    static let shared = GlobalShortcutService()

    private init() {}

    func setup(onKeyUp: @escaping () -> Void) {
        KeyboardShortcuts.onKeyUp(for: .companionWindow) {
            onKeyUp()
        }
    }
}
