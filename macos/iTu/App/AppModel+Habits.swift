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

    func refreshHabitOccurrences(from startDate: String, to endDate: String) async {
        habitOccurrencesLoading = true
        habitOccurrencesErrorMessage = nil
        defer { habitOccurrencesLoading = false }

        do {
            let fetched = try await apiClient.fetchHabitOccurrences(from: startDate, to: endDate)
            let snapshot = try await offlineStore.updateHabitOccurrences(
                fetched,
                from: startDate,
                to: endDate
            )
            apply(snapshot)
        } catch {
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
