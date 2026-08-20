import Foundation
import Sparkle

@MainActor
protocol MacAppUpdating: AnyObject {
    func checkForUpdates(feedURL: URL?)
}

@MainActor
final class MacSparkleUpdater: NSObject, SPUUpdaterDelegate, MacAppUpdating {
    static let shared = MacSparkleUpdater()

    private var controller: SPUStandardUpdaterController?
    private var feedURL: URL?

    func checkForUpdates(feedURL: URL?) {
        guard let feedURL, feedURL.scheme?.lowercased() == "https" else { return }
        self.feedURL = feedURL

        if let updater = controller?.updater {
            updater.checkForUpdates()
            return
        }

        let controller = SPUStandardUpdaterController(
            startingUpdater: false,
            updaterDelegate: self,
            userDriverDelegate: nil
        )
        self.controller = controller
        controller.startUpdater()
        controller.updater.checkForUpdates()
    }

    func feedURLString(for updater: SPUUpdater) -> String? {
        feedURL?.absoluteString
    }
}
