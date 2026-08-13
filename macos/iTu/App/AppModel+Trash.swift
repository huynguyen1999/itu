import Foundation

@MainActor
extension AppModel {
    var trashedJournalEntries: [JournalNoteModel] {
        var merged = Dictionary(uniqueKeysWithValues: (trashSnapshot?.journalEntries ?? []).map { ($0.id, $0) })
        for value in currentSnapshot.journalNotes {
            if value.deletedAt != nil { merged[value.id] = value } else { merged.removeValue(forKey: value.id) }
        }
        return merged.values.sorted { ($0.deletedAt ?? "") > ($1.deletedAt ?? "") }
    }

    var trashedBudgetTransactions: [BudgetTransactionModel] {
        var merged = Dictionary(uniqueKeysWithValues: (trashSnapshot?.budgetTransactions ?? []).map { ($0.id, $0) })
        for value in currentSnapshot.budgetTransactions {
            if value.deletedAt != nil { merged[value.id] = value } else { merged.removeValue(forKey: value.id) }
        }
        return merged.values.sorted { ($0.deletedAt ?? "") > ($1.deletedAt ?? "") }
    }

    var trashedGymWorkouts: [WorkoutModel] {
        var merged = Dictionary(uniqueKeysWithValues: (trashSnapshot?.gymWorkouts ?? []).map { ($0.id, $0) })
        for value in currentSnapshot.gymWorkouts {
            if value.deletedAt != nil { merged[value.id] = value } else { merged.removeValue(forKey: value.id) }
        }
        return merged.values.sorted { ($0.deletedAt ?? "") > ($1.deletedAt ?? "") }
    }

    var trashedGymExercises: [ExerciseModel] {
        var merged = Dictionary(uniqueKeysWithValues: (trashSnapshot?.gymExercises ?? []).map { ($0.id, $0) })
        for value in currentSnapshot.gymExercises {
            if value.deletedAt != nil { merged[value.id] = value } else { merged.removeValue(forKey: value.id) }
        }
        return merged.values.sorted { ($0.deletedAt ?? "") > ($1.deletedAt ?? "") }
    }

    func refreshTrash() async {
        trashIsLoading = true
        trashErrorMessage = nil
        defer { trashIsLoading = false }
        do {
            let fetched = try await apiClient.fetchTrash()
            trashSnapshot = fetched
            apply(try await offlineStore.cacheTrashItems(fetched))
        } catch {
            trashErrorMessage = "Could not load Trash: \(error.localizedDescription)"
        }
    }

    func restoreTrashDeck(_ deck: DeckModel) async {
        do {
            apply(try await offlineStore.restoreDeck(deck))
            trashSnapshot?.decks.removeAll { $0.id == deck.id }
            syncPhase = .pending
        } catch {
            trashErrorMessage = "Could not restore deck: \(error.localizedDescription)"
        }
    }

    func archiveDeck(_ deck: DeckModel) async {
        do {
            apply(try await offlineStore.deleteDeck(id: deck.id))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not archive the deck: \(error.localizedDescription)"
        }
    }

    func restoreTrashCard(_ card: CardModel) async {
        do {
            apply(try await offlineStore.restoreCard(card))
            trashSnapshot?.cards.removeAll { $0.id == card.id }
            syncPhase = .pending
        } catch {
            trashErrorMessage = "Could not restore card: \(error.localizedDescription)"
        }
    }

    func permanentlyDeleteTrashDeck(_ deck: DeckModel) async {
        do {
            try await apiClient.permanentlyDeleteTrashDeck(id: deck.id)
            trashSnapshot?.decks.removeAll { $0.id == deck.id }
        } catch {
            trashErrorMessage = "Could not permanently delete deck: \(error.localizedDescription)"
        }
    }

    func permanentlyDeleteTrashCard(_ card: CardModel) async {
        do {
            try await apiClient.permanentlyDeleteTrashCard(id: card.id)
            trashSnapshot?.cards.removeAll { $0.id == card.id }
        } catch {
            trashErrorMessage = "Could not permanently delete card: \(error.localizedDescription)"
        }
    }

