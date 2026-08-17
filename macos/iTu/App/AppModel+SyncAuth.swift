import Foundation
import os
import iTuNetworking

private let authLifecycleLogger = Logger(subsystem: "com.itu.macos", category: "auth")

@MainActor
extension AppModel {
    func bootstrap() async {
        authLifecycleLogger.debug("auth.bootstrap.started")
        await loadLocalState()
        guard user != nil else {
            authLifecycleLogger.debug("auth.cached_user.missing")
            do {
                guard try await apiClient.hasRefreshToken() else {
                    authLifecycleLogger.debug("auth.refresh_token.missing")
                    authenticationState = .unauthenticated
                    return
                }
                authLifecycleLogger.debug("auth.refresh_token.present")
            } catch {
                authLifecycleLogger.error("auth.keychain.read.failure")
                errorMessage = error.localizedDescription
                authenticationState = .unauthenticated
                return
            }
            authenticationState = .restoring
            installCredentialRestorationRetry()
            await restoreCredential()
            return
        }
        authLifecycleLogger.debug("auth.cached_user.present")
        authenticationState = .authenticated

        let runGeneration = sessionGeneration
        Task { [weak self] in
            guard let self else { return }
            await continueAuthenticatedLifecycle(runGeneration: runGeneration)
        }
    }

    func retryCredentialRestorationIfNeeded() async {
        guard authenticationState == .restoring, user == nil else { return }
        await restoreCredential()
    }

    private func installCredentialRestorationRetry() {
        ConnectivityMonitor.shared.onReconnected = { [weak self] in
            Task { @MainActor [weak self] in
                await self?.retryCredentialRestorationIfNeeded()
            }
        }
    }

    private func restoreCredential() async {
        let runGeneration = sessionGeneration
        do {
            let session = try await apiClient.restoreSession()
            guard !Task.isCancelled, runGeneration == sessionGeneration else { return }
            try await switchAccountIfNeeded(to: session.user)
            guard !Task.isCancelled, user?.id == session.user.id else { return }
            authenticationState = .authenticated
            await continueAuthenticatedLifecycle(runGeneration: runGeneration)
        } catch let error as APIError where error.isTerminalAuthFailure {
            guard runGeneration == sessionGeneration else { return }
            await terminateSession(reason: "terminal auth failure")
        } catch {
            authLifecycleLogger.debug("auth.session.restoration_pending")
            errorMessage = error.localizedDescription
            if user == nil {
                guard runGeneration == sessionGeneration else { return }
                await terminateSession(reason: "restoration failure without cached profile")
            } else {
                authenticationState = .restoring
                installCredentialRestorationRetry()
            }
        }
    }

    private func continueAuthenticatedLifecycle(runGeneration: Int) async {
        guard !Task.isCancelled, runGeneration == sessionGeneration, user != nil else { return }
        startSyncLoop()
        startUsageTracking()
        await synchronize()
        guard !Task.isCancelled, runGeneration == sessionGeneration else { return }
        await loadServerState()
    }

