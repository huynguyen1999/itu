import SwiftUI
import iTuDesignCore

public enum IOSColor {
    public static func color(_ token: iTuColorToken, scheme: ColorScheme) -> Color {
        let value = scheme == .dark ? token.dark : token.light
        return Color(
            red: Double(value.red) / 255,
            green: Double(value.green) / 255,
            blue: Double(value.blue) / 255,
            opacity: value.alpha
        )
    }

    public static func canvas(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.canvas, scheme: scheme) }
    public static func surface(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.surface, scheme: scheme) }
    public static func surfaceMuted(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.surfaceMuted, scheme: scheme) }
    public static func ink(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.ink, scheme: scheme) }
    public static func inkDim(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.inkDim, scheme: scheme) }
    public static func inkFaint(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.inkFaint, scheme: scheme) }
    public static func border(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.border, scheme: scheme) }
    public static func borderSoft(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.borderSoft, scheme: scheme) }
    public static func forest(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.forest, scheme: scheme) }
    public static func forestDeep(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.forestDeep, scheme: scheme) }
    public static func forestRaised(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.forestRaised, scheme: scheme) }
    public static func teal(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.teal, scheme: scheme) }
    public static func tealDeep(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.tealDeep, scheme: scheme) }
    public static func mint(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.mint, scheme: scheme) }
    public static func mintTint(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.mintTint, scheme: scheme) }
    public static func amber(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.amber, scheme: scheme) }
    public static func amberTint(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.amberTint, scheme: scheme) }
    public static func coral(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.coral, scheme: scheme) }
    public static func coralTint(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.coralTint, scheme: scheme) }
    public static func gold(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.gold, scheme: scheme) }
    public static func goldSoft(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.goldSoft, scheme: scheme) }
    public static func syncBlue(_ scheme: ColorScheme) -> Color { color(iTuDesignTokens.syncBlue, scheme: scheme) }

    public static func forestGradient(_ scheme: ColorScheme) -> LinearGradient {
        LinearGradient(
            colors: [
                color(iTuDesignTokens.forest, scheme: scheme),
                color(iTuDesignTokens.forestDeep, scheme: scheme)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    public static func goldGradient(_ scheme: ColorScheme) -> LinearGradient {
        LinearGradient(
            colors: [
                color(iTuDesignTokens.amber, scheme: scheme),
                color(iTuDesignTokens.gold, scheme: scheme)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