    func restoreTrashTask(_ task: ProductivityTask) async {
        if tasks.contains(where: { $0.id == task.id }) {
            await restoreTask(task)
            trashSnapshot?.tasks.removeAll { $0.id == task.id }
            return
        }

        do {
            try await apiClient.restoreTrashTask(id: task.id)
            trashSnapshot?.tasks.removeAll { $0.id == task.id }
            await loadServerState()
        } catch {
            trashErrorMessage = "Could not restore task: \(error.localizedDescription)"
        }
    }

    func restoreTrashJournalEntry(_ entry: JournalNoteModel) async {
        let local = currentSnapshot.journalNotes.first(where: { $0.id == entry.id })
        var value = local ?? entry
        let baseVersion = local?.version ?? entry.version
        value.deletedAt = nil
        value.deletedByDeviceId = nil
        value.version = max(value.version, baseVersion) + 1
        do {
            apply(try await offlineStore.saveJournalNote(value, mutation: SyncMutation(id: ULID.generate(), kind: "journal.restore", entityId: value.id, baseVersion: baseVersion, payload: ["deletedAt": .null], occurredAt: Self.trashNow())))
            syncPhase = .pending
            trashSnapshot?.journalEntries.removeAll { $0.id == entry.id }
        } catch { trashErrorMessage = "Could not restore journal entry: \(error.localizedDescription)" }
    }

    func restoreTrashBudgetTransaction(_ transaction: BudgetTransactionModel) async {
        let local = currentSnapshot.budgetTransactions.first(where: { $0.id == transaction.id })
        let source = local ?? transaction
        let value = BudgetTransactionModel(id: source.id, userId: source.userId, type: source.type, amount: source.amount, currency: source.currency, category: source.category, categoryId: source.categoryId, merchant: source.merchant, paymentMethod: source.paymentMethod, transactionAt: source.transactionAt, note: source.note, version: (source.version ?? 1) + 1, createdAt: source.createdAt, updatedAt: Self.trashNow(), deletedAt: nil, deletedByDeviceId: nil)
        do {
            apply(try await offlineStore.saveBudgetTransaction(value, mutation: SyncMutation(id: ULID.generate(), kind: "budgettransaction.restore", entityId: value.id, baseVersion: source.version, payload: ["deletedAt": .null], occurredAt: Self.trashNow())))
            syncPhase = .pending
            trashSnapshot?.budgetTransactions.removeAll { $0.id == transaction.id }
        } catch { trashErrorMessage = "Could not restore transaction: \(error.localizedDescription)" }
    }

    func restoreTrashGymWorkout(_ workout: WorkoutModel) async {
        let local = currentSnapshot.gymWorkouts.first(where: { $0.id == workout.id })
        let source = local ?? workout
        let value = WorkoutModel(id: source.id, userId: source.userId, title: source.title, status: source.status, startedAt: source.startedAt, endedAt: source.endedAt, durationMinutes: source.durationMinutes, exercises: source.exercises, version: (source.version ?? 1) + 1, deletedAt: nil, deletedByDeviceId: nil)
        do {
            apply(try await offlineStore.saveWorkout(value, mutation: SyncMutation(id: ULID.generate(), kind: "gymworkout.restore", entityId: value.id, baseVersion: source.version, payload: ["deletedAt": .null], occurredAt: Self.trashNow())))
            syncPhase = .pending
            trashSnapshot?.gymWorkouts.removeAll { $0.id == workout.id }
        } catch { trashErrorMessage = "Could not restore workout: \(error.localizedDescription)" }
    }

