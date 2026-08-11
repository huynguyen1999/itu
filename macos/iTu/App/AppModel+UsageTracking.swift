import AppKit
import Foundation

extension AppModel {
    func setupUsageTracking() {
        let accountID = user?.id ?? "anonymous"
        let sessionStore = UsageSessionStore(accountID: accountID)
        self.usageSessionStore = sessionStore

        let tracker = ForegroundUsageTracker()
        tracker.setIdleThreshold(TimeInterval(settingsStore.usagePreferences.idleThresholdSeconds))
        tracker.setExcludedBundleIDs(settingsStore.usagePreferences.excludedBundleIds)

        tracker.onSummaryChanged = { [weak self] summary in
            guard let self else { return }
            Task { @MainActor in
                do {
                    let latestDate = await self.offlineStore.usageSummaries().map(\.localDate).max()
                    let snapshot = try await self.offlineStore.upsertUsage(summary)
                    self.localUsageSummaries = snapshot.usageSummaries
                    if let statistics = self.usageStatistics {
                        self.usageStatistics = statistics.adding([summary])
                    }
                    if self.usageIsLocalOnly { self.usageError = nil }
                    if let latestDate, summary.localDate > latestDate {
                        self.usageUploadTask?.cancel()
                        self.usageUploadTask = nil
                        await self.uploadUsage()
                    } else {
                        self.scheduleUsageUpload()
                    }
                } catch {
                    self.usageError = error.localizedDescription
                }
            }
        }

        tracker.onSegmentCreated = { [weak self] segment in
            guard let self else { return }
            Task {
                try? await sessionStore.appendSegments([segment])
            }
        }

        self.usageTracker = tracker

        let webTracker = WebsiteUsageTracker()
        webTracker.onSummaryChanged = { [weak self] summary in
            guard let self else { return }
            Task { @MainActor in
                do {
                    let snapshot = try await self.offlineStore.upsertWebsiteUsage(summary)
                    self.localWebsiteUsageSummaries = snapshot.websiteUsageSummaries
                    self.scheduleUsageUpload()
                } catch {
                    self.usageError = error.localizedDescription
                }
            }
        }
        self.websiteUsageTracker = webTracker

        settingsStore.onUsagePreferencesChanged = { [weak self] preferences in
            self?.applyUsagePreferences(preferences)
        }
    }

    func startUsageTracking() {
        guard user != nil else { return }
        usageTracker?.setIdleThreshold(TimeInterval(settingsStore.usagePreferences.idleThresholdSeconds))
        usageTracker?.setExcludedBundleIDs(settingsStore.usagePreferences.excludedBundleIds)
        usageTracker?.setEnabled(settingsStore.usagePreferences.enabled)
        usageTracker?.setPaused(settingsStore.usagePreferences.paused)
        websiteUsageTracker?.setEnabled(settingsStore.usagePreferences.enabled && settingsStore.usagePreferences.websiteTrackingEnabled)
        websiteUsageTracker?.setPaused(settingsStore.usagePreferences.paused)

        startDurabilityCheckpointTimer()

        Task { @MainActor [weak self] in
            guard let self else { return }
            if let snapshot = try? await self.offlineStore.pruneUsage(keeping: self.settingsStore.usagePreferences.retentionDays) {
                self.apply(snapshot)
            }
            if let store = self.usageSessionStore {
                _ = try? await store.pruneSessions(keeping: self.settingsStore.usagePreferences.retentionDays)
            }
        }
    }

    func applyUsagePreferences(_ preferences: UsagePreferences) {
        usageTracker?.setIdleThreshold(TimeInterval(preferences.idleThresholdSeconds))
        usageTracker?.setExcludedBundleIDs(preferences.excludedBundleIds)
        usageTracker?.setEnabled(preferences.enabled)
        usageTracker?.setPaused(preferences.paused)
        websiteUsageTracker?.setEnabled(preferences.enabled && preferences.websiteTrackingEnabled)
        websiteUsageTracker?.setPaused(preferences.paused)

        if preferences.enabled { scheduleUsageUpload() }

        Task { @MainActor [weak self] in
            guard let self else { return }
            if let snapshot = try? await self.offlineStore.pruneUsage(keeping: preferences.retentionDays) {
                self.apply(snapshot)
            }
            if let store = self.usageSessionStore {
                _ = try? await store.pruneSessions(keeping: preferences.retentionDays)
            }
        }

        Task {
            guard user != nil else { return }
            _ = try? await apiClient.updateUsagePreferences(preferences)
        }
    }

