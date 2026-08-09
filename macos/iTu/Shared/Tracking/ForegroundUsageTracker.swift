import AppKit
import Foundation

/// Records only the frontmost application after the user explicitly opts in.
@MainActor
final class ForegroundUsageTracker {
    private let workspace: NSWorkspace
    private let defaults: UserDefaults
    private let calendar: Calendar
    private var observers: [NSObjectProtocol] = []
    private var timer: Timer?
    private var currentBundleID: String?
    private var currentDisplayName = ""
    private var lastObservedAt: Date?
    private var paused = true
    private(set) var isRunning = false
    var onSummaryChanged: ((UsageSummary) -> Void)?

    init(workspace: NSWorkspace = .shared, defaults: UserDefaults = .standard, calendar: Calendar = .current) {
        self.workspace = workspace
        self.defaults = defaults
        self.calendar = calendar
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true
        paused = false
        installObservers()
        let now = Date()
        let frontmost = workspace.frontmostApplication
        let savedBundle = defaults.string(forKey: "itu_usage_current_bundle")
        currentBundleID = frontmost?.bundleIdentifier ?? savedBundle
        currentDisplayName = frontmost?.localizedName ?? defaults.string(forKey: "itu_usage_current_name") ?? "Unknown Application"
        // A restart is a hard boundary: never infer foreground time while the
        // process was not running.
        lastObservedAt = now
        tick(at: now)
        persistRuntimeState()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.tick() }
        }
    }

    func stop() {
        guard isRunning else { return }
        tick()
        isRunning = false
        paused = true
        timer?.invalidate()
        timer = nil
        observers.forEach(NotificationCenter.default.removeObserver)
        observers.removeAll()
        defaults.removeObject(forKey: "itu_usage_current_bundle")
        defaults.removeObject(forKey: "itu_usage_current_name")
    }

    func setEnabled(_ enabled: Bool) {
        if enabled { start() } else { stop() }
    }

    func setPaused(_ value: Bool) {
        guard isRunning, paused != value else { return }
        if value { tick() }
        paused = value
        lastObservedAt = Date()
    }

    func applicationActivated(bundleID: String, displayName: String, at date: Date = Date()) {
        guard isRunning else { return }
        tick(at: date)
        currentBundleID = bundleID
        currentDisplayName = displayName
        lastObservedAt = date
        persistRuntimeState()
    }

    func tick(at date: Date = Date()) {
        guard isRunning, !paused else {
            lastObservedAt = date
            return
        }
        guard currentBundleID != nil else {
            lastObservedAt = date
            return
        }
        let previous = lastObservedAt ?? date
        accrue(from: previous, to: date)
        lastObservedAt = date
    }

    private func accrue(from start: Date, to end: Date) {
        guard end > start, let bundleID = currentBundleID else { return }
        var cursor = start
        while cursor < end {
            let dayStart = calendar.startOfDay(for: cursor)
            let nextDay = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? end
            let nextHour = calendar.dateInterval(of: .hour, for: cursor)?.end ?? nextDay
            let segmentEnd = min(end, min(nextDay, nextHour))
            let segmentSeconds = Int(max(0, segmentEnd.timeIntervalSince(cursor).rounded(.down)))
            if segmentSeconds > 0 {
                let date = UsageDateFormatter.string(from: cursor, calendar: calendar)
                onSummaryChanged?(UsageSummary(
                    localDate: date,
                    hour: calendar.component(.hour, from: cursor),
                    bundleId: bundleID,
                    displayName: currentDisplayName,
                    timezone: calendar.timeZone.identifier,
                    activeSeconds: segmentSeconds
                ))
            }
            cursor = segmentEnd
        }
    }

    private func installObservers() {
        let center = workspace.notificationCenter
        observers.append(center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  let bundleID = app.bundleIdentifier else { return }
            let displayName = app.localizedName ?? bundleID
            Task { @MainActor [weak self] in
                self?.applicationActivated(bundleID: bundleID, displayName: displayName)
            }
        })
        let excluded: [Notification.Name] = [
            NSWorkspace.sessionDidResignActiveNotification,
            NSWorkspace.screensDidSleepNotification,
            NSWorkspace.willSleepNotification
        ]
        for name in excluded {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor [weak self] in self?.setPaused(true) }
            })
        }
        let resumed: [Notification.Name] = [
            NSWorkspace.sessionDidBecomeActiveNotification,
            NSWorkspace.screensDidWakeNotification,
            NSWorkspace.didWakeNotification
        ]
        for name in resumed {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor [weak self] in self?.setPaused(false) }
            })
        }
    }

    private func persistRuntimeState() {
        defaults.set(currentBundleID, forKey: "itu_usage_current_bundle")
        defaults.set(currentDisplayName, forKey: "itu_usage_current_name")
    }
}

enum UsageDateFormatter {
    static func string(from date: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }
}
