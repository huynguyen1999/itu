import Foundation

@MainActor
extension AppModel {
    func prepareFocus(for task: ProductivityTask) async {
        if focusTimer.activeSession == nil {
            focusTimer.linkedTask = task
            focusTimer.timerMode = .focus
        } else {
            await performFocusAction("attach", taskId: task.id)
        }
        selectedSection = .focus
    }

    func loadFocus() async {
        guard user != nil else { return }
        AudioPlayerManager.shared.configureBuiltInDefaults()
        focusTimer.isLoading = true
        defer { focusTimer.isLoading = false }
        do {
            async let active = apiClient.activeFocus()
            async let history = apiClient.focusHistory()
            async let summary = apiClient.focusSummary()
            async let soundCatalog = apiClient.fetchFocusSounds()
            let loadedActive = try await active
            let loadedHistory = try await history
            focusTimer.history = loadedHistory
            focusTimer.summary = try await summary
            if let loadedSoundCatalog = try? await soundCatalog {
                AudioPlayerManager.shared.configure(catalog: loadedSoundCatalog)
            }
            // Hydrate the timer only after the store has merged server data with
            // any local focus state. Applying `activeFocus` first lets a stale
            // endpoint response briefly roll back an optimistic action.
            apply(try await offlineStore.hydrateFocus(active: loadedActive, history: loadedHistory))
            updateFocusPolicy()
            focusTimer.errorMessage = nil
        } catch {
            focusTimer.errorMessage = error.localizedDescription
        }
    }

    func selectFocusSound(_ sound: FocusSound) {
        AudioPlayerManager.shared.selectSound(sound)
        Task {
            _ = try? await apiClient.updateFocusSoundPreference(
                soundKey: sound.id,
                enabled: true,
                volume: Double(AudioPlayerManager.shared.volume * 100).rounded()
            )
        }
    }

    func toggleFocusSoundPlayback() async {
        let player = AudioPlayerManager.shared
        guard player.isEnabled, let sound = player.selectedSound else { return }
        if player.hasLoadedSelectedSound {
            player.toggleLoadedPlayback()
            return
        }
        player.isLoading = true
        player.errorMessage = nil
        defer { player.isLoading = false }
        do {
            let data = try await apiClient.downloadFocusSound(path: sound.url)
            try player.play(data: data, sound: sound)
        } catch {
            player.stop()
            player.errorMessage = "Could not play \(sound.name): \(error.localizedDescription)"
        }
    }

    func saveFocusSoundVolume() async {
        let player = AudioPlayerManager.shared
        guard let sound = player.selectedSound else { return }
        do {
            _ = try await apiClient.updateFocusSoundPreference(
                soundKey: sound.id,
                volume: Double(player.volume * 100).rounded()
            )
        } catch {
            player.errorMessage = "Could not save the sound volume: \(error.localizedDescription)"
        }
    }

    func reloadFocusSounds() async throws {
        let catalog = try await apiClient.fetchFocusSounds()
        AudioPlayerManager.shared.configure(catalog: catalog)
    }

    func uploadFocusSound(name: String, fileData: Data, fileName: String, mimeType: String) async throws {
        let player = AudioPlayerManager.shared
        player.isLoading = true
        player.errorMessage = nil
        defer { player.isLoading = false }
        do {
            let sound = try await apiClient.uploadFocusSound(name: name, fileData: fileData, fileName: fileName, mimeType: mimeType)
            try await reloadFocusSounds()
            selectFocusSound(sound)
        } catch {
            player.errorMessage = "Could not upload audio file: \(error.localizedDescription)"
            throw error
        }
    }

    func updateFocusSound(id: String, name: String) async throws {
        let player = AudioPlayerManager.shared
        player.errorMessage = nil
        do {
            _ = try await apiClient.updateFocusSound(id: id, name: name)
            try await reloadFocusSounds()
        } catch {
            player.errorMessage = "Could not update sound name: \(error.localizedDescription)"
            throw error
        }
    }

    func deleteFocusSound(id: String) async throws {
        let player = AudioPlayerManager.shared
        player.errorMessage = nil
        do {
            if player.selectedSound?.id == id {
                player.stop()
            }
            try await apiClient.deleteFocusSound(id: id)
            try await reloadFocusSounds()
        } catch {
            player.errorMessage = "Could not delete sound: \(error.localizedDescription)"
            throw error
        }
    }


