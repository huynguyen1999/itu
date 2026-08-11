import AppKit
import Foundation

enum UsageSuspensionReason: Hashable, Sendable {
    case userPaused
    case sessionInactive
    case screenSleeping
    case systemSleeping
}

/// Records foreground application Screen Time and Engaged Time after the user explicitly opts in.
@MainActor
final class ForegroundUsageTracker {
    static let fixedExcludedBundleIDs: Set<String> = [
        "com.huynguyen.itu",
        Bundle.main.bundleIdentifier ?? "",
        "com.apple.loginwindow",
        "com.apple.ScreenSaver.Engine",
        "com.apple.systemuiserver",
        "com.apple.dock"
    ]

    private let workspace: NSWorkspace
    private let defaults: UserDefaults
    private let calendar: Calendar
    private let idleMonitor: any IdleTimeProviding
    private var observers: [NSObjectProtocol] = []
    private var idleTimer: Timer?

    private(set) var currentBundleID: String?
    private(set) var currentDisplayName = ""
    private var lastObservedAt: Date?
    private(set) var isRunning = false
    private(set) var suspensionReasons: Set<UsageSuspensionReason> = []
    private(set) var isEngaged = true

    var idleThresholdSeconds: TimeInterval = 300
    var userExcludedBundleIDs: Set<String> = []

    var onSummaryChanged: ((UsageSummary) -> Void)?
    var onSegmentCreated: ((UsageTimelineSegment) -> Void)?

    var isTrackingAllowed: Bool {
        isRunning && suspensionReasons.isEmpty
    }

    init(
        workspace: NSWorkspace = .shared,
        defaults: UserDefaults = .standard,
        calendar: Calendar = .current,
        idleMonitor: any IdleTimeProviding = CoreGraphicsIdleMonitor()
    ) {
        self.workspace = workspace
        self.defaults = defaults
        self.calendar = calendar
        self.idleMonitor = idleMonitor
    }

    func setIdleThreshold(_ seconds: TimeInterval) {
        self.idleThresholdSeconds = max(60, min(1800, seconds))
    }

    func setExcludedBundleIDs(_ bundleIDs: [String]) {
        self.userExcludedBundleIDs = Set(bundleIDs)
    }

