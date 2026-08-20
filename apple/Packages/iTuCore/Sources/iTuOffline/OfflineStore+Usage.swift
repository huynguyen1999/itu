import Foundation
import iTuDomain

private enum OfflineUsageDateFormatter {
    static func string(from date: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }
}

private struct DeviceActivityWindow: Hashable {
    let localDate: String
    let hour: Int
}

public extension OfflineStore {
    func usageSummaries() -> [UsageSummary] { state.usageSummaries }

    func usageAppIconUploadHashes() -> [String: String] { state.usageAppIconUploadHashes }

    func markUsageAppIconUploaded(bundleID: String, hash: String) throws -> OfflineSnapshot {
        state.usageAppIconUploadHashes[bundleID] = hash
        try persist()
        return state
    }

    /// Drops application usage rows written before engaged-time tracking existed or matching system-excluded bundles (e.g. loginwindow).
    /// Website summaries are compatible and intentionally left untouched.
    func cleanupLegacyUsage() throws -> OfflineSnapshot {
        let remaining = state.usageSummaries.filter { summary in
            let lower = summary.bundleId.lowercased()
            if lower.contains("loginwindow") ||
               lower.contains("lockscreen") ||
               lower.contains("screensaver") ||
               lower.contains("controlcenter") ||
               lower.contains("control-center") ||
               lower.contains("clockangel") ||
               lower.contains("posterboard") ||
               lower.contains("passbookuiservice") ||
               lower.contains("authkituiservice") ||
               lower.contains("authenticationservicesui") ||
               lower.contains("ctnotifyuiservice") ||
               lower.contains("localauthentication") ||
               lower.contains("screenshotservices") ||
               lower.contains("problemreporter") ||
               lower.contains("springboard") ||
               lower.hasPrefix("com.apple.control-center") ||
               lower.hasPrefix("com.apple.controlcenter") ||
               lower.hasPrefix("com.apple.windowmanager") ||
               lower.hasPrefix("com.apple.systemuiserver") ||
               lower.hasPrefix("com.apple.dock") ||
               lower.hasPrefix("com.apple.notificationcenter") ||
               lower.hasPrefix("com.apple.usernotificationcenter") ||
               lower.hasPrefix("com.apple.springboard") {
                return false
            }
            if summary.engagedSeconds == nil && summary.source == .macOSForeground {
                return false
            }
            return true
        }
        guard remaining.count != state.usageSummaries.count else { return state }
        state.usageSummaries = remaining
        let ids = Set(remaining.map(\.id))
        state.usageUploadWatermarks = state.usageUploadWatermarks.filter { ids.contains($0.key) }
        try persist()
        return state
    }

    func websiteUsageSummaries() -> [WebsiteUsageSummary] { state.websiteUsageSummaries }

    func usageSummaries(from: String?, to: String?) -> [UsageSummary] {
        state.usageSummaries.filter { summary in
            (from == nil || summary.localDate >= from!) && (to == nil || summary.localDate <= to!)
        }
    }

    func websiteUsageSummaries(from: String?, to: String?) -> [WebsiteUsageSummary] {
        state.websiteUsageSummaries.filter { summary in
            (from == nil || summary.localDate >= from!) && (to == nil || summary.localDate <= to!)
        }
    }

    func upsertUsage(_ summary: UsageSummary) throws -> OfflineSnapshot {
        if let index = state.usageSummaries.firstIndex(where: { $0.id == summary.id }) {
            state.usageSummaries[index].activeSeconds += summary.activeSeconds
            state.usageSummaries[index].displayName = summary.displayName
            if let addEngaged = summary.engagedSeconds {
                let currentEngaged = state.usageSummaries[index].engagedSeconds ?? 0
                state.usageSummaries[index].engagedSeconds = currentEngaged + addEngaged
            }
        } else {
            state.usageSummaries.append(summary)
        }
        try persist()
        return state
    }

    /// Replaces the complete DeviceActivity app buckets represented
    /// by this snapshot. A submitted date/hour window is authoritative: rows
    /// omitted from that window are removed, while other sources and windows
    /// remain untouched.
    @discardableResult
    func replaceDeviceActivityUsage(
        deviceId: String,
        summaries: [UsageSummary] = [],
        windows: Set<DeviceActivityUsageWindow> = []
    ) throws -> OfflineSnapshot {
        let submittedWindows = Set(windows.map { DeviceActivityWindow(localDate: $0.localDate, hour: $0.hour) })
        let appWindows = submittedWindows.union(summaries.map { DeviceActivityWindow(localDate: $0.localDate, hour: $0.hour) })

        if !appWindows.isEmpty {
            state.usageSummaries.removeAll { summary in
                summary.source == .deviceActivity &&
                    summary.deviceId == deviceId &&
                    appWindows.contains(DeviceActivityWindow(localDate: summary.localDate, hour: summary.hour))
            }
        }

        var appSeen: Set<String> = []
        for var summary in summaries {
            summary.source = .deviceActivity
            summary.deviceId = deviceId
            guard appSeen.insert(summary.id).inserted else { continue }
            state.usageSummaries.append(summary)
        }

        let remainingUsage = Set(state.usageSummaries.map(\.id))
        state.usageUploadWatermarks = state.usageUploadWatermarks.filter { remainingUsage.contains($0.key) }
        try persist()
        return state
    }

