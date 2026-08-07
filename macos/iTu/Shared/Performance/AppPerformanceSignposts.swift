import Foundation
import os

/// Unified signpost logging for measuring UI and navigation performance metrics.
@MainActor
enum AppPerformanceSignposts {
    private static let logger = Logger(subsystem: "com.itu.macos", category: "Navigation")
    private static let signposter = OSSignposter(logger: logger)
    static func emitSelectionCommitted(sectionName: String) {
        signposter.emitEvent("SelectionCommitted", "\(sectionName)")
    }

    static func emitShellAppeared(sectionName: String) {
        signposter.emitEvent("ShellAppeared", "\(sectionName)")
    }

    static func emitContentVisible(sectionName: String) {
        signposter.emitEvent("ContentVisible", "\(sectionName)")
    }

    static func emitRefreshStarted(sectionName: String) {
        signposter.emitEvent("RefreshStarted", "\(sectionName)")
    }

    static func emitRefreshCompleted(sectionName: String) {
        signposter.emitEvent("RefreshCompleted", "\(sectionName)")
    }
}
