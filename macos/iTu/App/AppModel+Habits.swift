import Foundation

@MainActor
extension AppModel {
    func toggleHabitCheckIn(_ habit: HabitModel) async {
        do {
            let snapshot = try await offlineStore.toggleHabitCheckIn(id: habit.id)
            apply(snapshot)
            syncPhase = .pending
        } catch {
            errorMessage = "Could not toggle habit check-in: \(error.localizedDescription)"
        }
    }

    func checkInHabitOccurrence(_ occurrence: HabitOccurrenceModel, value: Double) async {
        do {
            let snapshot = try await offlineStore.checkInHabitOccurrence(
                id: occurrence.id,
                value: value,
                idempotencyKey: ULID.generate()
            )
            apply(snapshot)
            if let mutation = snapshot.mutations.last(where: {
                $0.kind == "habitoccurrence.checkin" && $0.entityId == occurrence.id
            }),
               let updatedOccurrence = snapshot.habitOccurrences.first(where: { $0.id == occurrence.id }),
               let optimisticReceipt = makeOptimisticGrowthReceipt(
                   sourceType: .habit,
                   sourceId: occurrence.id,
                   ruleSourceId: occurrence.habitId,
                   title: habits.first(where: { $0.id == occurrence.habitId })?.name ?? "Habit",
                   wasCompleted: occurrence.status == .completed,
                   isCompleted: updatedOccurrence.status == .completed
               ) {
                apply(try await offlineStore.recordOptimisticGrowthReceipt(optimisticReceipt, mutationId: mutation.id))
                enqueueGrowthReceipt(optimisticReceipt, mutationId: mutation.id)
            }
            syncPhase = .pending
        } catch {
            errorMessage = "Could not check in habit: \(error.localizedDescription)"
        }
    }

    func checkInHabitDate(habitId: String, date: String, value: Double) async {
        do {
            let key = ULID.generate()
            let snapshot = try await offlineStore.checkInHabitDate(
                habitId: habitId,
                date: date,
                value: value,
                idempotencyKey: key
            )
            apply(snapshot)
            if let newOccurrence = snapshot.habitOccurrences.first(where: { $0.habitId == habitId && $0.localDayString == date }),
               let mutation = snapshot.mutations.last(where: {
                   $0.kind == "habitoccurrence.checkin" && $0.entityId == newOccurrence.id
               }),
               let optimisticReceipt = makeOptimisticGrowthReceipt(
                   sourceType: .habit,
                   sourceId: newOccurrence.id,
                   ruleSourceId: habitId,
                   title: habits.first(where: { $0.id == habitId })?.name ?? "Habit",
                   wasCompleted: false,
                   isCompleted: newOccurrence.status == .completed
               ) {
                apply(try await offlineStore.recordOptimisticGrowthReceipt(optimisticReceipt, mutationId: mutation.id))
                enqueueGrowthReceipt(optimisticReceipt, mutationId: mutation.id)
            }
            syncPhase = .pending
        } catch {
            errorMessage = "Could not check in habit: \(error.localizedDescription)"
        }
    }

    static func habitOccurrenceKey(habitId: String, day: String) -> String {
        "\(habitId)\u{1F}\(day)"
    }

    func habitOccurrence(habitId: String, day: String) -> HabitOccurrenceModel? {
        habitOccurrencesByHabitAndDay[Self.habitOccurrenceKey(habitId: habitId, day: day)]
    }

    func refreshHabitOccurrences(from startDate: String, to endDate: String, force: Bool = false) async {
        let key = "\(startDate):\(endDate)"
        if let inFlight = habitOccurrenceRefreshTasks[key] {
            await inFlight.value
            return
        }
        if !force,
           let lastRefresh = habitOccurrenceRefreshDates[key],
           Date().timeIntervalSince(lastRefresh) < 5 * 60 {
            return
        }

        let generation = sessionGeneration
        let refreshTask = Task<Void, Never> { [weak self] in
            await self?.refreshHabitOccurrencesData(
                from: startDate,
                to: endDate,
                key: key,
                generation: generation
            )
        }
        habitOccurrenceRefreshTasks[key] = refreshTask
        await refreshTask.value
        if sessionGeneration == generation {
            habitOccurrenceRefreshTasks[key] = nil
        }
    }

