import SwiftUI

struct MenuBarPopoverRootView: View {
    let model: AppModel
    let onOpenMainWindow: @MainActor () -> Void

    var body: some View {
        MenuBarView(onOpenMainWindow: onOpenMainWindow)
            .environment(model)
            .preferredColorScheme(.dark)
    }
}
