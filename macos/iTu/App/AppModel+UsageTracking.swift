import AppKit
import Foundation

extension AppModel {
    func setupUsageTracking() {
        let accountID = user?.id ?? "anonymous"
        let trackingGeneration = sessionGeneration
        let trackingStore = offlineStore
        let sessionStore = UsageSessionStore(accountID: accountID)
        self.usageSessionStore = sessionStore

        let tracker = ForegroundUsageTracker()
        tracker.setIdleThreshold(TimeInterval(settingsStore.usagePreferences.idleThresholdSeconds))
        tracker.setExcludedBundleIDs(settingsStore.usagePreferences.excludedBundleIds)

        tracker.onSummaryChanged = { [weak self] summary in
            guard let self else { return }
            guard self.sessionGeneration == trackingGeneration, self.user?.id == accountID else { return }
            Task { @MainActor in
                guard self.sessionGeneration == trackingGeneration, self.user?.id == accountID else { return }
                do {
                    let latestDate = await trackingStore.usageSummaries().map(\.localDate).max()
                    guard self.sessionGeneration == trackingGeneration, self.user?.id == accountID else { return }
                    let snapshot = try await trackingStore.upsertUsage(summary)
                    guard self.sessionGeneration == trackingGeneration, self.user?.id == accountID else { return }
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
            guard self.sessionGeneration == trackingGeneration, self.user?.id == accountID else { return }
            Task { @MainActor in
                guard self.sessionGeneration == trackingGeneration, self.user?.id == accountID else { return }
                do {
                    let latestDate = await trackingStore.websiteUsageSummaries().map(\.localDate).max()
                    guard self.sessionGeneration == trackingGeneration, self.user?.id == accountID else { return }
                    let snapshot = try await trackingStore.upsertWebsiteUsage(summary)
                    guard self.sessionGeneration == trackingGeneration, self.user?.id == accountID else { return }
                    self.localWebsiteUsageSummaries = snapshot.websiteUsageSummaries
                    if let latestDate, summary.localDate > latestDate {
                        self.usageUploadTask?.cancel()
                        self.usageUploadTask = nil
                        _ = await self.uploadUsage()
                    } else {
                        self.scheduleUsageUpload()
                    }
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
        if usageWakeObserver == nil {
            usageWakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
                forName: NSWorkspace.didWakeNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    await Task.yield()
                    _ = await self.uploadUsage()
                }
            }
        }
        usageTracker?.setIdleThreshold(TimeInterval(settingsStore.usagePreferences.idleThresholdSeconds))
        usageTracker?.setExcludedBundleIDs(settingsStore.usagePreferences.excludedBundleIds)
        usageTracker?.setEnabled(settingsStore.usagePreferences.enabled)
        usageTracker?.setPaused(settingsStore.usagePreferences.paused)
        websiteUsageTracker?.setEnabled(settingsStore.usagePreferences.enabled && settingsStore.usagePreferences.websiteTrackingEnabled)
        websiteUsageTracker?.setPaused(settingsStore.usagePreferences.paused)

        startDurabilityCheckpointTimer()

        Task { @MainActor [weak self] in
            guard let self else { return }
            let before = self.localUsageSummaries
            if let snapshot = try? await self.offlineStore.cleanupLegacyUsage() {
                if before != snapshot.usageSummaries {
                    self.apply(snapshot)
                    self.usageStatistics = nil
                    self.usageServerStatistics = nil
                    self.usageIsLocalOnly = true
                }
            }
            if let snapshot = try? await self.offlineStore.pruneUsage(keeping: self.settingsStore.usagePreferences.retentionDays) {
                self.apply(snapshot)
            }
            if let store = self.usageSessionStore {
                _ = try? await store.pruneSessions(keeping: self.settingsStore.usagePreferences.retentionDays)
            }
        }
    }

    func applyUsagePreferences(_ preferences: UsagePreferences, sync: Bool = true) {
        let websiteWasRunning = websiteUsageTracker?.isRunning == true
        usageTracker?.setIdleThreshold(TimeInterval(preferences.idleThresholdSeconds))
        usageTracker?.setExcludedBundleIDs(preferences.excludedBundleIds)
        usageTracker?.setEnabled(preferences.enabled)
        usageTracker?.setPaused(preferences.paused)
        websiteUsageTracker?.setEnabled(preferences.enabled && preferences.websiteTrackingEnabled)
        websiteUsageTracker?.setPaused(preferences.paused)

        if preferences.enabled {
            scheduleUsageUpload()
        } else {
            usageUploadTask?.cancel()
            usageUploadTask = nil
            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.flushUsageForLifecycle()
                guard sync, self.user != nil else { return }
                do {
                    try await self.apiClient.updateUsagePreferences(preferences)
                } catch {
                    self.usageError = error.localizedDescription
                }
            }
        }

        Task { @MainActor [weak self] in
            guard let self else { return }
            if let snapshot = try? await self.offlineStore.pruneUsage(keeping: preferences.retentionDays) {
                self.apply(snapshot)
            }
            if let store = self.usageSessionStore {
                _ = try? await store.pruneSessions(keeping: preferences.retentionDays)
            }
        }

        if preferences.enabled {
            Task {
                if websiteWasRunning && !preferences.websiteTrackingEnabled {
                    await Task.yield()
                    _ = await uploadUsage()
                }
                guard sync, user != nil else { return }
                do {
                    try await apiClient.updateUsagePreferences(preferences)
                } catch {
                    usageError = error.localizedDescription
                }
            }
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
            try? await Task.sleep(for: .seconds(120))
            guard let self, !Task.isCancelled else { return }
            self.usageUploadTask = nil
            _ = await self.uploadUsage()
        }
    }

    @discardableResult
    func uploadUsage() async -> Bool {
        guard user != nil else { return false }
        if let usageUploadInFlight { return await usageUploadInFlight.value }
        usageUploadGeneration &+= 1
        let generation = usageUploadGeneration
        let task = Task { @MainActor [weak self] in
            guard let self else { return false }
            return await self.performUsageUpload()
        }
        usageUploadInFlight = task
        let result = await task.value
        if usageUploadGeneration == generation { usageUploadInFlight = nil }
        return result
    }

    private func performUsageUpload() async -> Bool {
        guard let accountID = user?.id else { return false }
        let runGeneration = sessionGeneration
        let store = offlineStore
        let deviceID = syncCoordinator.syncDeviceId
        var failed = false
        guard !Task.isCancelled, runGeneration == sessionGeneration else { return false }
        let pending = await store.usageSummariesToUpload()
        if !pending.isEmpty {
            do {
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                try await apiClient.uploadUsageSummaries(pending, deviceId: deviceID)
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                let snapshot = try await store.markUsageUploaded(pending)
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                apply(snapshot)
            } catch {
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                usageError = error.localizedDescription
                failed = true
            }
        }
        let pendingWebsites = await store.websiteUsageSummariesToUpload()
        if !pendingWebsites.isEmpty {
            do {
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                try await apiClient.uploadWebsiteUsageSummaries(pendingWebsites, deviceId: deviceID)
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                let snapshot = try await store.markWebsiteUsageUploaded(pendingWebsites)
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                apply(snapshot)
                websiteUsageError = nil
            } catch {
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                websiteUsageError = error.localizedDescription
                failed = true
            }
        }
        if !(await uploadUsageAppIcons(store: store, accountID: accountID, runGeneration: runGeneration)) { failed = true }
        if failed, !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID { scheduleUsageUpload() }
        return !failed
    }

    private func uploadUsageAppIcons(store: OfflineStore, accountID: String, runGeneration: Int) async -> Bool {
        guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
        let summaries = await store.usageSummaries()
        let observed = Dictionary(summaries.map { ($0.bundleId, $0.displayName) }, uniquingKeysWith: { first, _ in first })
        guard !observed.isEmpty else { return true }
        guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
        guard let identities = try? await apiClient.fetchUsageAppIdentities() else { return false }
        guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
        let identityByBundleID = Dictionary(uniqueKeysWithValues: identities.map { ($0.bundleId, $0) })
        let cachedHashes = await store.usageAppIconUploadHashes()
        var succeeded = true

        for (bundleID, displayName) in observed {
            guard let imageData = UsageAppIconRenderer.pngData(forBundleID: bundleID) else { continue }
            let hash = UsageAppIconRenderer.sha256Hex(imageData)
            guard UsageAppIconUploadDecision.shouldUpload(
                localHash: hash,
                server: identityByBundleID[bundleID],
                cachedHash: cachedHashes[bundleID]
            ) else { continue }
            do {
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                _ = try await apiClient.uploadUsageAppIcon(bundleId: bundleID, displayName: displayName, fileData: imageData)
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                let snapshot = try await store.markUsageAppIconUploaded(bundleID: bundleID, hash: hash)
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                apply(snapshot)
            } catch {
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
                // Icon delivery is best effort; usage summaries remain durable and retry later.
                succeeded = false
            }
        }
        return succeeded
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
            let serverWeb = try await apiClient.fetchWebsiteUsageStatistics(from: from, to: to)
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
        usageUploadInFlight?.cancel()
        usageUploadInFlight = nil
        usageUploadGeneration &+= 1
        usageTracker?.stop()
        websiteUsageTracker?.stop()
        if let usageWakeObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(usageWakeObserver)
            self.usageWakeObserver = nil
        }
    }

    func flushUsageForLifecycle() async {
        usageTracker?.stop()
        websiteUsageTracker?.stop()
        await Task.yield()
        _ = await uploadUsage()
    }
}