    private func refreshHabitOccurrencesData(
        from startDate: String,
        to endDate: String,
        key: String,
        generation: Int
    ) async {
        let store = offlineStore
        habitOccurrenceLoadingKeys.insert(key)
        habitOccurrencesLoading = true
        habitOccurrencesErrorMessage = nil
        defer {
            if generation == sessionGeneration {
                habitOccurrenceLoadingKeys.remove(key)
                habitOccurrencesLoading = !habitOccurrenceLoadingKeys.isEmpty
            }
        }

        do {
            let fetched = try await apiClient.fetchHabitOccurrences(from: startDate, to: endDate)
            guard generation == sessionGeneration else { return }
            let snapshot = try await store.updateHabitOccurrences(
                fetched,
                from: startDate,
                to: endDate
            )
            guard generation == sessionGeneration else { return }
            apply(snapshot)
            habitOccurrenceRefreshDates[key] = Date()
        } catch {
            guard generation == sessionGeneration else { return }
            habitOccurrencesErrorMessage = error.localizedDescription
        }
    }

    func habitOccurrenceAction(_ occurrence: HabitOccurrenceModel, action: String) async {
        do {
            let snapshot = try await offlineStore.habitOccurrenceAction(
                id: occurrence.id,
                action: action,
                idempotencyKey: ULID.generate()
            )
            apply(snapshot)
            if let mutation = snapshot.mutations.last(where: {
                $0.kind == "habitoccurrence.action" && $0.entityId == occurrence.id
            }),
               let updatedOccurrence = snapshot.habitOccurrences.first(where: { $0.id == occurrence.id }),
               let optimisticReceipt = makeOptimisticGrowthReceipt(
                   sourceType: .habit,
                   sourceId: occurrence.id,
                   ruleSourceId: occurrence.habitId,
                   title: habits.first(where: { $0.id == occurrence.habitId })?.name ?? "Habit",
                   wasCompleted: occurrence.status == .completed,
                   isCompleted: updatedOccurrence.status == .completed
               ) {
                apply(try await offlineStore.recordOptimisticGrowthReceipt(optimisticReceipt, mutationId: mutation.id))
                enqueueGrowthReceipt(optimisticReceipt, mutationId: mutation.id)
            }
            syncPhase = .pending
        } catch {
            errorMessage = "Could not update habit occurrence: \(error.localizedDescription)"
        }
    }

    func saveHabit(_ habit: HabitModel) async {
        do {
            let snapshot = try await offlineStore.saveHabit(habit)
            apply(snapshot)
            syncPhase = .pending
        } catch {
            errorMessage = "Could not save habit: \(error.localizedDescription)"
        }
    }

    func archiveHabit(_ habit: HabitModel) async {
        var updated = habit
        updated.archivedAt = habit.archivedAt == nil
            ? ISO8601DateFormatter().string(from: Date())
            : nil
        await saveHabit(updated)
    }

    func refreshHabitStats(for habit: HabitModel) async {
        do {
            habitStatsByID[habit.id] = try await apiClient.fetchHabitStats(id: habit.id)
        } catch {
            errorMessage = "Could not load habit statistics: \(error.localizedDescription)"
        }
    }

    func createHabitTimeBlock(name: String) async {
        do {
            let block = try await apiClient.createHabitTimeBlock(name: name)
            habitTimeBlocks.append(block)
            habitTimeBlocks.sort { $0.sortOrder < $1.sortOrder }
        } catch {
            errorMessage = "Could not create habit group: \(error.localizedDescription)"
        }
    }

}
