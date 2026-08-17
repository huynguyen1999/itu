import SwiftUI
import iTuDesignCore

enum iTuTheme {
    static func color(_ token: iTuColorToken, scheme: ColorScheme) -> Color {
        let value = scheme == .dark ? token.dark : token.light
        return Color(
            red: Double(value.red) / 255,
            green: Double(value.green) / 255,
            blue: Double(value.blue) / 255,
            opacity: value.alpha
        )
    }

}

private struct iTuMobilePanelModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(
                iTuTheme.color(iTuDesignTokens.surface, scheme: colorScheme),
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(iTuTheme.color(iTuDesignTokens.border, scheme: colorScheme), lineWidth: 1)
            }
            .shadow(
                color: iTuTheme.color(iTuDesignTokens.forest, scheme: colorScheme).opacity(0.08),
                radius: 8,
                y: 3
            )
    }
}

extension View {
    func iTuMobilePanel(cornerRadius: CGFloat = 16) -> some View {
        modifier(iTuMobilePanelModifier(cornerRadius: cornerRadius))
    }
}
