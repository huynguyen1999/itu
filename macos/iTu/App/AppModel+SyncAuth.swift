import Foundation

@MainActor
extension AppModel {
    func bootstrap() async {
        await loadLocalState()
        isBootstrapping = false
        guard user != nil else {
            return
        }

        Task {
            do {
                let session = try await apiClient.restoreSession()
                try await switchAccountIfNeeded(to: session.user)
                startSyncLoop()
                await synchronize()
                await loadServerState()
            } catch let error as APIError where error.statusCode == 401 {
                syncCoordinator.stop()
                SessionCache.clearUser()
                user = nil
                focusTimer.apply(active: nil)
                updateFocusPolicy()
                syncPhase = .offline
            } catch {
                startSyncLoop()
                syncPhase = .offline
            }
        }
    }

    func authenticate(identifier: String, password: String, displayName: String?, isRegistration: Bool) async {
        isAuthenticating = true
        defer { isAuthenticating = false }
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
            try await switchAccountIfNeeded(to: session.user)
            startSyncLoop()
            await synchronize(showErrors: true)
            await loadServerState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logout() async {
        invalidateSession()
        syncCoordinator.stop()
        await apiClient.logout()
        SessionCache.clearUser()
        user = nil
        focusTimer.apply(active: nil)
        syncPhase = .offline
        updateFocusPolicy()
    }

    func updateProfile(displayName: String, username: String?) async -> Bool {
        do {
            let session = try await apiClient.updateProfile(
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : displayName,
                username: username?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true ? nil : username
            )
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
        do {
            invalidateSession()
            syncCoordinator.stop()
            try await apiClient.deleteAccount(password: password)
            user = nil
            focusTimer.apply(active: nil)
            updateFocusPolicy()
            tasks = []
            habits = []
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
        syncPhase = .syncing
        do {
            let result = try await syncCoordinator.synchronize()
            guard runGeneration == sessionGeneration, user?.id == userID else { return }
            let handledReceiptIDs = Set(result.snapshot.handledGrowthMutationIds)
            let handledReceiptKeys = Set(result.snapshot.handledGrowthReceiptKeys)
            let authoritativeReceipts = result.outcomes.compactMap { outcome -> PresentedGrowthReceipt? in
                guard !handledReceiptIDs.contains(outcome.mutationId),
                      let receipt = outcome.growthReceipt,
                      receipt.receiptKey.map({ !handledReceiptKeys.contains($0) }) ?? true else { return nil }
                return PresentedGrowthReceipt(id: outcome.mutationId, receipt: receipt)
            }
            let snapshot = try await offlineStore.reconcileGrowthOutcomes(
                result.outcomes,
                conflicts: result.conflicts
            )
            guard runGeneration == sessionGeneration, user?.id == userID else { return }
            let reconciledReceiptIDs = Set(result.outcomes.map(\.mutationId)).union(result.conflicts.map(\.mutationId))
            growthReceiptQueue.removeAll { reconciledReceiptIDs.contains($0.id) }
            apply(snapshot)
            for presented in authoritativeReceipts {
                enqueueGrowthReceipt(presented.receipt, mutationId: presented.id)
            }
            await loadFocus()
            syncPhase = snapshot.conflicts.isEmpty
                ? (snapshot.mutations.isEmpty ? .upToDate : .pending)
                : .conflict
        } catch let error as APIError where error.statusCode == 401 {
            syncCoordinator.stop()
            SessionCache.clearUser()
            user = nil
            focusTimer.apply(active: nil)
            syncPhase = .offline
            updateFocusPolicy()
        } catch {
            apply(await offlineStore.snapshot())
            if let apiError = error as? APIError, apiError.statusCode > 0 {
                syncPhase = currentSnapshot.conflicts.isEmpty
                    ? (currentSnapshot.mutations.isEmpty ? .upToDate : .pending)
                    : .conflict
            } else {
                syncPhase = .offline
            }
            if showErrors {
                errorMessage = error.localizedDescription
            }
        }
    }

    func loadServerState() async {
        guard let userID = user?.id, hydrationTask == nil else { return }
        let runGeneration = sessionGeneration
        let store = offlineStore
        hydrationTask = Task { [weak self] in
            guard let self else { return }
            defer {
                if sessionGeneration == runGeneration { hydrationTask = nil }
            }
            do {
                let result = try await AccountHydrator(apiClient: apiClient, offlineStore: store).hydrate()
                guard !Task.isCancelled, runGeneration == sessionGeneration, user?.id == userID else { return }
                apply(result.snapshot)
                if case let .success(value) = result.habitTimeBlocks { habitTimeBlocks = value }
                if case let .success(value) = result.studySessionHistory { studySessionHistory = value }
                if case let .success(value) = result.notifications { notifications = value }
            } catch {
                // Background hydration is deliberately silent; local state remains visible.
            }
        }
        await hydrationTask?.value
    }


}
