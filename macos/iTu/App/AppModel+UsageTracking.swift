import Foundation
import iTuDomain

extension AppModel {
    func setupUsageTracking() {
        let accountID = user?.id ?? "anonymous"
        let trackingGeneration = sessionGeneration
        let trackingStore = offlineStore

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
                    self.applyUsageSnapshot(snapshot)
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

        let coordinator = BiomeImportCoordinator(
            apiClientProvider: { [weak self] in self?.apiClient },
            macSyncDeviceIdProvider: { [weak self] in
                await self?.syncCoordinator.syncDeviceId ?? UserDefaults.standard.string(forKey: "syncDeviceId")
            }
        )
        self.biomeCoordinator = coordinator

        settingsStore.onUsagePreferencesChanged = { [weak self] preferences in
            self?.applyUsagePreferences(preferences)
        }
    }

    func startUsageTracking() {
        guard user != nil else { return }
        websiteUsageTracker?.setEnabled(settingsStore.usagePreferences.enabled && settingsStore.usagePreferences.websiteTrackingEnabled)
        websiteUsageTracker?.setPaused(settingsStore.usagePreferences.paused)

        startDurabilityCheckpointTimer()
        startScreenTimeSyncTimer()

        Task { @MainActor [weak self] in
            guard let self else { return }
            await self.refreshScreenTimeStatus()
            await self.runScreenTimeImport()
        }

        Task { @MainActor [weak self] in
            guard let self else { return }
            let before = self.localUsageSummaries
            if let snapshot = try? await self.offlineStore.cleanupLegacyUsage() {
                if before != snapshot.usageSummaries {
                    self.applyUsageSnapshot(snapshot)
                    self.usageStatistics = nil
                    self.usageServerStatistics = nil
                    self.usageIsLocalOnly = true
                }
            }
            if let snapshot = try? await self.offlineStore.pruneUsage(keeping: self.settingsStore.usagePreferences.retentionDays) {
                self.applyUsageSnapshot(snapshot)
            }
        }
    }