    func startDurabilityCheckpointTimer() {
        usageCheckpointTimer?.invalidate()
        usageCheckpointTimer = Timer.scheduledTimer(withTimeInterval: 120, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.usageTracker?.tick()
                self?.websiteUsageTracker?.tick()
            }
        }
    }

    func scheduleUsageUpload() {
        guard usageUploadTask == nil else { return }
        usageUploadTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(900))
            guard let self, !Task.isCancelled else { return }
            self.usageUploadTask = nil
            _ = await self.uploadUsage()
        }
    }

    @discardableResult
    func uploadUsage() async -> Bool {
        guard user != nil else { return false }
        var failed = false
        let pending = await offlineStore.usageSummariesToUpload()
        if !pending.isEmpty {
            do {
                try await apiClient.uploadUsageSummaries(pending, deviceId: syncCoordinator.syncDeviceId)
                apply(try await offlineStore.markUsageUploaded(pending))
            } catch {
                usageError = error.localizedDescription
                failed = true
            }
        }
        let pendingWebsites = await offlineStore.websiteUsageSummariesToUpload()
        if !pendingWebsites.isEmpty {
            do {
                try await apiClient.uploadWebsiteUsageSummaries(pendingWebsites, deviceId: syncCoordinator.syncDeviceId)
                apply(try await offlineStore.markWebsiteUsageUploaded(pendingWebsites))
                websiteUsageError = nil
            } catch {
                websiteUsageError = error.localizedDescription
                failed = true
            }
        }
        if failed { scheduleUsageUpload() }
        return !failed
    }

    func refreshUsage(from: String? = nil, to: String? = nil) async {
        usageLoading = true
        usageError = nil
        websiteUsageError = nil
        defer { usageLoading = false }
        usageUploadTask?.cancel()
        usageUploadTask = nil
        await uploadUsage()
        let local = await offlineStore.usageSummaries(from: from, to: to)
        let localWeb = await offlineStore.websiteUsageSummaries(from: from, to: to)
        do {
            let server = try await apiClient.fetchUsage(from: from, to: to)
            let pending = await offlineStore.pendingUsageDeltas(from: from, to: to)
            usageServerStatistics = server
            usageIsLocalOnly = false
            usageStatistics = server.adding(pending)
            usageError = nil
        } catch {
            usageServerStatistics = nil
            usageIsLocalOnly = true
            usageStatistics = .aggregating(local)
            usageError = local.isEmpty ? error.localizedDescription : nil
        }
        do {
            let serverWeb = try await apiClient.fetchWebsiteUsage(from: from, to: to)
            let pendingWeb = await offlineStore.pendingWebsiteUsageDeltas(from: from, to: to)
            websiteUsageStatistics = serverWeb.adding(pendingWeb)
            websiteUsageError = nil
        } catch {
            websiteUsageStatistics = .aggregating(localWeb)
            websiteUsageError = error.localizedDescription
        }
    }

    func fetchLocalTimelineSegments(from fromDate: String? = nil, to toDate: String? = nil) async -> [UsageTimelineSegment] {
        guard let store = usageSessionStore else { return [] }
        return (try? await store.segments(from: fromDate, to: toDate)) ?? []
    }

    func deleteUsage(from: String? = nil, to: String? = nil) async {
        do {
            try await apiClient.deleteUsage(from: from, to: to)
            try await apiClient.deleteWebsiteUsage(from: from, to: to)
            apply(try await offlineStore.deleteUsage(from: from, to: to))
            if let store = usageSessionStore {
                _ = try? await store.deleteSessions(from: from, to: to, all: from == nil && to == nil)
            }
            usageStatistics = nil
            websiteUsageStatistics = nil
        } catch {
            usageError = error.localizedDescription
        }
    }

    func stopUsageTracking() {
        usageCheckpointTimer?.invalidate()
        usageCheckpointTimer = nil
        usageUploadTask?.cancel()
        usageUploadTask = nil
        usageTracker?.stop()
        websiteUsageTracker?.stop()
    }
}