    func authenticate(identifier: String, password: String, displayName: String?, isRegistration: Bool) async {
        isAuthenticating = true
        defer { isAuthenticating = false }
        let runGeneration = sessionGeneration
        do {
            let session = if isRegistration {
                try await apiClient.register(
                    identifier: identifier,
                    password: password,
                    displayName: displayName ?? ""
                )
            } else {
                try await apiClient.login(identifier: identifier, password: password)
            }
            guard !Task.isCancelled, runGeneration == sessionGeneration else { return }
            try await switchAccountIfNeeded(to: session.user)
            guard !Task.isCancelled, user?.id == session.user.id else { return }
            authenticationState = .authenticated
            startSyncLoop()
            startUsageTracking()
            await synchronize(showErrors: true)
            await loadServerState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logout() async {
        invalidateSession()
        syncCoordinator.stop()
        await flushUsageForLifecycle()
        stopUsageTracking()
        do {
            try await apiClient.logout()
        } catch {
            errorMessage = error.localizedDescription
        }
        await terminateSession(reason: "explicit logout")
    }

    func updateProfile(displayName: String, username: String?) async -> Bool {
        let runGeneration = sessionGeneration
        let accountID = user?.id
        do {
            let session = try await apiClient.updateProfile(
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : displayName,
                username: username?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true ? nil : username
            )
            guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == accountID else { return false }
            try await switchAccountIfNeeded(to: session.user)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func changePassword(currentPassword: String, newPassword: String) async -> Bool {
        do {
            try await apiClient.changePassword(currentPassword: currentPassword, newPassword: newPassword)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func exportAccountData() async throws -> JSONValue {
        try await apiClient.exportAccountData()
    }

    func deleteAccount(password: String?) async -> Bool {
        let accountID = user?.id
        invalidateSession()
        let runGeneration = sessionGeneration
        do {
            syncCoordinator.stop()
            await flushUsageForLifecycle()
            guard runGeneration == sessionGeneration, user?.id == accountID else { return false }
            stopUsageTracking()
            try await apiClient.deleteAccount(password: password)
            guard runGeneration == sessionGeneration, user?.id == accountID else { return false }
            await terminateSession(reason: "account deleted")
            tasks = []
            cachedTaskSections.removeAll()
            cachedHomeTodayTasks = nil
            cachedPlanningRenderProjections.removeAll()
            cachedMatrixRenderProjections.removeAll()
            archivedSkillIDs.removeAll()
            cachedTaskProjectionDay = nil
            cachedMatrixProjectionMinute = nil
            habits = []
            habitOccurrences = []
            habitOccurrencesByHabitAndDay.removeAll()
            habitCalendarByHabitAndDay.removeAll()
            decks = []
            conflicts = []
            syncPhase = .offline
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func discardConflict(_ conflict: SyncConflict) async {
        do {
            apply(try await offlineStore.discardConflict(conflict.mutationId))
            await synchronize(showErrors: true)
        } catch {
            errorMessage = "Could not discard the conflict: \(error.localizedDescription)"
        }
    }

    func keepConflict(_ conflict: SyncConflict) async {
        do {
            apply(try await offlineStore.keepConflict(conflict))
            syncPhase = .pending
            await synchronize(showErrors: true)
        } catch {
            errorMessage = "Could not reapply the local change: \(error.localizedDescription)"
        }
    }

    func retryPendingMutation(_ mutation: SyncMutation, keepLocal: Bool = false) async {
        do {
            apply(try await offlineStore.retryMutation(mutation.id, keepLocal: keepLocal))
            syncPhase = .pending
            await synchronize(showErrors: true)
        } catch {
            errorMessage = "Could not retry the pending change: \(error.localizedDescription)"
        }
    }

    func discardPendingMutation(_ mutation: SyncMutation) async {
        do {
            apply(try await offlineStore.discardMutation(mutation.id))
            await synchronize(showErrors: true)
        } catch {
            errorMessage = "Could not discard the pending change: \(error.localizedDescription)"
        }
    }

    func discardFailedMutations() async {
        do {
            apply(try await offlineStore.discardFailedMutations())
            await synchronize(showErrors: true)
        } catch {
            errorMessage = "Could not discard failed changes: \(error.localizedDescription)"
        }
    }

    func synchronize(showErrors: Bool = false) async {
        guard let userID = user?.id else { return }
        let runGeneration = sessionGeneration
        let store = offlineStore
        let wasOffline = syncPhase == .offline
        let previousPendingCount = pendingCount
        syncPhase = .syncing
        do {
            let result = try await syncCoordinator.synchronize()
            guard runGeneration == sessionGeneration, user?.id == userID, offlineStore === store else { return }
            let handledReceiptIDs = Set(result.snapshot.handledGrowthMutationIds)
            let handledReceiptKeys = Set(result.snapshot.handledGrowthReceiptKeys)
            let authoritativeReceipts = result.outcomes.compactMap { outcome -> PresentedGrowthReceipt? in
                guard !handledReceiptIDs.contains(outcome.mutationId),
                      let receipt = outcome.growthReceipt,
                      receipt.receiptKey.map({ !handledReceiptKeys.contains($0) }) ?? true else { return nil }
                return PresentedGrowthReceipt(id: outcome.mutationId, receipt: receipt)
            }
            let snapshot = try await store.reconcileGrowthOutcomes(
                result.outcomes,
                conflicts: result.conflicts
            )
            guard runGeneration == sessionGeneration, user?.id == userID, offlineStore === store else { return }
            let reconciledReceiptIDs = Set(result.outcomes.map(\.mutationId)).union(result.conflicts.map(\.mutationId))
            growthReceiptQueue.removeAll { reconciledReceiptIDs.contains($0.id) }
            apply(snapshot)
            await uploadPendingGymImages()
            await uploadPendingJournalAttachments()
            guard runGeneration == sessionGeneration, user?.id == userID, offlineStore === store else { return }
            for presented in authoritativeReceipts {
                enqueueGrowthReceipt(presented.receipt, mutationId: presented.id)
            }
            let hasGrowthChanges = result.changes.contains { change in
                let type = change.entityType.lowercased()
                if type.hasPrefix("growth") { return true }
                if type == "task" || type == "habitoccurrence" || type == "habit" {
                    if let data = change.data, case let .object(fields) = data {
                        if fields["status"] != nil || fields["completedAt"] != nil || fields["commitmentState"] != nil {
                            return true
                        }
                    }
                }
                return false
            }
            if hasGrowthChanges {
                if let overview = try? await apiClient.fetchGrowthOverview() {
                    guard runGeneration == sessionGeneration, user?.id == userID, offlineStore === store else { return }
                    apply(try await store.updateGrowthOverview(overview))
                }
            }
            await loadFocus()
            guard runGeneration == sessionGeneration, user?.id == userID, offlineStore === store else { return }
            syncPhase = snapshot.conflicts.isEmpty
                ? (snapshot.mutations.isEmpty ? .upToDate : .pending)
                : .conflict

            if wasOffline && syncPhase != .offline {
                _ = await uploadUsage()
                guard runGeneration == sessionGeneration, user?.id == userID, offlineStore === store else { return }
                let syncedCount = max(0, previousPendingCount - snapshot.mutations.count)
                let message = syncedCount > 0 ? "\(syncedCount) change\(syncedCount == 1 ? "" : "s") synced" : nil
                enqueueNotice(AppNotice(level: .success, presentation: .toast, title: "Back online", message: message))
            }
        } catch let error as APIError where error.isTerminalAuthFailure {
            guard runGeneration == sessionGeneration, user?.id == userID, offlineStore === store else { return }
            await handleTerminalAuthenticationFailure()
        } catch {
            guard runGeneration == sessionGeneration, user?.id == userID, offlineStore === store else { return }
            apply(await store.snapshot())
            if let apiError = error as? APIError, apiError.statusCode > 0 {
                syncPhase = currentSnapshot.conflicts.isEmpty
                    ? (currentSnapshot.mutations.isEmpty ? .upToDate : .pending)
                    : .conflict
            } else {
                syncPhase = .offline
            }
            if showErrors {
                enqueueNotice(AppNotice(level: .warning, presentation: .toast, title: "Sync status", message: error.localizedDescription))
            }
        }
    }

    private func handleTerminalAuthenticationFailure() async {
        await terminateSession(reason: "terminal auth failure")
    }

    func terminateSession(reason: String) async {
        authLifecycleLogger.debug("auth.session.terminated reason=\(reason, privacy: .public)")
        invalidateSession()
        stopUsageTracking()
        syncCoordinator.stop()
        await apiClient.clearAccessToken()
        do {
            try SessionCache.clearSession()
        } catch {
            errorMessage = error.localizedDescription
        }
        user = nil
        focusTimer.apply(active: nil)
        authenticationState = .unauthenticated
        syncPhase = .offline
        updateFocusPolicy()
    }

    func loadServerState() async {
        guard let userID = user?.id, hydrationTask == nil else { return }
        if let lastHydratedAt, Date().timeIntervalSince(lastHydratedAt) < 30 {
            return
        }
        let runGeneration = sessionGeneration
        let store = offlineStore
        hydrationTask = Task { [weak self] in
            guard let self else { return }
            defer {
                if sessionGeneration == runGeneration { hydrationTask = nil }
            }
            do {
                let result = try await AccountHydrator(
                    apiClient: apiClient,
                    offlineStore: store,
                    isCurrent: { @MainActor [weak self] in
                        guard let self else { return false }
                        return !Task.isCancelled &&
                            self.sessionGeneration == runGeneration &&
                            self.user?.id == userID &&
                            self.offlineStore === store
                    }
                ).hydrate()
                guard !Task.isCancelled,
                      runGeneration == sessionGeneration,
                      user?.id == userID,
                      offlineStore === store else { return }
                apply(result.snapshot)
                configureTaskPagination(result.taskPage)
                if let serverUsagePreferences = result.usagePreferences {
                    settingsStore.mergeUsagePreferencesFromServer(serverUsagePreferences)
                    applyUsagePreferences(settingsStore.usagePreferences, sync: false)
                }
                await uploadPendingJournalAttachments()
                guard !Task.isCancelled,
                      runGeneration == sessionGeneration,
                      user?.id == userID,
                      offlineStore === store else { return }
                if let value = result.habitTimeBlocks { habitTimeBlocks = value }
                if let value = result.studySessionHistory { studySessionHistory = value }
                if let value = result.notifications { notifications = value }
                if result.failedResources.isEmpty {
                    lastHydratedAt = Date()
                } else {
                    lastHydratedAt = nil
                    let count = result.failedResources.count
                    authLifecycleLogger.error(
                        "auth.hydration.partial_failure count=\(count, privacy: .public) resources=\(result.failedResources.joined(separator: ","), privacy: .public)"
                    )
                    enqueueNotice(AppNotice(
                        level: .warning,
                        presentation: .toast,
                        title: "Some data could not be refreshed",
                        message: "Showing cached data for \(count) resource\(count == 1 ? "" : "s"); iTu will retry when it becomes active."
                    ))
                }
            } catch {
                // Background hydration is deliberately silent; local state remains visible.
            }
        }
        await hydrationTask?.value
    }


}