    func applyUsagePreferences(_ preferences: UsagePreferences, sync: Bool = true) {
        let websiteWasRunning = websiteUsageTracker?.isRunning == true
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
                self.applyUsageSnapshot(snapshot)
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
            guard let self else { return }
            Task { @MainActor in
                self.websiteUsageTracker?.tick()
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
                applyUsageSnapshot(snapshot)
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
                applyUsageSnapshot(snapshot)
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
        var observed = Dictionary(summaries.map { ($0.bundleId, $0.displayName) }, uniquingKeysWith: { first, _ in first })
        if let outboxItems = await biomeCoordinator?.allOutboxIntervals() {
            for item in outboxItems {
                if observed[item.bundleId] == nil && !BiomeUsageNormalizer.isSystemExcluded(bundleId: item.bundleId) {
                    observed[item.bundleId] = item.displayName
                }
            }
        }
        guard !observed.isEmpty else { return true }
        guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
        guard let identities = try? await apiClient.fetchUsageAppIdentities() else { return false }
        guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
        let identityByBundleID = Dictionary(uniqueKeysWithValues: identities.map { ($0.bundleId, $0) })
        let cachedHashes = await store.usageAppIconUploadHashes()
        var succeeded = true

        for (bundleID, displayName) in observed {
            guard !BiomeUsageNormalizer.isSystemExcluded(bundleId: bundleID) else { continue }
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
                applyUsageSnapshot(snapshot)
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
        if let biomeCoordinator {
            self.screenTimeStatus = await biomeCoordinator.runOnce()
        }
        await uploadUsage()
        let local = await offlineStore.usageSummaries(from: from, to: to)
            .filter { !BiomeUsageNormalizer.isSystemExcluded(bundleId: $0.bundleId) }
        let localWeb = await offlineStore.websiteUsageSummaries(from: from, to: to)
        do {
            let server = try await apiClient.fetchUsage(from: from, to: to)
            let pending = (await offlineStore.pendingUsageDeltas(from: from, to: to))
                .filter { !BiomeUsageNormalizer.isSystemExcluded(bundleId: $0.bundleId) }
            usageServerStatistics = server
            usageIsLocalOnly = false
            var combined = server.adding(pending)
            if let outboxItems = await biomeCoordinator?.pendingOutboxIntervals() {
                var pendingBiomeSummaries: [UsageSummary] = []
                for item in outboxItems {
                    guard !BiomeUsageNormalizer.isSystemExcluded(bundleId: item.bundleId) else { continue }
                    for summary in item.asUsageSummaries() {
                        guard !BiomeUsageNormalizer.isSystemExcluded(bundleId: summary.bundleId) else { continue }
                        if let from, summary.localDate < from { continue }
                        if let to, summary.localDate > to { continue }
                        pendingBiomeSummaries.append(summary)
                    }
                }
                if !pendingBiomeSummaries.isEmpty {
                    combined = combined.adding(pendingBiomeSummaries)
                }
            }
            usageStatistics = combined
            usageError = nil
        } catch {
            usageServerStatistics = nil
            usageIsLocalOnly = true
            var combined = local
            if let outboxItems = await biomeCoordinator?.allOutboxIntervals() {
                for item in outboxItems {
                    guard !BiomeUsageNormalizer.isSystemExcluded(bundleId: item.bundleId) else { continue }
                    for summary in item.asUsageSummaries() {
                        guard !BiomeUsageNormalizer.isSystemExcluded(bundleId: summary.bundleId) else { continue }
                        if let from, summary.localDate < from { continue }
                        if let to, summary.localDate > to { continue }
                        combined.append(summary)
                    }
                }
            }
            usageStatistics = .aggregating(combined)
            usageError = combined.isEmpty ? error.localizedDescription : nil
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

        // Fetch Screen Time Statistics with current device scope
        do {
            let tz = TimeZone.current.identifier
            let deviceScopeId = screenTimeDeviceScope.id
            let stStats = try await apiClient.fetchScreenTimeStatistics(
                from: from,
                to: to,
                deviceId: deviceScopeId == "all" ? nil : deviceScopeId,
                timezone: tz
            )
            self.screenTimeStatistics = stStats
            self.usageStatistics = stStats.asUsageStatistics
        } catch {
            #if DEBUG
            print("[AppModel] ScreenTime statistics fetch failed: \(error)")
            #endif
        }
    }

    func deleteUsage(from: String? = nil, to: String? = nil) async {
        do {
            try await apiClient.deleteUsage(from: from, to: to)
            try await apiClient.deleteWebsiteUsage(from: from, to: to)
            applyUsageSnapshot(try await offlineStore.deleteUsage(from: from, to: to))
            usageStatistics = nil
            websiteUsageStatistics = nil
            screenTimeStatistics = nil
        } catch {
            usageError = error.localizedDescription
        }
    }

    func startScreenTimeSyncTimer() {
        screenTimeSyncTimer?.invalidate()
        screenTimeSyncTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.runScreenTimeImport()
            }
        }
    }

    func refreshScreenTimeStatus() async {
        guard let coordinator = biomeCoordinator else { return }
        self.screenTimeStatus = await coordinator.checkStatus()
    }

    @discardableResult
    func runScreenTimeImport() async -> ScreenTimeImportStatus {
        guard let coordinator = biomeCoordinator else { return screenTimeStatus }
        let newStatus = await coordinator.runOnce()
        self.screenTimeStatus = newStatus
        let today = StatisticsPeriod.dateKey(Date())
        await refreshUsage(from: today, to: today)
        return newStatus
    }

    @discardableResult
    func rebuildAllScreenTimeBiomeHistory() async -> ScreenTimeImportStatus {
        guard let coordinator = biomeCoordinator else { return screenTimeStatus }
        let newStatus = await coordinator.rebuildAllBiomeHistory()
        self.screenTimeStatus = newStatus
        let today = StatisticsPeriod.dateKey(Date())
        await refreshUsage(from: today, to: today)
        return newStatus
    }

    @discardableResult
    func reimportScreenTimeLast7Days() async -> ScreenTimeImportStatus {
        guard let coordinator = biomeCoordinator else { return screenTimeStatus }
        let newStatus = await coordinator.reimportLast7Days()
        self.screenTimeStatus = newStatus
        let today = StatisticsPeriod.dateKey(Date())
        await refreshUsage(from: today, to: today)
        return newStatus
    }

    func stopUsageTracking() {
        usageCheckpointTimer?.invalidate()
        usageCheckpointTimer = nil
        screenTimeSyncTimer?.invalidate()
        screenTimeSyncTimer = nil
        usageUploadTask?.cancel()
        usageUploadTask = nil
        usageUploadInFlight?.cancel()
        usageUploadInFlight = nil
        usageUploadGeneration &+= 1
        websiteUsageTracker?.stop()
    }

    func flushUsageForLifecycle() async {
        websiteUsageTracker?.stop()
        await Task.yield()
        _ = await uploadUsage()
    }

    /// Usage maintenance returns the store's full snapshot, but must not
    /// replace task state that may have changed while the async operation ran.
    func applyUsageSnapshot(_ snapshot: OfflineSnapshot) {
        currentSnapshot.usageSummaries = snapshot.usageSummaries
        currentSnapshot.usageUploadWatermarks = snapshot.usageUploadWatermarks
        currentSnapshot.usageAppIconUploadHashes = snapshot.usageAppIconUploadHashes
        currentSnapshot.websiteUsageSummaries = snapshot.websiteUsageSummaries
        currentSnapshot.websiteUsageUploadWatermarks = snapshot.websiteUsageUploadWatermarks
        localUsageSummaries = snapshot.usageSummaries
        localWebsiteUsageSummaries = snapshot.websiteUsageSummaries
    }
}
