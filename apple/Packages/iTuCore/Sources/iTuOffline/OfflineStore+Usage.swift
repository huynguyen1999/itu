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

    /// Drops application usage rows written before engaged-time tracking existed.
    /// Website summaries are compatible and intentionally left untouched.
    func cleanupLegacyUsage() throws -> OfflineSnapshot {
        let remaining = state.usageSummaries.filter { $0.engagedSeconds != nil }
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

    /// Replaces the complete DeviceActivity app and website buckets represented
    /// by this snapshot. A submitted date/hour window is authoritative: rows
    /// omitted from that window are removed, while other sources and windows
    /// remain untouched.
    @discardableResult
    func replaceDeviceActivityUsage(
        deviceId: String,
        summaries: [UsageSummary] = [],
        websiteSummaries: [WebsiteUsageSummary] = [],
        windows: Set<DeviceActivityUsageWindow> = []
    ) throws -> OfflineSnapshot {
        let submittedWindows = Set(windows.map { DeviceActivityWindow(localDate: $0.localDate, hour: $0.hour) })
        let appWindows = submittedWindows.union(summaries.map { DeviceActivityWindow(localDate: $0.localDate, hour: $0.hour) })
        let websiteWindows = submittedWindows.union(websiteSummaries.map { DeviceActivityWindow(localDate: $0.localDate, hour: $0.hour) })

        if !appWindows.isEmpty {
            state.usageSummaries.removeAll { summary in
                summary.source == .deviceActivity &&
                    summary.deviceId == deviceId &&
                    appWindows.contains(DeviceActivityWindow(localDate: summary.localDate, hour: summary.hour))
            }
        }
        if !websiteWindows.isEmpty {
            state.websiteUsageSummaries.removeAll { summary in
                summary.source == .deviceActivity &&
                    summary.deviceId == deviceId &&
                    websiteWindows.contains(DeviceActivityWindow(localDate: summary.localDate, hour: summary.hour))
            }
        }

        var appSeen: Set<String> = []
        for var summary in summaries {
            summary.source = .deviceActivity
            summary.deviceId = deviceId
            guard appSeen.insert(summary.id).inserted else { continue }
            state.usageSummaries.append(summary)
        }

        var websiteSeen: Set<String> = []
        for var summary in websiteSummaries {
            summary.source = .deviceActivity
            summary.deviceId = deviceId
            summary.browserBundleId = nil
            guard websiteSeen.insert(summary.id).inserted else { continue }
            state.websiteUsageSummaries.append(summary)
        }

        let remainingUsage = Set(state.usageSummaries.map(\.id))
        state.usageUploadWatermarks = state.usageUploadWatermarks.filter { remainingUsage.contains($0.key) }
        let remainingWebsite = Set(state.websiteUsageSummaries.map(\.id))
        state.websiteUsageUploadWatermarks = state.websiteUsageUploadWatermarks.filter { remainingWebsite.contains($0.key) }
        try persist()
        return state
    }

    /// Convenience overload for app-only DeviceActivity snapshots.
    @discardableResult
    func replaceDeviceActivityUsage(_ summaries: [UsageSummary], deviceId: String) throws -> OfflineSnapshot {
        try replaceDeviceActivityUsage(deviceId: deviceId, summaries: summaries)
    }

    /// Convenience overload for website-only DeviceActivity snapshots.
    @discardableResult
    func replaceDeviceActivityWebsiteUsage(_ summaries: [WebsiteUsageSummary], deviceId: String) throws -> OfflineSnapshot {
        try replaceDeviceActivityUsage(deviceId: deviceId, websiteSummaries: summaries)
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
