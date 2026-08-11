import Foundation

extension OfflineStore {
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
        let cutoffKey = UsageDateFormatter.string(from: cutoff, calendar: calendar)
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
