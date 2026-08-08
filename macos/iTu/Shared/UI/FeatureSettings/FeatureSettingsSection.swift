import SwiftUI

/// A titled group of settings rows inside a feature settings popover.
struct FeatureSettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkFaint)
            content()
        }
    }
}
