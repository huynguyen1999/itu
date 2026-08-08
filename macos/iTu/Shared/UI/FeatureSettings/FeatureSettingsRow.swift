import SwiftUI

/// Label on the left, control on the right — the standard settings row.
struct FeatureSettingsRow<Control: View>: View {
    let label: String
    @ViewBuilder var control: () -> Control

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.ink)
            Spacer()
            control()
        }
    }
}