    func updateFocusTitle(_ title: String) async {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        focusTimer.customTitle = trimmed
        guard var session = focusTimer.activeSession else { return }
        session.customTitle = trimmed.isEmpty ? nil : trimmed
        let occurredAt = ISO8601DateFormatter().string(from: Date())
        let idempotencyKey = ULID.generate()
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "focussession.action",
            entityId: session.id,
            baseVersion: session.version,
            payload: [
                "action": .string("rename"),
                "occurredAt": .string(occurredAt),
                "idempotencyKey": .string(idempotencyKey),
                "expectedVersion": .number(Double(session.version)),
                "customTitle": trimmed.isEmpty ? .null : .string(trimmed)
            ],
            occurredAt: occurredAt
        )
        session.version += 1
        focusTimer.apply(active: session)
        await saveFocusSession(session, mutation: mutation)
    }

    func startFocus() async {
        guard focusTimer.activeSession == nil, !focusTimer.isMutating else { return }
        let entityId = ULID.generate()
        let idempotencyKey = ULID.generate()
        let occurredAt = ISO8601DateFormatter().string(from: Date())
        let plannedSeconds = focusTimer.selectedDurationSeconds
        var session = FocusSession.optimistic(
            id: entityId,
            task: focusTimer.linkedTask,
            phase: focusTimer.timerMode.phase,
            plannedSeconds: plannedSeconds,
            startedAt: occurredAt
        )
        if !focusTimer.customTitle.isEmpty {
            session.customTitle = focusTimer.customTitle
        }
        let selectedTags = tags.filter { focusTimer.selectedTagIds.contains($0.id) }
        if !selectedTags.isEmpty {
            session = FocusSession(
                id: session.id,
                taskId: session.taskId,
                mode: session.mode,
                phase: session.phase,
                status: session.status,
                plannedSeconds: session.plannedSeconds,
                accumulatedPauseSecs: session.accumulatedPauseSecs,
                cycle: session.cycle,
                taskTitleSnapshot: session.taskTitleSnapshot,
                customTitle: session.customTitle,
                taskListTitleSnapshot: session.taskListTitleSnapshot,
                projectTitleSnapshot: session.projectTitleSnapshot,
                tagNamesSnapshot: selectedTags.map(\.name),
                startedAt: session.startedAt,
                pausedAt: session.pausedAt,
                completedAt: session.completedAt,
                adjustedStartedAt: session.adjustedStartedAt,
                adjustedCompletedAt: session.adjustedCompletedAt,
                reflection: session.reflection,
                ownerDeviceId: session.ownerDeviceId,
                version: session.version,
                preset: session.preset
            )
        }
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "focussession.create",
            entityId: entityId,
            payload: [
                "taskId": focusTimer.linkedTask.map { .string($0.id) } ?? .null,
                "customTitle": focusTimer.customTitle.isEmpty ? .null : .string(focusTimer.customTitle),
                "mode": .string(FocusMode.countdown.rawValue),
                "plannedSeconds": .number(Double(plannedSeconds)),
                "ownerDeviceId": .string("macos"),
                "idempotencyKey": .string(idempotencyKey),
                "startedAt": .string(occurredAt)
            ],
            occurredAt: occurredAt
        )
        focusTimer.apply(active: session)
        updateFocusPolicy()
        await saveFocusSession(session, mutation: mutation)
    }

    func performFocusAction(_ action: String, extendSeconds: Int? = nil, taskId: String? = nil) async {
        guard !focusTimer.isMutating, var session = focusTimer.activeSession else { return }
        let occurredAt = ISO8601DateFormatter().string(from: Date())
        let idempotencyKey = ULID.generate()
        var payload: [String: JSONValue] = [
            "action": .string(action),
            "occurredAt": .string(occurredAt),
            "idempotencyKey": .string(idempotencyKey),
            "expectedVersion": .number(Double(session.version))
        ]
        if let extendSeconds {
            payload["extendSeconds"] = .number(Double(extendSeconds))
        }
        if action == "attach" {
            payload["taskId"] = taskId.map(JSONValue.string) ?? .null
        }
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "focussession.action",
            entityId: session.id,
            baseVersion: session.version,
            payload: payload,
            occurredAt: occurredAt
        )
        switch action {
        case "pause":
            session.status = .paused
            session.pausedAt = occurredAt
        case "resume":
            if let pausedAt = session.pausedAt,
               let pausedDate = ISO8601DateFormatter().date(from: pausedAt),
               let resumedDate = ISO8601DateFormatter().date(from: occurredAt) {
                session.accumulatedPauseSecs += max(0, Int(resumedDate.timeIntervalSince(pausedDate)))
            }
            session.status = .active
            session.pausedAt = nil
        case "extend":
            session.plannedSeconds = (session.plannedSeconds ?? 0) + (extendSeconds ?? 300)
        case "attach":
            session.taskId = taskId
            session.taskTitleSnapshot = tasks.first(where: { $0.id == taskId })?.title
            focusTimer.linkedTask = tasks.first(where: { $0.id == taskId })
        case "complete", "abandon":
            session.status = action == "complete" ? .completed : .abandoned
            session.completedAt = occurredAt
        default:
            return
        }
        session.version += 1
        focusTimer.apply(active: ["complete", "abandon"].contains(action) ? nil : session)
        updateFocusPolicy()
        await saveFocusSession(session, mutation: mutation)
    }

    func adjustFocusRecord(
        _ record: FocusSession,
        startedAt: Date,
        completedAt: Date,
        taskId: String?
    ) async {
        guard completedAt > startedAt else { return }
        var updated = record
        let formatter = ISO8601DateFormatter()
        let startedAtValue = formatter.string(from: startedAt)
        let completedAtValue = formatter.string(from: completedAt)
        updated.startedAt = startedAtValue
        updated.completedAt = completedAtValue
        updated.taskId = taskId
        updated.taskTitleSnapshot = tasks.first(where: { $0.id == taskId })?.title
        updated.version += 1
        let occurredAt = formatter.string(from: Date())
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "focussession.adjust",
            entityId: record.id,
            baseVersion: record.version,
            payload: [
                "startedAt": .string(startedAtValue),
                "completedAt": .string(completedAtValue),
                "taskId": taskId.map(JSONValue.string) ?? .null,
                "idempotencyKey": .string(ULID.generate()),
                "expectedVersion": .number(Double(record.version))
            ],
            occurredAt: occurredAt
        )
        await saveFocusSession(updated, mutation: mutation)
    }

    private func saveFocusSession(_ session: FocusSession, mutation: SyncMutation) async {
        focusTimer.isMutating = true
        defer { focusTimer.isMutating = false }
        do {
            apply(try await offlineStore.saveFocusSession(session, mutation: mutation))
            syncPhase = .pending
            await synchronize(showErrors: true)
        } catch {
            focusTimer.errorMessage = error.localizedDescription
        }
    }


}
