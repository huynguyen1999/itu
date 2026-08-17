import SwiftUI
import AppKit
import iTuDesignCore

enum iTuTheme {
    static let canvas = Color(designToken: iTuDesignTokens.canvas)
    static let surface = Color(designToken: iTuDesignTokens.surface)
    static let surfaceMuted = Color(designToken: iTuDesignTokens.surfaceMuted)
    static let ink = Color(designToken: iTuDesignTokens.ink)
    static let inkDim = Color(designToken: iTuDesignTokens.inkDim)
    static let inkFaint = Color(designToken: iTuDesignTokens.inkFaint)
    static let border = Color(designToken: iTuDesignTokens.border)
    static let borderSoft = Color(designToken: iTuDesignTokens.borderSoft)
    static let forest = Color(designToken: iTuDesignTokens.forest)
    static let forestDeep = Color(designToken: iTuDesignTokens.forestDeep)
    static let forestRaised = Color(designToken: iTuDesignTokens.forestRaised)
    static let tealDeep = Color(designToken: iTuDesignTokens.tealDeep)
    static let teal = Color(designToken: iTuDesignTokens.teal)
    static let mint = Color(designToken: iTuDesignTokens.mint)
    static let mintTint = Color(designToken: iTuDesignTokens.mintTint)
    static let pageHeaderForeground = Color(designToken: iTuDesignTokens.pageHeaderForeground)
    static let pageHeaderForegroundMuted = Color(designToken: iTuDesignTokens.pageHeaderForegroundMuted)
    static let pageHeaderKicker = Color(designToken: iTuDesignTokens.pageHeaderKicker)
    static let pageHeaderDivider = Color(designToken: iTuDesignTokens.pageHeaderDivider)
    static let syncBlue = Color(designToken: iTuDesignTokens.syncBlue)
    static let amber = Color(designToken: iTuDesignTokens.amber)
    static let amberTint = Color(designToken: iTuDesignTokens.amberTint)
    static let coral = Color(designToken: iTuDesignTokens.coral)
    static let coralTint = Color(designToken: iTuDesignTokens.coralTint)
    static let gold = Color(designToken: iTuDesignTokens.gold)
    static let goldSoft = Color(designToken: iTuDesignTokens.goldSoft)
}

extension Color {
    init(designToken token: iTuColorToken) {
        guard token.light != token.dark else {
            self.init(
                .sRGB,
                red: Double(token.light.red) / 255,
                green: Double(token.light.green) / 255,
                blue: Double(token.light.blue) / 255,
                opacity: token.light.alpha
            )
            return
        }

        let dynamicColor = NSColor(name: nil) { appearance in
            let rgba = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? token.dark : token.light
            return NSColor(
                calibratedRed: CGFloat(rgba.red) / 255,
                green: CGFloat(rgba.green) / 255,
                blue: CGFloat(rgba.blue) / 255,
                alpha: rgba.alpha
            )
        }
        self.init(nsColor: dynamicColor)
    }

    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

struct iTuPanelModifier: ViewModifier {
    let radius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }
            .shadow(color: iTuTheme.forest.opacity(0.045), radius: 2, y: 1)
    }
}

struct iTuGradientCardModifier: ViewModifier {
    let radius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(
                LinearGradient(
                    colors: [iTuTheme.forest, iTuTheme.forestDeep],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            }
            .shadow(color: iTuTheme.forest.opacity(0.14), radius: 12, y: 4)
    }
}

struct PointingHandCursorModifier: ViewModifier {
    @Environment(\.isEnabled) private var isEnabled
    @State private var isCursorPushed = false

    func body(content: Content) -> some View {
        content
            .onHover { inside in
                if inside && isEnabled {
                    if !isCursorPushed {
                        NSCursor.pointingHand.push()
                        isCursorPushed = true
                    }
                } else if isCursorPushed {
                    NSCursor.pop()
                    isCursorPushed = false
                }
            }
    }
}

struct iTuHoverCardModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false
    @State private var isCursorPushed = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isHovered && !reduceMotion ? 1.01 : 1.0)
            .shadow(
                color: iTuTheme.forest.opacity(isHovered ? 0.12 : 0.045),
                radius: isHovered ? 8 : 2,
                y: isHovered ? 4 : 1
            )
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: isHovered)
            .onHover { hovering in
                isHovered = hovering && isEnabled
                if hovering && isEnabled && !isCursorPushed {
                    NSCursor.pointingHand.push()
                    isCursorPushed = true
                } else if (!hovering || !isEnabled) && isCursorPushed {
                    NSCursor.pop()
                    isCursorPushed = false
                }
            }
    }
}

extension View {
    func iTuPanel(radius: CGFloat = 14) -> some View {
        modifier(iTuPanelModifier(radius: radius))
    }

    func iTuGradientCard(radius: CGFloat = 20) -> some View {
        modifier(iTuGradientCardModifier(radius: radius))
    }

    func pointingHandCursor() -> some View {
        modifier(PointingHandCursorModifier())
    }

    func iTuHoverCard() -> some View {
        modifier(iTuHoverCardModifier())
    }
}

