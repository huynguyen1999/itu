import Foundation
import WidgetKit
import iTuDomain
import iTuOffline

enum IOSAppGroup {
    static let identifier = "group.com.itu.ios"
    static let snapshotDirectory = "WidgetSnapshots"
    static let activeAccountKey = "activeAccountID"
    static let syncDeviceKey = "syncDeviceID"
    static let snapshotFilePrefix = "widget-snapshot-v1-"
    static let todayWidgetKind = "TodayWidget"
    static let focusWidgetKind = "FocusWidget"

    static func defaults() -> UserDefaults? {
        UserDefaults(suiteName: identifier)
    }
}

enum IOSWidgetSnapshotBridge {
    static func containerURL(fileManager: FileManager = .default) -> URL? {
        fileManager.containerURL(forSecurityApplicationGroupIdentifier: IOSAppGroup.identifier)
    }

    static var activeAccountID: String? {
        IOSAppGroup.defaults()?.string(forKey: IOSAppGroup.activeAccountKey)
    }

    static func fileURL(accountID: String, fileManager: FileManager = .default) -> URL? {
        guard let containerURL = containerURL(fileManager: fileManager), !accountID.isEmpty else { return nil }
        let safeAccountID = accountID.replacingOccurrences(of: "[^A-Za-z0-9_-]", with: "_", options: .regularExpression)
        return containerURL
            .appendingPathComponent(IOSAppGroup.snapshotDirectory, isDirectory: true)
            .appendingPathComponent("\(IOSAppGroup.snapshotFilePrefix)\(safeAccountID).json")
    }

    static func load() -> WidgetSnapshot? {
        guard let accountID = activeAccountID,
              let fileURL = fileURL(accountID: accountID) else { return nil }
        do {
            return try WidgetSnapshotStore(fileURL: fileURL, expectedAccountID: accountID).load()
        } catch {
            return nil
        }
    }

    static func publish(_ snapshot: WidgetSnapshot) {
        guard let snapshotURL = fileURL(accountID: snapshot.accountID) else { return }
        let defaults = IOSAppGroup.defaults()
        if let previousAccountID = defaults?.string(forKey: IOSAppGroup.activeAccountKey), previousAccountID != snapshot.accountID,
           let previousURL = fileURL(accountID: previousAccountID) {
            try? WidgetSnapshotStore(fileURL: previousURL, expectedAccountID: previousAccountID).clear()
        }
        do {
            try WidgetSnapshotStore(fileURL: snapshotURL, expectedAccountID: snapshot.accountID).save(snapshot)
            defaults?.set(snapshot.accountID, forKey: IOSAppGroup.activeAccountKey)
            WidgetCenter.shared.reloadTimelines(ofKind: IOSAppGroup.todayWidgetKind)
            WidgetCenter.shared.reloadTimelines(ofKind: IOSAppGroup.focusWidgetKind)
        } catch {
            // A widget must never replace a valid account snapshot with partial data.
        }
    }

    static func clear() {
        guard let accountID = activeAccountID,
              let fileURL = fileURL(accountID: accountID) else {
            IOSAppGroup.defaults()?.removeObject(forKey: IOSAppGroup.activeAccountKey)
            return
        }
        try? WidgetSnapshotStore(fileURL: fileURL, expectedAccountID: accountID).clear()
        IOSAppGroup.defaults()?.removeObject(forKey: IOSAppGroup.activeAccountKey)
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func syncDeviceID() -> String {
        if let value = IOSAppGroup.defaults()?.string(forKey: IOSAppGroup.syncDeviceKey), value.count >= 12 {
            return value
        }
        let value = ULID.generate()
        IOSAppGroup.defaults()?.set(value, forKey: IOSAppGroup.syncDeviceKey)
        return value
    }
}

enum IOSWidgetSnapshotDeriver {
    private static func productDayString(from value: String) -> String {
        guard let date = iTuDateSupport.parse(value) else { return String(value.prefix(10)) }
        return iTuCalendarSupport.dayString(date)
    }

    static func make(from snapshot: OfflineSnapshot, accountID: String, now: Date = Date()) -> WidgetSnapshot {
        let localDate = iTuCalendarSupport.dayString(now)
        let datedTasks = snapshot.tasks.filter { task in
            guard task.deletedAt == nil else { return false }
            let dateValue = task.scheduledStartAt ?? task.dueAt
            return dateValue.map { productDayString(from: $0) } == localDate
        }
        let sortedTasks = datedTasks.sorted { lhs, rhs in
            (lhs.scheduledStartAt ?? lhs.dueAt ?? "") == (rhs.scheduledStartAt ?? rhs.dueAt ?? "")
                ? lhs.sortOrder < rhs.sortOrder
                : (lhs.scheduledStartAt ?? lhs.dueAt ?? "") < (rhs.scheduledStartAt ?? rhs.dueAt ?? "")
        }
        let activeTasks = sortedTasks.filter { $0.status != .completed && $0.status != .canceled && $0.status != .archived }
        let nextTask = snapshot.tasks
            .filter { $0.deletedAt == nil && $0.status != .completed && $0.status != .canceled && $0.status != .archived }
            .compactMap { task -> (ProductivityTask, Date)? in
                guard let value = task.scheduledStartAt ?? task.dueAt,
                      let date = iTuDateSupport.parse(value), date >= now else { return nil }
                return (task, date)
            }
            .sorted { $0.1 == $1.1 ? $0.0.sortOrder < $1.0.sortOrder : $0.1 < $1.1 }
            .first?.0

        let occurrences = Dictionary(uniqueKeysWithValues: snapshot.habitOccurrences
            .filter { productDayString(from: $0.occurrenceDate) == localDate }
            .map { ($0.habitId, $0) })
        let habitsRemaining = snapshot.habits.reduce(into: 0) { count, habit in
            guard habit.archivedAt == nil, let occurrence = occurrences[habit.id] else { return }
            if occurrence.status != .completed { count += 1 }
        }

        let activeFocus = snapshot.focusSessions
            .filter { $0.status == .active || $0.status == .paused }
            .sorted { $0.startedAt > $1.startedAt }
            .first
            .map { session in
                WidgetFocusSnapshot(
                    id: session.id,
                    title: session.customTitle ?? session.taskTitleSnapshot ?? "Focus",
                    status: session.status,
                    phase: session.phase,
                    plannedSeconds: session.plannedSeconds,
                    startedAt: session.startedAt,
                    pausedAt: session.pausedAt,
                    accumulatedPauseSeconds: session.accumulatedPauseSecs
                )
            }

        func taskSnapshot(_ task: ProductivityTask) -> WidgetTaskSnapshot {
            WidgetTaskSnapshot(id: task.id, title: task.title, status: task.status, dueAt: task.dueAt, scheduledStartAt: task.scheduledStartAt)
        }

        let completed = datedTasks.filter { $0.status == .completed }.count
        return WidgetSnapshot(
            accountID: accountID,
            generatedAt: iTuDateSupport.string(from: now),
            localDate: localDate,
            taskTotal: datedTasks.count,
            taskCompleted: completed,
            taskRemaining: max(0, datedTasks.count - completed),
            nextTask: nextTask.map(taskSnapshot),
            todayTasks: activeTasks.prefix(3).map(taskSnapshot),
            habitsRemaining: habitsRemaining,
            activeFocus: activeFocus
        )
    }
}
