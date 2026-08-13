import Foundation
import os

/// Unified signpost logging for measuring UI and navigation performance metrics.
@MainActor
enum AppPerformanceSignposts {
    private static let logger = Logger(subsystem: "com.itu.macos", category: "Navigation")
    private static let signposter = OSSignposter(logger: logger)
    static func emitNavigationSelection(sectionName: String) {
        signposter.emitEvent("NavigationSelection", "\(sectionName)")
    }

    static func emitSelectionCommitted(sectionName: String) {
        signposter.emitEvent("SelectionCommitted", "\(sectionName)")
    }

    static func emitDestinationBody(sectionName: String) {
        signposter.emitEvent("DestinationBody", "\(sectionName)")
    }

    static func emitDestinationAppeared(sectionName: String) {
        signposter.emitEvent("DestinationAppeared", "\(sectionName)")
    }

    static func emitFirstLocalFrame(sectionName: String) {
        signposter.emitEvent("FirstLocalFrame", "\(sectionName)")
    }

    static func emitRefreshStarted(sectionName: String) {
        signposter.emitEvent("RefreshStarted", "\(sectionName)")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementRefresh(sectionName: sectionName)
        #endif
    }

    static func emitRefreshCompleted(sectionName: String) {
        signposter.emitEvent("RefreshCompleted", "\(sectionName)")
    }

    static func recordFocusTick() {
        #if DEBUG
        DebugPerformanceCounters.shared.incrementFocusTicks()
        #endif
    }

    static func recordGymTick() {
        #if DEBUG
        DebugPerformanceCounters.shared.incrementGymTicks()
        #endif
    }

    static func recordDestinationMounted() {
        #if DEBUG
        DebugPerformanceCounters.shared.incrementMountedFeatureCount()
        #endif
    }

    static func recordDestinationUnmounted() {
        #if DEBUG
        DebugPerformanceCounters.shared.decrementMountedFeatureCount()
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
    private var gymTicks = 0
    private var mountedFeatureCount = 0
    private var menuSnapshots = 0
    private var statusUpdates = 0
    private var policyEnforcements = 0
    private var modelApplies = 0
    private var syncRuns = 0
    private var refreshCountByFeature: [String: Int] = [:]

    private init() {
        timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.flush()
            }
        }
    }

    func incrementFocusTicks() { focusTicks += 1 }
    func incrementGymTicks() { gymTicks += 1 }
    func incrementMountedFeatureCount() { mountedFeatureCount += 1 }
    func decrementMountedFeatureCount() { mountedFeatureCount = max(0, mountedFeatureCount - 1) }
    func incrementMenuSnapshots() { menuSnapshots += 1 }
    func incrementStatusUpdates() { statusUpdates += 1 }
    func incrementPolicyEnforcements() { policyEnforcements += 1 }
    func incrementModelApplies() { modelApplies += 1 }
    func incrementSyncRuns() { syncRuns += 1 }
    func incrementRefresh(sectionName: String) {
        refreshCountByFeature[sectionName, default: 0] += 1
    }

    private func flush() {
        guard focusTicks > 0 || gymTicks > 0 || mountedFeatureCount > 0 || menuSnapshots > 0 || statusUpdates > 0 || policyEnforcements > 0 || modelApplies > 0 || syncRuns > 0 || !refreshCountByFeature.isEmpty else {
            return
        }
        perfLogger.debug("""
        [iTu perf / 5s] \
        focusTicks=\(self.focusTicks) \
        gymTicks=\(self.gymTicks) \
        mountedFeatureCount=\(self.mountedFeatureCount) \
        menuSnapshots=\(self.menuSnapshots) \
        statusUpdates=\(self.statusUpdates) \
        policyEnforcements=\(self.policyEnforcements) \
        modelApplies=\(self.modelApplies) \
        syncRuns=\(self.syncRuns) \
        refreshCountByFeature=\(self.refreshCountByFeature)
        """)
        focusTicks = 0
        gymTicks = 0
        menuSnapshots = 0
        statusUpdates = 0
        policyEnforcements = 0
        modelApplies = 0
        syncRuns = 0
        refreshCountByFeature.removeAll(keepingCapacity: true)
    }
}
#endif
