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

    static func recordFocusTick() {
        #if DEBUG
        DebugPerformanceCounters.shared.incrementFocusTicks()
        #endif
    }

    static func recordMenuSnapshot() {
        #if DEBUG
        DebugPerformanceCounters.shared.incrementMenuSnapshots()
        #endif
    }

    static func recordStatusUpdate() {
        #if DEBUG
        DebugPerformanceCounters.shared.incrementStatusUpdates()
        #endif
    }

    static func recordPolicyEnforcement() {
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPolicyEnforcements()
        #endif
    }

    static func recordModelApply() {
        #if DEBUG
        DebugPerformanceCounters.shared.incrementModelApplies()
        #endif
    }

    static func recordSyncRun() {
        #if DEBUG
        DebugPerformanceCounters.shared.incrementSyncRuns()
        #endif
    }
}

#if DEBUG
@MainActor
final class DebugPerformanceCounters {
    static let shared = DebugPerformanceCounters()

    private let perfLogger = Logger(subsystem: "com.itu.macos", category: "Performance")
    private var timer: Timer?

    private var focusTicks = 0
    private var menuSnapshots = 0
    private var statusUpdates = 0
    private var policyEnforcements = 0
    private var modelApplies = 0
    private var syncRuns = 0

    private init() {
        timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.flush()
            }
        }
    }

    func incrementFocusTicks() { focusTicks += 1 }
    func incrementMenuSnapshots() { menuSnapshots += 1 }
    func incrementStatusUpdates() { statusUpdates += 1 }
    func incrementPolicyEnforcements() { policyEnforcements += 1 }
    func incrementModelApplies() { modelApplies += 1 }
    func incrementSyncRuns() { syncRuns += 1 }

    private func flush() {
        guard focusTicks > 0 || menuSnapshots > 0 || statusUpdates > 0 || policyEnforcements > 0 || modelApplies > 0 || syncRuns > 0 else {
            return
        }
        perfLogger.debug("""
        [iTu perf / 5s] \
        focusTicks=\(self.focusTicks) \
        menuSnapshots=\(self.menuSnapshots) \
        statusUpdates=\(self.statusUpdates) \
        policyEnforcements=\(self.policyEnforcements) \
        modelApplies=\(self.modelApplies) \
        syncRuns=\(self.syncRuns)
        """)
        focusTicks = 0
        menuSnapshots = 0
        statusUpdates = 0
        policyEnforcements = 0
        modelApplies = 0
        syncRuns = 0
    }
}
#endif

