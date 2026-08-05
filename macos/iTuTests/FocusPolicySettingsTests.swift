import XCTest
@testable import iTu

final class FocusPolicySettingsTests: XCTestCase {
    func testLegacyFocusSettingsDecodeKeepsNewDefaults() throws {
        let data = Data(
            """
            {
              "defaultWorkMinutes": 45,
              "overtimeEnabled": false,
              "finishSoundEnabled": true,
              "desktopNotificationEnabled": false,
              "compactAudio": false
            }
            """.utf8
        )

        let settings = try JSONDecoder().decode(FocusSettings.self, from: data)

        XCTAssertEqual(settings.defaultWorkMinutes, 45)
        XCTAssertFalse(settings.overtimeEnabled)
        XCTAssertFalse(settings.desktopNotificationEnabled)
        XCTAssertTrue(settings.showMenuBarItem)
        XCTAssertEqual(settings.menuBarDisplayMode, .remainingTime)
        XCTAssertFalse(settings.focusPolicyEnabled)
        XCTAssertTrue(settings.blockedApplications.isEmpty)
        XCTAssertTrue(settings.blockedWebsitePatterns.isEmpty)
        XCTAssertEqual(settings.enabledBrowsers, SupportedBrowser.defaultSelection)
    }

    func testFocusSettingsDefaultsAreLocalAndHashable() {
        let settings = FocusSettings()

        XCTAssertTrue(settings.showMenuBarItem)
        XCTAssertEqual(settings.menuBarDisplayMode, .remainingTime)
        XCTAssertFalse(settings.focusPolicyEnabled)
        XCTAssertTrue(settings.blockedApplications.isEmpty)
        XCTAssertTrue(settings.blockedWebsitePatterns.isEmpty)
        XCTAssertEqual(settings.enabledBrowsers, SupportedBrowser.defaultSelection)
        XCTAssertEqual(Set([settings]).count, 1)
    }
}
