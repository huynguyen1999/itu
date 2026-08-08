import SwiftUI

/// Shared shell for feature settings panels: title header, divider, and an
/// internally scrolling body at the standard feature-settings width.
struct FeatureSettingsPopoverShell<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
            }
            .padding(16)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    content()
                }
                .padding(16)
            }
        }
        .frame(width: 360)
        .frame(maxHeight: 560)
    }
}