    func restoreTrashGymExercise(_ exercise: ExerciseModel) async {
        let local = currentSnapshot.gymExercises.first(where: { $0.id == exercise.id })
        let source = local ?? exercise
        let value = ExerciseModel(id: source.id, userId: source.userId, name: source.name, normalizedName: source.normalizedName, description: source.description, imageStorageKey: source.imageStorageKey, imageUrl: source.imageUrl, metricType: source.metricType, equipment: source.equipment, primaryMuscleGroup: source.primaryMuscleGroup, secondaryMuscleGroups: source.secondaryMuscleGroups, defaultWeightUnit: source.defaultWeightUnit, defaultRestSeconds: source.defaultRestSeconds, archivedAt: source.archivedAt, deletedAt: nil, version: (source.version ?? 1) + 1, deletedByDeviceId: nil)
        do {
            apply(try await offlineStore.saveExercise(value, mutation: SyncMutation(id: ULID.generate(), kind: "exercisedefinition.restore", entityId: value.id, baseVersion: source.version, payload: ["deletedAt": .null], occurredAt: Self.trashNow())))
            syncPhase = .pending
            trashSnapshot?.gymExercises.removeAll { $0.id == exercise.id }
        } catch { trashErrorMessage = "Could not restore exercise: \(error.localizedDescription)" }
    }

    func permanentlyDeleteTrashJournalEntry(_ entry: JournalNoteModel) async {
        do {
            try await apiClient.permanentlyDeleteTrashJournalEntry(id: entry.id)
            if currentSnapshot.journalNotes.contains(where: { $0.id == entry.id }) { apply(try await offlineStore.permanentlyRemoveJournalNote(id: entry.id)) }
            trashSnapshot?.journalEntries.removeAll { $0.id == entry.id }
        } catch { trashErrorMessage = "Could not permanently delete journal entry: \(error.localizedDescription)" }
    }

    func permanentlyDeleteTrashBudgetTransaction(_ transaction: BudgetTransactionModel) async {
        do {
            try await apiClient.permanentlyDeleteTrashBudgetTransaction(id: transaction.id)
            if currentSnapshot.budgetTransactions.contains(where: { $0.id == transaction.id }) { apply(try await offlineStore.permanentlyRemoveBudgetTransaction(id: transaction.id)) }
            trashSnapshot?.budgetTransactions.removeAll { $0.id == transaction.id }
        } catch { trashErrorMessage = "Could not permanently delete transaction: \(error.localizedDescription)" }
    }

    func permanentlyDeleteTrashGymWorkout(_ workout: WorkoutModel) async {
        do {
            try await apiClient.permanentlyDeleteTrashGymWorkout(id: workout.id)
            if currentSnapshot.gymWorkouts.contains(where: { $0.id == workout.id }) { apply(try await offlineStore.permanentlyRemoveGymWorkout(id: workout.id)) }
            trashSnapshot?.gymWorkouts.removeAll { $0.id == workout.id }
        } catch { trashErrorMessage = "Could not permanently delete workout: \(error.localizedDescription)" }
    }

    func permanentlyDeleteTrashGymExercise(_ exercise: ExerciseModel) async {
        do {
            try await apiClient.permanentlyDeleteTrashGymExercise(id: exercise.id)
            if currentSnapshot.gymExercises.contains(where: { $0.id == exercise.id }) { apply(try await offlineStore.permanentlyRemoveGymExercise(id: exercise.id)) }
            trashSnapshot?.gymExercises.removeAll { $0.id == exercise.id }
        } catch { trashErrorMessage = "Could not permanently delete exercise: \(error.localizedDescription)" }
    }

    func permanentlyDeleteTrashTask(_ task: ProductivityTask) async {
        if tasks.contains(where: { $0.id == task.id }) {
            await deleteTask(task)
            trashSnapshot?.tasks.removeAll { $0.id == task.id }
            return
        }

        do {
            try await apiClient.permanentlyDeleteTrashTask(id: task.id)
            trashSnapshot?.tasks.removeAll { $0.id == task.id }
        } catch {
            trashErrorMessage = "Could not permanently delete task: \(error.localizedDescription)"
        }
    }
    private static func trashNow() -> String { ISO8601DateFormatter().string(from: Date()) }
}
