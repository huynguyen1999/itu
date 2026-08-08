import SwiftUI

/// Gear button used in feature page headers to open that feature's settings.
struct FeatureSettingsButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "gearshape")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(iTuTheme.inkDim)
                .frame(width: 32, height: 32)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
        .help(label)
        .accessibilityLabel(label)
    }
}
