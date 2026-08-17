import BackgroundTasks
import Foundation
import iTuOffline
import iTuDomain

private final class IOSBackgroundTaskCompletion: @unchecked Sendable {
    private let task: BGTask

    init(_ task: BGTask) {
        self.task = task
    }

    func finish(success: Bool) {
        task.setTaskCompleted(success: success)
    }
}

/// Background Task identifier that matches the entry in Info.plist
/// (BGTaskSchedulerPermittedIdentifiers).
enum IOSHealthBackgroundTaskIdentifier {
    static let refresh = "com.itu.ios.health.refresh"
}

/// Schedules and handles BGAppRefreshTasks for HealthKit import.
///
/// Registration occurs in `iTuApp.init()` before the first scene is created.
/// BGTaskScheduler itself is thread-safe, so registration can be called from
/// any context.
///
/// The actual import is always coordinated through `AppModel.refreshHealth()` so
/// that account-switch safety and deduplication remain in one place.
final class IOSHealthBackgroundRefreshCoordinator: @unchecked Sendable {
    static let shared = IOSHealthBackgroundRefreshCoordinator()

    private let lock = NSLock()
    private var _taskHandler: (@MainActor () async -> Bool)?
    private var taskHandler: (@MainActor () async -> Bool)? {
        get { lock.withLock { _taskHandler } }
        set { lock.withLock { _taskHandler = newValue } }
    }

    private init() {}

    /// Registers the background app refresh task with the system and optionally
    /// supplies the handler to invoke on each background wakeup.
    ///
    /// Call this once during app initialization. The model handler is attached
    /// later, after the root model exists.
    func register(handler: (@MainActor () async -> Bool)? = nil) {
        if let handler { taskHandler = handler }
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: IOSHealthBackgroundTaskIdentifier.refresh,
            using: nil
        ) { [weak self] task in
            guard let self, let appRefresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self.handle(appRefresh)
        }
    }

    /// Updates the import handler without re-registering the task identifier.
    /// Call this once the AppModel instance is available (e.g., from a `.task`
    /// modifier) to connect the background wakeup to the live model.
    func setHandler(_ handler: @escaping @MainActor () async -> Bool) {
        taskHandler = handler
    }

    /// Schedules the next background health refresh.
    /// Call after each foreground import and after the BGAppRefreshTask handler
    /// completes so the system keeps scheduling future deliveries.
    func scheduleNext() {
        let request = BGAppRefreshTaskRequest(identifier: IOSHealthBackgroundTaskIdentifier.refresh)
        // iOS will honour this earliest date but may delay further.
        // Hourly is a reasonable cadence for daily-aggregated health data.
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private func handle(_ task: BGAppRefreshTask) {
        scheduleNext()
        guard let taskHandler else {
            task.setTaskCompleted(success: false)
            return
        }
        let completion = IOSBackgroundTaskCompletion(task)
        let work = Task { @MainActor [taskHandler] in
            let success = await taskHandler()
            completion.finish(success: success)
        }
        task.expirationHandler = { work.cancel() }
    }
}
