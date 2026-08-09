import Foundation

extension OfflineStore {
    func usageSummaries() -> [UsageSummary] { state.usageSummaries }

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
        } else {
            state.usageSummaries.append(summary)
        }
        try persist()
        return state
    }

    func usageSummariesToUpload() -> [UsageSummary] {
        state.usageSummaries.filter { state.usageUploadWatermarks[$0.id] != $0.activeSeconds }
    }

    func websiteUsageSummariesToUpload() -> [WebsiteUsageSummary] {
        state.websiteUsageSummaries.filter { state.websiteUsageUploadWatermarks[$0.id] != $0.activeSeconds }
    }

    func pendingUsageDeltas(from: String?, to: String?) -> [UsageSummary] {
        usageSummaries(from: from, to: to).compactMap { summary in
            let pendingSeconds = summary.activeSeconds - (state.usageUploadWatermarks[summary.id] ?? 0)
            guard pendingSeconds > 0 else { return nil }
            var pending = summary
            pending.activeSeconds = pendingSeconds
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
        for summary in summaries { state.usageUploadWatermarks[summary.id] = summary.activeSeconds }
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
