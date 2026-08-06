import Foundation
import os

/// Unified signpost logging for measuring UI and navigation performance metrics.
@MainActor
enum AppPerformanceSignposts {
    private static let logger = Logger(subsystem: "com.itu.macos", category: "Navigation")
    private static let signposter = OSSignposter(logger: logger)
    private static var navigationInterval: (sectionName: String, state: OSSignpostIntervalState)?

    static func beginNavigation(to sectionName: String) -> OSSignpostIntervalState {
        let id = signposter.makeSignpostID()
        return signposter.beginInterval("Navigation", id: id, "\(sectionName)")
    }

    static func endNavigation(_ state: OSSignpostIntervalState, sectionName: String) {
        signposter.endInterval("Navigation", state, "\(sectionName)")
    }

    static func emitPointerDown(sectionName: String) {
        signposter.emitEvent("PointerDown", "\(sectionName)")
    }

    static func emitSelectionCommitted(sectionName: String) {
        if let navigationInterval {
            endNavigation(navigationInterval.state, sectionName: navigationInterval.sectionName)
        }
        navigationInterval = (sectionName, beginNavigation(to: sectionName))
        signposter.emitEvent("SelectionCommitted", "\(sectionName)")
    }

    static func emitShellAppeared(sectionName: String) {
        signposter.emitEvent("ShellAppeared", "\(sectionName)")
    }

    static func emitContentVisible(sectionName: String) {
        if let navigationInterval, navigationInterval.sectionName == sectionName {
            endNavigation(navigationInterval.state, sectionName: sectionName)
            self.navigationInterval = nil
        }
        signposter.emitEvent("ContentVisible", "\(sectionName)")
    }

    static func emitRefreshStarted(sectionName: String) {
        signposter.emitEvent("RefreshStarted", "\(sectionName)")
    }

    static func emitRefreshCompleted(sectionName: String) {
        signposter.emitEvent("RefreshCompleted", "\(sectionName)")
    }
}
