import AppKit
import Foundation

@MainActor
final class WebsiteUsageTracker {
    private let workspace: NSWorkspace
    private let calendar: Calendar
    private let stateURL: URL?
    private let frontmostBundleID: () -> String?
    private var observers: [NSObjectProtocol] = []
    private var timer: Timer?
    private var currentHostname: String?
    private var currentBrowserBundleID: String?
    private var lastObservedAt: Date?
    private var paused = true
    private(set) var isRunning = false
    var onSummaryChanged: ((WebsiteUsageSummary) -> Void)?

    init(
        workspace: NSWorkspace = .shared,
        calendar: Calendar = .current,
        stateURL: URL? = BrowserActivityState.appGroupURL,
        frontmostBundleID: @escaping () -> String? = { NSWorkspace.shared.frontmostApplication?.bundleIdentifier }
    ) {
        self.workspace = workspace
        self.calendar = calendar
        self.stateURL = stateURL
        self.frontmostBundleID = frontmostBundleID
    }

    func start(at date: Date = Date()) {
        guard !isRunning else { return }
        isRunning = true
        paused = false
        currentHostname = nil
        currentBrowserBundleID = nil
        lastObservedAt = date
        installObservers()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.tick() }
        }
    }

    func stop(at date: Date = Date()) {
        guard isRunning else { return }
        tick(at: date)
        isRunning = false
        paused = true
        currentHostname = nil
        currentBrowserBundleID = nil
        timer?.invalidate()
        timer = nil
        observers.forEach(NotificationCenter.default.removeObserver)
        observers.removeAll()
    }

    func setEnabled(_ enabled: Bool, at date: Date = Date()) {
        if enabled { start(at: date) } else { stop(at: date) }
    }

    func setPaused(_ value: Bool, at date: Date = Date()) {
        guard isRunning, paused != value else { return }
        if value { tick(at: date) }
        paused = value
        lastObservedAt = date
        currentHostname = nil
        currentBrowserBundleID = nil
    }

    func tick(at date: Date = Date()) {
        guard isRunning, !paused else {
            lastObservedAt = date
            return
        }

        guard let eligible = eligibleHostname(at: date) else {
            if let currentHostname, let lastObservedAt {
                accrue(
                    hostname: currentHostname,
                    bundleID: currentBrowserBundleID ?? BrowserActivityState.edgeBundleID,
                    from: lastObservedAt,
                    to: date
                )
            }
            currentHostname = nil
            currentBrowserBundleID = nil
            lastObservedAt = date
            return
        }

        if eligible.hostname != currentHostname || eligible.browserBundleID != currentBrowserBundleID {
            if let currentHostname, let lastObservedAt {
                accrue(
                    hostname: currentHostname,
                    bundleID: currentBrowserBundleID ?? BrowserActivityState.edgeBundleID,
                    from: lastObservedAt,
                    to: date
                )
            }
            currentHostname = eligible.hostname
            currentBrowserBundleID = eligible.browserBundleID
            lastObservedAt = date
            return
        }

        let previous = lastObservedAt ?? date
        accrue(hostname: eligible.hostname, bundleID: eligible.browserBundleID, from: previous, to: date)
        lastObservedAt = date
    }

    private func eligibleHostname(at date: Date) -> (hostname: String, browserBundleID: String)? {
        guard let frontmost = frontmostBundleID(),
              let stateURL,
              let state = BrowserActivityState.load(from: stateURL),
              state.protocolVersion == BrowserActivityState.protocolVersion,
              BrowserActivityState.supportedBrowserBundleIDs.contains(frontmost),
              state.browserBundleId == frontmost,
              state.connected,
              state.state == "active",
              !state.incognito,
              let updated = state.updatedDate,
              date >= updated,
              date.timeIntervalSince(updated) <= 90,
              let hostname = state.hostname,
              let normalized = BrowserActivityState.normalizeHostname(hostname) else { return nil }
        return (normalized, frontmost)
    }

    private func accrue(hostname: String, bundleID: String, from start: Date, to end: Date) {
        guard end > start else { return }
        let displayName = BrowserActivityState.displayName(for: bundleID)
        var cursor = start
        while cursor < end {
            let dayStart = calendar.startOfDay(for: cursor)
            let nextDay = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? end
            let segmentEnd = min(end, nextDay)
            let seconds = Int(max(0, segmentEnd.timeIntervalSince(cursor).rounded(.down)))
            if seconds > 0 {
                onSummaryChanged?(WebsiteUsageSummary(
                    localDate: UsageDateFormatter.string(from: cursor, calendar: calendar),
                    browserBundleId: bundleID,
                    browserDisplayName: displayName,
                    hostname: hostname,
                    timezone: calendar.timeZone.identifier,
                    activeSeconds: seconds
                ))
            }
            cursor = segmentEnd
        }
    }

    private func installObservers() {
        let center = workspace.notificationCenter
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
}
