import XCTest
@testable import iTuDesignCore

final class iTuDesignCoreTests: XCTestCase {
    func testRGBAChannelAndHexInitializers() {
        let channels = iTuRGBA(red: 0x12, green: 0x34, blue: 0x56, alpha: 0.25)
        XCTAssertEqual(channels, iTuRGBA(hex: 0x123456, alpha: 0.25))
        XCTAssertEqual(channels.red, 0x12)
        XCTAssertEqual(channels.green, 0x34)
        XCTAssertEqual(channels.blue, 0x56)
        XCTAssertEqual(channels.alpha, 0.25)
    }

    func testColorTokenEquality() {
        let light = iTuRGBA(hex: 0x123456)
        let dark = iTuRGBA(hex: 0xABCDEF)
        XCTAssertEqual(iTuColorToken(light: light, dark: dark), iTuColorToken(light: light, dark: dark))
        XCTAssertNotEqual(iTuColorToken(light: light, dark: dark), iTuColorToken(light: dark, dark: light))
    }

    func testDesignTokensPreservePaletteValues() {
        let tokens: [(iTuColorToken, UInt32, UInt32, Double)] = [
            (iTuDesignTokens.canvas, 0xF5F7F6, 0x071713, 1),
            (iTuDesignTokens.surface, 0xFFFFFF, 0x0A211D, 1),
            (iTuDesignTokens.surfaceMuted, 0xFBFCFB, 0x0D2A25, 1),
            (iTuDesignTokens.ink, 0x142420, 0xECF7F3, 1),
            (iTuDesignTokens.inkDim, 0x5C6D68, 0xA7BBB5, 1),
            (iTuDesignTokens.inkFaint, 0x93A39D, 0x6F8982, 1),
            (iTuDesignTokens.border, 0xE4E9E6, 0x1A3B34, 1),
            (iTuDesignTokens.borderSoft, 0xEDF1EF, 0x123029, 1),
            (iTuDesignTokens.forest, 0x0B322C, 0x0B322C, 1),
            (iTuDesignTokens.forestDeep, 0x08211D, 0x08211D, 1),
            (iTuDesignTokens.forestRaised, 0x15443C, 0x15443C, 1),
            (iTuDesignTokens.tealDeep, 0x0D3831, 0x0D3831, 1),
            (iTuDesignTokens.teal, 0x167F71, 0x40A6B5, 1),
            (iTuDesignTokens.mint, 0x3FB6A4, 0x3FB6A4, 1),
            (iTuDesignTokens.mintTint, 0xF1FAF7, 0x102F28, 1),
            (iTuDesignTokens.pageHeaderForeground, 0xEDF3F0, 0xEDF3F0, 1),
            (iTuDesignTokens.pageHeaderForegroundMuted, 0xC1D8D0, 0xA7BBB5, 1),
            (iTuDesignTokens.pageHeaderKicker, 0x72D3BE, 0x72D3BE, 1),
            (iTuDesignTokens.pageHeaderDivider, 0xFFFFFF, 0xFFFFFF, 0.14),
            (iTuDesignTokens.syncBlue, 0x4F8FCF, 0x4F8FCF, 1),
            (iTuDesignTokens.amber, 0xE19A2E, 0xE19A2E, 1),
            (iTuDesignTokens.amberTint, 0xFBECD2, 0x3B2B14, 1),
            (iTuDesignTokens.coral, 0xE2725B, 0xE2725B, 1),
            (iTuDesignTokens.coralTint, 0xFBE4DE, 0x3D211D, 1),
            (iTuDesignTokens.gold, 0xAD8A3D, 0xAD8A3D, 1),
            (iTuDesignTokens.goldSoft, 0xF1E7CF, 0xF1E7CF, 1)
        ]

        XCTAssertEqual(tokens.count, 26)
        for (token, lightHex, darkHex, alpha) in tokens {
            XCTAssertEqual(token.light, iTuRGBA(hex: lightHex, alpha: alpha))
            XCTAssertEqual(token.dark, iTuRGBA(hex: darkHex, alpha: alpha))
        }
    }

    func testGrowthIconCatalogAndEmojiResolution() {
        let preset = GrowthIconDescriptor.presets.first { $0.id == "FLOWER_2" }
        XCTAssertEqual(preset?.label, "Mindfulness")
        XCTAssertEqual(preset?.systemImage, "camera.macro")

        let emoji = GrowthIconDescriptor.resolve("🔥")
        XCTAssertEqual(emoji.id, "FLAME")
        XCTAssertEqual(emoji.systemImage, "flame")
        XCTAssertFalse(emoji.isTextGlyph)
    }

    func testGrowthIconResolverPreservesFallbackAndTextGlyphBehavior() {
        XCTAssertEqual(GrowthIconDescriptor.resolve(nil), .fallback)

        let glyph = GrowthIconDescriptor.resolve("custom.icon!")
        XCTAssertEqual(glyph.id, "custom.icon!")
        XCTAssertEqual(glyph.systemImage, GrowthIconDescriptor.fallback.systemImage)
        XCTAssertTrue(glyph.isTextGlyph)
    }
}