struct iTuPrimaryButtonStyle: ButtonStyle {
    var height: CGFloat = 38
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false
    @State private var isCursorPushed = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .frame(minHeight: height)
            .background(
                configuration.isPressed ? iTuTheme.forestRaised : (isHovered ? iTuTheme.forest : iTuTheme.teal)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .shadow(color: iTuTheme.forest.opacity(isHovered ? 0.25 : 0.16), radius: isHovered ? 10 : 8, y: isHovered ? 5 : 4)
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? 0.985 : (isHovered ? 1.015 : 1)))
            .opacity(isEnabled ? 1 : 0.5)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: configuration.isPressed)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: isHovered)
            .onHover { hovering in
                isHovered = hovering && isEnabled
                if hovering && isEnabled && !isCursorPushed {
                    NSCursor.pointingHand.push()
                    isCursorPushed = true
                } else if (!hovering || !isEnabled) && isCursorPushed {
                    NSCursor.pop()
                    isCursorPushed = false
                }
            }
    }
}

struct iTuSecondaryButtonStyle: ButtonStyle {
    var height: CGFloat = 38
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false
    @State private var isCursorPushed = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(iTuTheme.teal)
            .padding(.horizontal, 14)
            .frame(minHeight: height)
            .background(configuration.isPressed ? iTuTheme.mintTint.opacity(0.8) : (isHovered ? iTuTheme.mintTint.opacity(0.9) : iTuTheme.mintTint))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(iTuTheme.teal.opacity(isHovered ? 0.45 : 0.25), lineWidth: 1)
            }
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? 0.985 : (isHovered ? 1.015 : 1)))
            .opacity(isEnabled ? 1 : 0.5)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: configuration.isPressed)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: isHovered)
            .onHover { hovering in
                isHovered = hovering && isEnabled
                if hovering && isEnabled && !isCursorPushed {
                    NSCursor.pointingHand.push()
                    isCursorPushed = true
                } else if (!hovering || !isEnabled) && isCursorPushed {
                    NSCursor.pop()
                    isCursorPushed = false
                }
            }
    }
}

struct iTuDangerButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .frame(minHeight: 38)
            .background(iTuTheme.coral.opacity(configuration.isPressed ? 0.78 : (isHovered ? 0.9 : 1)))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? 0.985 : (isHovered ? 1.015 : 1)))
            .opacity(isEnabled ? 1 : 0.5)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: configuration.isPressed)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: isHovered)
            .onHover { isHovered = $0 && isEnabled }
    }
}

struct iTuGhostButtonStyle: ButtonStyle {
    var height: CGFloat = 34
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false
    @State private var isCursorPushed = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(isHovered ? iTuTheme.ink : iTuTheme.inkDim)
            .padding(.horizontal, 10)
            .frame(minHeight: height)
            .background(configuration.isPressed ? iTuTheme.borderSoft : (isHovered ? iTuTheme.surfaceMuted : Color.clear))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .opacity(isEnabled ? 1 : 0.5)
            .onHover { hovering in
                isHovered = hovering && isEnabled
                if hovering && isEnabled && !isCursorPushed {
                    NSCursor.pointingHand.push()
                    isCursorPushed = true
                } else if (!hovering || !isEnabled) && isCursorPushed {
                    NSCursor.pop()
                    isCursorPushed = false
                }
            }
    }
}

struct iTuHeaderSecondaryButtonStyle: ButtonStyle {
    var height: CGFloat = 34
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(iTuTheme.pageHeaderForeground)
            .padding(.horizontal, 14)
            .frame(minHeight: height)
            .background(
                configuration.isPressed
                    ? Color.white.opacity(0.2)
                    : Color.white.opacity(isHovered ? 0.16 : 0.1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(Color.white.opacity(isHovered ? 0.42 : 0.24), lineWidth: 1)
            }
            .opacity(isEnabled ? 1 : 0.48)
            .onHover { isHovered = $0 && isEnabled }
    }
}

struct iTuHeaderGhostButtonStyle: ButtonStyle {
    var height: CGFloat = 34
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(iTuTheme.pageHeaderForegroundMuted)
            .padding(.horizontal, 10)
            .frame(minHeight: height)
            .background(
                configuration.isPressed
                    ? Color.white.opacity(0.18)
                    : Color.white.opacity(isHovered ? 0.12 : 0)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .foregroundStyle(isHovered ? iTuTheme.pageHeaderForeground : iTuTheme.pageHeaderForegroundMuted)
            .opacity(isEnabled ? 1 : 0.48)
            .onHover { isHovered = $0 && isEnabled }
    }
}

struct iTuBrandMark: View {
    var size: CGFloat = 34

    var body: some View {
        Image(systemName: "brain.head.profile")
            .font(.system(size: size * 0.47, weight: .semibold))
            .foregroundStyle(Color.white)
            .frame(width: size, height: size)
            .background(
                LinearGradient(
                    colors: [iTuTheme.mint.opacity(0.9), iTuTheme.teal],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                    .stroke(Color.white.opacity(0.18), lineWidth: 1)
            }
            .shadow(color: Color.black.opacity(0.2), radius: 8, y: 3)
    }
}

struct iTuSectionLabel: View {
    let title: String
    var color: Color = iTuTheme.inkFaint

    var body: some View {
        Text(title.uppercased())
            .font(.system(size: 9, weight: .bold, design: .monospaced))
            .tracking(1.25)
            .foregroundStyle(color)
    }
}

struct iTuUnavailableCard: View {
    let icon: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 24, weight: .medium))
                .foregroundStyle(iTuTheme.teal)
                .frame(width: 48, height: 48)
                .background(iTuTheme.mintTint)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(spacing: 5) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Text(message)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 460)
            }

            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(iTuSecondaryButtonStyle(height: 32))
            }
        }
        .frame(maxWidth: .infinity, minHeight: 220)
        .padding(28)
        .iTuPanel(radius: 14)
    }
}
