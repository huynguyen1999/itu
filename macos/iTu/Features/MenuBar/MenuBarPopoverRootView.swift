import SwiftUI

struct MenuBarPopoverRootView: View {
    let model: AppModel
    let onOpenMainWindow: @MainActor () -> Void

    var body: some View {
        Group {
            if model.appUpdateRequiresUpdate, let policy = model.appUpdatePolicy {
                RequiredAppUpdateView(policy: policy) {
                    model.startAppUpdate()
                }
            } else {
                MenuBarView(onOpenMainWindow: onOpenMainWindow)
            }
        }
        .environment(model)
        .preferredColorScheme(.dark)
    }
}
