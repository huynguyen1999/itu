import XCTest
import iTuDomain
@testable import iTu

@MainActor
final class AppUpdateTests: XCTestCase {
    func testStartAppUpdateDelegatesToInjectedUpdater() {
        let updater = SpyAppUpdater()
        let model = AppModel(appUpdater: updater)
        model.appUpdatePolicy = AppUpdatePolicy(
            platform: .macos,
            channel: .stable,
            installedVersion: "0.4.0",
            latestVersion: "0.5.0",
            minimumSupportedVersion: "0.3.0",
            status: .optionalUpdate,
            update: AppUpdateLink(url: URL(string: "https://updates.example.test/macos/appcast.xml")!)
        )

        model.startAppUpdate()

        XCTAssertEqual(updater.feedURL?.absoluteString, "https://updates.example.test/macos/appcast.xml")
    }
}

@MainActor
private final class SpyAppUpdater: MacAppUpdating {
    private(set) var feedURL: URL?

    func checkForUpdates(feedURL: URL?) {
        self.feedURL = feedURL
    }
}
