import SwiftUI
import AppKit

enum iTuTheme {
    static let canvas = Color(lightHex: 0xF5F7F6, darkHex: 0x071713)
    static let surface = Color(lightHex: 0xFFFFFF, darkHex: 0x0A211D)
    static let surfaceMuted = Color(lightHex: 0xFBFCFB, darkHex: 0x0D2A25)
    static let ink = Color(lightHex: 0x142420, darkHex: 0xECF7F3)
    static let inkDim = Color(lightHex: 0x5C6D68, darkHex: 0xA7BBB5)
    static let inkFaint = Color(lightHex: 0x93A39D, darkHex: 0x6F8982)
    static let border = Color(lightHex: 0xE4E9E6, darkHex: 0x1A3B34)
    static let borderSoft = Color(lightHex: 0xEDF1EF, darkHex: 0x123029)
    static let forest = Color(hex: 0x0B322C)
    static let forestDeep = Color(hex: 0x08211D)
    static let forestRaised = Color(hex: 0x15443C)
    static let tealDeep = Color(hex: 0x0D3831)
    static let teal = Color(lightHex: 0x167F71, darkHex: 0x40A6B5)
    static let mint = Color(hex: 0x3FB6A4)
    static let mintTint = Color(lightHex: 0xF1FAF7, darkHex: 0x102F28)
    static let syncBlue = Color(hex: 0x4F8FCF)
    static let amber = Color(hex: 0xE19A2E)
    static let amberTint = Color(lightHex: 0xFBECD2, darkHex: 0x3B2B14)
    static let coral = Color(hex: 0xE2725B)
    static let coralTint = Color(lightHex: 0xFBE4DE, darkHex: 0x3D211D)
    static let gold = Color(hex: 0xAD8A3D)
    static let goldSoft = Color(hex: 0xF1E7CF)
}

extension Color {
    init(lightHex: UInt32, darkHex: UInt32, opacity: Double = 1) {
        let dynamicColor = NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? darkHex : lightHex
            return NSColor(
                calibratedRed: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: opacity
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

    func body(content: Content) -> some View {
        content
            .background {
                PointingHandCursorRect(isEnabled: isEnabled)
                    .allowsHitTesting(false)
            }
    }
}

struct PointingHandCursorRect: NSViewRepresentable {
    let isEnabled: Bool

    func makeNSView(context: Context) -> PointingHandCursorNSView {
        PointingHandCursorNSView(isEnabled: isEnabled)
    }

    func updateNSView(_ nsView: PointingHandCursorNSView, context: Context) {
        nsView.isEnabled = isEnabled
        nsView.window?.invalidateCursorRects(for: nsView)
    }
}

final class PointingHandCursorNSView: NSView {
    var isEnabled: Bool {
        didSet {
            window?.invalidateCursorRects(for: self)
        }
    }

    init(isEnabled: Bool) {
        self.isEnabled = isEnabled
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) {
        isEnabled = true
        super.init(coder: coder)
    }

    override func resetCursorRects() {
        discardCursorRects()
        guard isEnabled else { return }
        addCursorRect(bounds, cursor: .pointingHand)
    }

    override func layout() {
        super.layout()
        window?.invalidateCursorRects(for: self)
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
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