    func isBundleExcluded(_ bundleID: String) -> Bool {
        Self.fixedExcludedBundleIDs.contains(bundleID) || userExcludedBundleIDs.contains(bundleID)
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true
        suspensionReasons.remove(.userPaused)
        installObservers()

        let now = Date()
        let frontmost = workspace.frontmostApplication
        let savedBundle = defaults.string(forKey: "itu_usage_current_bundle")
        let rawBundle = frontmost?.bundleIdentifier ?? savedBundle
        let rawName = frontmost?.localizedName ?? defaults.string(forKey: "itu_usage_current_name") ?? "Unknown Application"

        if let b = rawBundle, !isBundleExcluded(b) {
            currentBundleID = b
            currentDisplayName = rawName
        } else {
            currentBundleID = nil
            currentDisplayName = ""
        }

        lastObservedAt = now
        isEngaged = true
        tick(at: now)
        persistRuntimeState()

        idleTimer?.invalidate()
        idleTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.evaluateIdleStateAndTick() }
        }
    }

    func stop() {
        guard isRunning else { return }
        tick()
        isRunning = false
        suspensionReasons.insert(.userPaused)
        idleTimer?.invalidate()
        idleTimer = nil
        removeObservers()
        defaults.removeObject(forKey: "itu_usage_current_bundle")
        defaults.removeObject(forKey: "itu_usage_current_name")
    }

    func setEnabled(_ enabled: Bool) {
        if enabled { start() } else { stop() }
    }

    func setPaused(_ value: Bool) {
        guard isRunning else { return }
        if value {
            if !suspensionReasons.contains(.userPaused) {
                tick()
                suspensionReasons.insert(.userPaused)
                lastObservedAt = Date()
            }
        } else {
            if suspensionReasons.contains(.userPaused) {
                suspensionReasons.remove(.userPaused)
                lastObservedAt = Date()
                tick()
            }
        }
    }

    func applicationActivated(bundleID: String, displayName: String, at date: Date = Date()) {
        guard isRunning else { return }
        tick(at: date)
        if isBundleExcluded(bundleID) {
            currentBundleID = nil
            currentDisplayName = ""
        } else {
            currentBundleID = bundleID
            currentDisplayName = displayName
        }
        lastObservedAt = date
        persistRuntimeState()
    }

    func evaluateIdleStateAndTick(at date: Date = Date()) {
        guard isTrackingAllowed else { return }

        let idleSec = idleMonitor.secondsSinceLastInput()
        if isEngaged {
            if idleSec > idleThresholdSeconds {
                let transitionTime = max(lastObservedAt ?? date, date.addingTimeInterval(-idleSec + idleThresholdSeconds))
                tick(at: transitionTime)
                isEngaged = false
                tick(at: date)
            } else {
                tick(at: date)
            }
        } else {
            if idleSec <= idleThresholdSeconds {
                let resumeTime = max(lastObservedAt ?? date, date.addingTimeInterval(-idleSec))
                tick(at: resumeTime)
                isEngaged = true
                tick(at: date)
            } else {
                tick(at: date)
            }
        }
    }

    func tick(at date: Date = Date()) {
        guard isTrackingAllowed else {
            lastObservedAt = date
            return
        }
        guard let bundleID = currentBundleID, !isBundleExcluded(bundleID) else {
            lastObservedAt = date
            return
        }

        let previous = lastObservedAt ?? date
        if date > previous {
            accrue(from: previous, to: date, engaged: isEngaged)
        }
        lastObservedAt = date
    }

    private func accrue(from start: Date, to end: Date, engaged: Bool) {
        guard end > start, let bundleID = currentBundleID, !isBundleExcluded(bundleID) else { return }

        let segment = UsageTimelineSegment(
            bundleId: bundleID,
            displayName: currentDisplayName,
            startedAt: start,
            endedAt: end,
            state: engaged ? .engaged : .idle,
            timezone: calendar.timeZone.identifier
        )
        onSegmentCreated?(segment)

        var cursor = start
        while cursor < end {
            let dayStart = calendar.startOfDay(for: cursor)
            let nextDay = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? end
            let nextHour = calendar.dateInterval(of: .hour, for: cursor)?.end ?? nextDay
            let segmentEnd = min(end, min(nextDay, nextHour))
            let segmentSeconds = Int(max(0, segmentEnd.timeIntervalSince(cursor).rounded(.down)))
            if segmentSeconds > 0 {
                let dateStr = UsageDateFormatter.string(from: cursor, calendar: calendar)
                let hourVal = calendar.component(.hour, from: cursor)
                let activeSec = segmentSeconds
                let engagedSec = engaged ? segmentSeconds : 0

                onSummaryChanged?(UsageSummary(
                    localDate: dateStr,
                    hour: hourVal,
                    bundleId: bundleID,
                    displayName: currentDisplayName,
                    timezone: calendar.timeZone.identifier,
                    activeSeconds: activeSec,
                    engagedSeconds: engagedSec
                ))
            }
            cursor = segmentEnd
        }
    }

    private func installObservers() {
        removeObservers()
        let center = workspace.notificationCenter

        observers.append(center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  let bundleID = app.bundleIdentifier else { return }
            let displayName = app.localizedName ?? bundleID
            Task { @MainActor [weak self] in
                self?.applicationActivated(bundleID: bundleID, displayName: displayName)
            }
        })

        let resignActiveObs = center.addObserver(forName: NSWorkspace.sessionDidResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.addSuspensionReason(.sessionInactive) }
        }
        let screenSleepObs = center.addObserver(forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.addSuspensionReason(.screenSleeping) }
        }
        let systemSleepObs = center.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.addSuspensionReason(.systemSleeping) }
        }

        let becomeActiveObs = center.addObserver(forName: NSWorkspace.sessionDidBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.removeSuspensionReason(.sessionInactive) }
        }
        let screenWakeObs = center.addObserver(forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.removeSuspensionReason(.screenSleeping) }
        }
        let systemWakeObs = center.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.removeSuspensionReason(.systemSleeping) }
        }

        observers.append(contentsOf: [resignActiveObs, screenSleepObs, systemSleepObs, becomeActiveObs, screenWakeObs, systemWakeObs])
    }

    private func addSuspensionReason(_ reason: UsageSuspensionReason) {
        guard isRunning else { return }
        if suspensionReasons.isEmpty {
            tick()
        }
        suspensionReasons.insert(reason)
        lastObservedAt = Date()
    }

    private func removeSuspensionReason(_ reason: UsageSuspensionReason) {
        guard isRunning else { return }
        suspensionReasons.remove(reason)
        lastObservedAt = Date()
        if suspensionReasons.isEmpty {
            tick()
        }
    }

    private func removeObservers() {
        let center = workspace.notificationCenter
        for observer in observers {
            center.removeObserver(observer)
        }
        observers.removeAll()
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