    /// Convenience overload for app-only DeviceActivity snapshots.
    @discardableResult
    func replaceDeviceActivityUsage(_ summaries: [UsageSummary], deviceId: String) throws -> OfflineSnapshot {
        try replaceDeviceActivityUsage(deviceId: deviceId, summaries: summaries)
    }

    func usageSummariesToUpload() -> [UsageSummary] {
        state.usageSummaries.compactMap { summary in
            let watermark = state.usageUploadWatermarks[summary.id]
            let activeChanged = watermark?.activeSeconds != summary.activeSeconds
            let engagedChanged = summary.engagedSeconds != nil && watermark?.engagedSeconds != summary.engagedSeconds
            guard activeChanged || engagedChanged else { return nil }
            return summary
        }
    }

    func websiteUsageSummariesToUpload() -> [WebsiteUsageSummary] {
        state.websiteUsageSummaries.filter { state.websiteUsageUploadWatermarks[$0.id] != $0.activeSeconds }
    }

    func pendingUsageDeltas(from: String?, to: String?) -> [UsageSummary] {
        usageSummaries(from: from, to: to).compactMap { summary in
            let watermark = state.usageUploadWatermarks[summary.id]
            let pendingActive = summary.activeSeconds - (watermark?.activeSeconds ?? 0)

            var pendingEngaged: Int? = nil
            if let currentEngaged = summary.engagedSeconds {
                let watermarkEngaged = watermark?.engagedSeconds ?? 0
                pendingEngaged = max(0, currentEngaged - watermarkEngaged)
            }

            guard pendingActive > 0 || (pendingEngaged ?? 0) > 0 else { return nil }
            var pending = summary
            pending.activeSeconds = max(0, pendingActive)
            pending.engagedSeconds = pendingEngaged
            return pending
        }
    }

    func pendingWebsiteUsageDeltas(from: String?, to: String?) -> [WebsiteUsageSummary] {
        websiteUsageSummaries(from: from, to: to).compactMap { summary in
            let pendingSeconds = summary.activeSeconds - (state.websiteUsageUploadWatermarks[summary.id] ?? 0)
            guard pendingSeconds > 0 else { return nil }
            var pending = summary
            pending.activeSeconds = pendingSeconds
            return pending
        }
    }

    func markUsageUploaded(_ summaries: [UsageSummary]) throws -> OfflineSnapshot {
        for summary in summaries {
            state.usageUploadWatermarks[summary.id] = UsageUploadWatermark(
                activeSeconds: summary.activeSeconds,
                engagedSeconds: summary.engagedSeconds
            )
        }
        try persist()
        return state
    }

    @discardableResult
    func upsertWebsiteUsage(_ summary: WebsiteUsageSummary) throws -> OfflineSnapshot {
        if let index = state.websiteUsageSummaries.firstIndex(where: { $0.id == summary.id }) {
            state.websiteUsageSummaries[index].activeSeconds += summary.activeSeconds
            state.websiteUsageSummaries[index].browserDisplayName = summary.browserDisplayName
        } else {
            state.websiteUsageSummaries.append(summary)
        }
        try persist()
        return state
    }

    func markWebsiteUsageUploaded(_ summaries: [WebsiteUsageSummary]) throws -> OfflineSnapshot {
        for summary in summaries { state.websiteUsageUploadWatermarks[summary.id] = summary.activeSeconds }
        try persist()
        return state
    }

    func deleteUsage(from: String?, to: String?) throws -> OfflineSnapshot {
        state.usageSummaries.removeAll { summary in
            (from == nil || summary.localDate >= from!) && (to == nil || summary.localDate <= to!)
        }
        state.websiteUsageSummaries.removeAll { summary in
            (from == nil || summary.localDate >= from!) && (to == nil || summary.localDate <= to!)
        }
        let remaining = Set(state.usageSummaries.map(\.id))
        state.usageUploadWatermarks = state.usageUploadWatermarks.filter { remaining.contains($0.key) }
        let remainingWebsite = Set(state.websiteUsageSummaries.map(\.id))
        state.websiteUsageUploadWatermarks = state.websiteUsageUploadWatermarks.filter { remainingWebsite.contains($0.key) }
        try persist()
        return state
    }

    func pruneUsage(keeping days: Int, now: Date = Date(), calendar: Calendar = .current) throws -> OfflineSnapshot {
        let cutoff = calendar.date(byAdding: .day, value: -(max(7, min(365, days)) - 1), to: now) ?? now
        let cutoffKey = OfflineUsageDateFormatter.string(from: cutoff, calendar: calendar)
        state.usageSummaries.removeAll { $0.localDate < cutoffKey }
        let remaining = Set(state.usageSummaries.map(\.id))
        state.usageUploadWatermarks = state.usageUploadWatermarks.filter { remaining.contains($0.key) }
        state.websiteUsageSummaries.removeAll { $0.localDate < cutoffKey }
        let remainingWebsite = Set(state.websiteUsageSummaries.map(\.id))
        state.websiteUsageUploadWatermarks = state.websiteUsageUploadWatermarks.filter { remainingWebsite.contains($0.key) }
        try persist()
        return state
    }
}
