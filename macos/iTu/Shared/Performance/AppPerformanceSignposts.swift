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

    static func emitPlanningBody() {
        signposter.emitEvent("PlanningViewBody", "plan")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPlanPlanningBody()
        #endif
    }

    static func emitTaskListBody() {
        signposter.emitEvent("TaskListViewBody", "plan")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPlanTaskListBody()
        #endif
    }

    static func recordPlanProjectionBuild() {
        signposter.emitEvent("PlanProjectionBuild", "plan")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPlanProjectionBuild()
        #endif
    }

    static func recordPlanRowPresentationBuild(count: Int) {
        signposter.emitEvent("PlanRowPresentationBuild", "\(count)")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPlanRowPresentationBuild(count: count)
        #endif
    }

    static func recordTaskRowBody() {
        signposter.emitEvent("TaskRowBody", "plan")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPlanTaskRowBody()
        #endif
    }

    static func recordTaskRowAppear() {
        signposter.emitEvent("TaskRowAppear", "plan")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPlanTaskRowAppear()
        #endif
    }

    static func recordTaskRowDisappear() {
        signposter.emitEvent("TaskRowDisappear", "plan")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPlanTaskRowDisappear()
        #endif
    }

    static func recordPaginationAppend() {
        signposter.emitEvent("PlanPaginationAppend", "plan")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPlanPaginationAppend()
        #endif
    }

    static func recordPaginationApply() {
        signposter.emitEvent("PlanPaginationApply", "plan")
        #if DEBUG
        DebugPerformanceCounters.shared.incrementPlanPaginationApply()
        #endif
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
        signposter.emitEvent("MainActorSnapshotApply", "app")
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
    private var planPlanningBodies = 0
    private var planTaskListBodies = 0
    private var planProjectionBuilds = 0
    private var planRowPresentationBuilds = 0
    private var planTaskRowBodies = 0
    private var planTaskRowAppears = 0
    private var planTaskRowDisappears = 0
    private var planPaginationAppends = 0
    private var planPaginationApplies = 0

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
    func incrementPlanPlanningBody() { planPlanningBodies += 1 }
    func incrementPlanTaskListBody() { planTaskListBodies += 1 }
    func incrementPlanProjectionBuild() { planProjectionBuilds += 1 }
    func incrementPlanRowPresentationBuild(count: Int) { planRowPresentationBuilds += count }
    func incrementPlanTaskRowBody() { planTaskRowBodies += 1 }
    func incrementPlanTaskRowAppear() { planTaskRowAppears += 1 }
    func incrementPlanTaskRowDisappear() { planTaskRowDisappears += 1 }
    func incrementPlanPaginationAppend() { planPaginationAppends += 1 }
    func incrementPlanPaginationApply() { planPaginationApplies += 1 }
    func incrementRefresh(sectionName: String) {
        refreshCountByFeature[sectionName, default: 0] += 1
    }

    private func flush() {
        guard focusTicks > 0 || gymTicks > 0 || mountedFeatureCount > 0 || menuSnapshots > 0 || statusUpdates > 0 || policyEnforcements > 0 || modelApplies > 0 || syncRuns > 0 || !refreshCountByFeature.isEmpty || planPlanningBodies > 0 || planTaskListBodies > 0 || planProjectionBuilds > 0 || planRowPresentationBuilds > 0 || planTaskRowBodies > 0 || planTaskRowAppears > 0 || planTaskRowDisappears > 0 || planPaginationAppends > 0 || planPaginationApplies > 0 else {
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
        plan.planning.body=\(self.planPlanningBodies) \
        plan.taskList.body=\(self.planTaskListBodies) \
        plan.projection.build=\(self.planProjectionBuilds) \
        plan.rowPresentation.build=\(self.planRowPresentationBuilds) \
        plan.taskRow.body=\(self.planTaskRowBodies) \
        plan.taskRow.appear=\(self.planTaskRowAppears) \
        plan.taskRow.disappear=\(self.planTaskRowDisappears) \
        plan.pagination.append=\(self.planPaginationAppends) \
        plan.pagination.apply=\(self.planPaginationApplies) \
        refreshCountByFeature=\(self.refreshCountByFeature)
        """)
        focusTicks = 0
        gymTicks = 0
        menuSnapshots = 0
        statusUpdates = 0
        policyEnforcements = 0
        modelApplies = 0
        syncRuns = 0
        planPlanningBodies = 0
        planTaskListBodies = 0
        planProjectionBuilds = 0
        planRowPresentationBuilds = 0
        planTaskRowBodies = 0
        planTaskRowAppears = 0
        planTaskRowDisappears = 0
        planPaginationAppends = 0
        planPaginationApplies = 0
        refreshCountByFeature.removeAll(keepingCapacity: true)
    }
}
#endif
