public struct iTuRGBA: Equatable, Sendable {
    public let red: UInt8
    public let green: UInt8
    public let blue: UInt8
    public let alpha: Double

    public init(red: UInt8, green: UInt8, blue: UInt8, alpha: Double = 1) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    public init(hex: UInt32, alpha: Double = 1) {
        self.init(
            red: UInt8((hex >> 16) & 0xFF),
            green: UInt8((hex >> 8) & 0xFF),
            blue: UInt8(hex & 0xFF),
            alpha: alpha
        )
    }
}

public struct iTuColorToken: Equatable, Sendable {
    public let light: iTuRGBA
    public let dark: iTuRGBA

    public init(light: iTuRGBA, dark: iTuRGBA) {
        self.light = light
        self.dark = dark
    }
}

public enum iTuDesignTokens {
    public static let canvas = iTuColorToken(light: .init(hex: 0xF5F7F6), dark: .init(hex: 0x071713))
    public static let surface = iTuColorToken(light: .init(hex: 0xFFFFFF), dark: .init(hex: 0x0A211D))
    public static let surfaceMuted = iTuColorToken(light: .init(hex: 0xFBFCFB), dark: .init(hex: 0x0D2A25))
    public static let ink = iTuColorToken(light: .init(hex: 0x142420), dark: .init(hex: 0xECF7F3))
    public static let inkDim = iTuColorToken(light: .init(hex: 0x5C6D68), dark: .init(hex: 0xA7BBB5))
    public static let inkFaint = iTuColorToken(light: .init(hex: 0x93A39D), dark: .init(hex: 0x6F8982))
    public static let border = iTuColorToken(light: .init(hex: 0xE4E9E6), dark: .init(hex: 0x1A3B34))
    public static let borderSoft = iTuColorToken(light: .init(hex: 0xEDF1EF), dark: .init(hex: 0x123029))
    public static let forest = iTuColorToken(light: .init(hex: 0x0B322C), dark: .init(hex: 0x0B322C))
    public static let forestDeep = iTuColorToken(light: .init(hex: 0x08211D), dark: .init(hex: 0x08211D))
    public static let forestRaised = iTuColorToken(light: .init(hex: 0x15443C), dark: .init(hex: 0x15443C))
    public static let tealDeep = iTuColorToken(light: .init(hex: 0x0D3831), dark: .init(hex: 0x0D3831))
    public static let teal = iTuColorToken(light: .init(hex: 0x167F71), dark: .init(hex: 0x40A6B5))
    public static let mint = iTuColorToken(light: .init(hex: 0x3FB6A4), dark: .init(hex: 0x3FB6A4))
    public static let mintTint = iTuColorToken(light: .init(hex: 0xF1FAF7), dark: .init(hex: 0x102F28))
    public static let pageHeaderForeground = iTuColorToken(light: .init(hex: 0xEDF3F0), dark: .init(hex: 0xEDF3F0))
    public static let pageHeaderForegroundMuted = iTuColorToken(light: .init(hex: 0xC1D8D0), dark: .init(hex: 0xA7BBB5))
    public static let pageHeaderKicker = iTuColorToken(light: .init(hex: 0x72D3BE), dark: .init(hex: 0x72D3BE))
    public static let pageHeaderDivider = iTuColorToken(
        light: .init(hex: 0xFFFFFF, alpha: 0.14),
        dark: .init(hex: 0xFFFFFF, alpha: 0.14)
    )
    public static let syncBlue = iTuColorToken(light: .init(hex: 0x4F8FCF), dark: .init(hex: 0x4F8FCF))
    public static let amber = iTuColorToken(light: .init(hex: 0xE19A2E), dark: .init(hex: 0xE19A2E))
    public static let amberTint = iTuColorToken(light: .init(hex: 0xFBECD2), dark: .init(hex: 0x3B2B14))
    public static let coral = iTuColorToken(light: .init(hex: 0xE2725B), dark: .init(hex: 0xE2725B))
    public static let coralTint = iTuColorToken(light: .init(hex: 0xFBE4DE), dark: .init(hex: 0x3D211D))
    public static let gold = iTuColorToken(light: .init(hex: 0xAD8A3D), dark: .init(hex: 0xAD8A3D))
    public static let goldSoft = iTuColorToken(light: .init(hex: 0xF1E7CF), dark: .init(hex: 0xF1E7CF))
}
