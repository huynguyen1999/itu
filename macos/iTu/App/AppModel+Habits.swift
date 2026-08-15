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
        let previousState = applyOptimisticHabitProgress(habitId: habitId, date: date, delta: value)
        do {
            let result = try await apiClient.addHabitProgress(habitId: habitId, localDate: date, value: value)
            let current = habitDayState(habitId: habitId, day: date)
            let projectedStatus: HabitProjectedStatus = switch result.status {
            case .completed: .completed
            case .skipped: .skipped
            case .failed: .failed
            case .pending: result.value > 0 ? .partial : .pending
            }
            habitCalendarByHabitAndDay[Self.habitOccurrenceKey(habitId: habitId, day: date)] = HabitDayStateModel(
                habitId: habitId,
                localDate: date,
                scheduled: current?.scheduled ?? true,
                status: projectedStatus,
                value: result.value,
                targetValue: result.targetValue,
                progressRatio: result.progressRatio,
                occurrenceId: result.occurrenceId,
                periodStart: current?.periodStart,
                periodEnd: current?.periodEnd
            )
            await applyAuthoritativeHabitGrowth(
                result.growthReceipt,
                mutationID: "habit-date-progress:\(habitId):\(date):\(result.growthReceipt?.receiptKey ?? result.occurrenceId)"
            )
            syncPhase = .upToDate
            return
        } catch {
            // The offline mutation remains the compatibility path when the V2 endpoint is unavailable.
        }
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
            restoreHabitDayState(habitId: habitId, date: date, previous: previousState)
        }
    }

    func deleteHabitProgress(_ log: HabitProgressLogModel, habitId: String, date: String) async {
        do {
            let occurrence = try await apiClient.deleteHabitProgress(id: log.id)
            let current = habitDayState(habitId: habitId, day: date)
            let status: HabitProjectedStatus = switch occurrence.status {
            case .completed: .completed
            case .skipped: .skipped
            case .failed: .failed
            case .pending: occurrence.value > 0 ? .partial : .pending
            }
            let target = current?.targetValue ?? 1
            habitCalendarByHabitAndDay[Self.habitOccurrenceKey(habitId: habitId, day: date)] = HabitDayStateModel(
                habitId: habitId,
                localDate: date,
                scheduled: current?.scheduled ?? true,
                status: status,
                value: occurrence.value,
                targetValue: target,
                progressRatio: min(1, occurrence.value / max(0.0001, target)),
                occurrenceId: occurrence.id,
                periodStart: current?.periodStart,
                periodEnd: current?.periodEnd
            )
            await applyAuthoritativeHabitGrowth(
                occurrence.growthReceipt,
                mutationID: "habit-progress-delete:\(log.id):\(occurrence.growthReceipt?.receiptKey ?? occurrence.id)"
            )
        } catch {
            errorMessage = "Could not remove habit progress: \(error.localizedDescription)"
        }
    }

    func createHabitReflection(habitId: String, habitName: String, localDate: String, occurrenceId: String?, contentMarkdown: String) async {
        do {
            let note = try await apiClient.createHabitReflection(
                habitId: habitId,
                habitName: habitName,
                localDate: localDate,
                occurrenceId: occurrenceId,
                contentMarkdown: contentMarkdown
            )
            apply(try await offlineStore.replaceJournalNotes(journalNotes + [note]))
        } catch {
            errorMessage = "Progress saved, but the Journal entry could not be saved: \(error.localizedDescription)"
        }
    }

    static func habitOccurrenceKey(habitId: String, day: String) -> String {
        "\(habitId)\u{1F}\(day)"
    }

    func habitOccurrence(habitId: String, day: String) -> HabitOccurrenceModel? {
        habitOccurrencesByHabitAndDay[Self.habitOccurrenceKey(habitId: habitId, day: day)]
    }

    func habitDayState(habitId: String, day: String) -> HabitDayStateModel? {
        if let exact = habitCalendarByHabitAndDay[Self.habitOccurrenceKey(habitId: habitId, day: day)] { return exact }
        return habitCalendarByHabitAndDay.values.first { state in
            state.habitId == habitId && state.periodStart != nil && state.periodEnd != nil && state.periodStart! <= day && day <= state.periodEnd!
        }
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
            let fetched = try await apiClient.fetchHabitCalendar(from: startDate, to: endDate)
            guard generation == sessionGeneration else { return }
            habitCalendarByHabitAndDay = fetched.days.reduce(into: [:]) { result, day in
                guard let habitId = day.habitId else { return }
                result[Self.habitOccurrenceKey(habitId: habitId, day: day.localDate)] = day
            }
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

    func habitOccurrenceAction(habitId: String, date: String, action: String) async {
        let previousState = applyOptimisticHabitAction(habitId: habitId, date: date, action: action)
        do {
            let occurrence = try await apiClient.habitOccurrenceAction(habitId: habitId, localDate: date, action: action)
            let current = habitDayState(habitId: habitId, day: date)
            let status: HabitProjectedStatus = switch occurrence.status {
            case .completed: .completed
            case .skipped: .skipped
            case .failed: .failed
            case .pending: occurrence.value > 0 ? .partial : .pending
            }
            habitCalendarByHabitAndDay[Self.habitOccurrenceKey(habitId: habitId, day: date)] = HabitDayStateModel(
                habitId: habitId,
                localDate: date,
                scheduled: current?.scheduled ?? true,
                status: status,
                value: occurrence.value,
                targetValue: current?.targetValue ?? 1,
                progressRatio: current?.targetValue == nil ? 0 : min(1, occurrence.value / max(0.0001, current?.targetValue ?? 1)),
                occurrenceId: occurrence.id,
                periodStart: current?.periodStart,
                periodEnd: current?.periodEnd
            )
            await applyAuthoritativeHabitGrowth(
                occurrence.growthReceipt,
                mutationID: "habit-date-action:\(habitId):\(date):\(action):\(occurrence.growthReceipt?.receiptKey ?? occurrence.id)"
            )
        } catch {
            do {
                let snapshot = try await offlineStore.habitOccurrenceActionDate(
                    habitId: habitId,
                    date: date,
                    action: action,
                    idempotencyKey: ULID.generate()
                )
                apply(snapshot)
                syncPhase = .pending
            } catch {
                errorMessage = "Could not update habit occurrence: \(error.localizedDescription)"
                restoreHabitDayState(habitId: habitId, date: date, previous: previousState)
            }
        }
    }

    private func applyOptimisticHabitProgress(habitId: String, date: String, delta: Double) -> HabitDayStateModel? {
        let key = Self.habitOccurrenceKey(habitId: habitId, day: date)
        let previous = habitCalendarByHabitAndDay[key]
        let current = habitDayState(habitId: habitId, day: date)
        let habit = habits.first(where: { $0.id == habitId })
        let target = current?.targetValue ?? (habit?.scheduleType.uppercased() == "TIMES_PER_PERIOD" ? Double(habit?.timesPerPeriod ?? 1) : habit?.targetValue ?? 1)
        let value = max(0, (current?.value ?? 0) + delta)
        let status: HabitProjectedStatus
        if habit?.direction == .limit {
            status = value > target ? .failed : .pending
        } else if value >= target {
            status = .completed
        } else if value > 0 {
            status = .partial
        } else {
            status = .pending
        }
        habitCalendarByHabitAndDay[key] = HabitDayStateModel(
            habitId: habitId,
            localDate: date,
            scheduled: current?.scheduled ?? true,
            status: status,
            value: value,
            targetValue: target,
            progressRatio: min(1, value / max(0.0001, target)),
            occurrenceId: current?.occurrenceId,
            periodStart: current?.periodStart,
            periodEnd: current?.periodEnd
        )
        return previous
    }

    private func applyOptimisticHabitAction(habitId: String, date: String, action: String) -> HabitDayStateModel? {
        let key = Self.habitOccurrenceKey(habitId: habitId, day: date)
        let previous = habitCalendarByHabitAndDay[key]
        let current = habitDayState(habitId: habitId, day: date)
        let status: HabitProjectedStatus = switch action.uppercased() {
        case "SKIP": .skipped
        case "FAIL": .failed
        default: .pending
        }
        habitCalendarByHabitAndDay[key] = HabitDayStateModel(
            habitId: habitId,
            localDate: date,
            scheduled: current?.scheduled ?? true,
            status: status,
            value: 0,
            targetValue: current?.targetValue ?? 1,
            progressRatio: 0,
            occurrenceId: current?.occurrenceId,
            periodStart: current?.periodStart,
            periodEnd: current?.periodEnd
        )
        return previous
    }

    private func restoreHabitDayState(habitId: String, date: String, previous: HabitDayStateModel?) {
        let key = Self.habitOccurrenceKey(habitId: habitId, day: date)
        if let previous {
            habitCalendarByHabitAndDay[key] = previous
        } else {
            habitCalendarByHabitAndDay.removeValue(forKey: key)
        }
    }

    private func applyAuthoritativeHabitGrowth(_ receipt: GrowthAwardReceipt?, mutationID: String) async {
        guard let receipt else { return }
        do {
            let snapshot = try await offlineStore.reconcileGrowthOutcomes(
                [SyncMutationOutcome(mutationId: mutationID, growthReceipt: receipt)],
                conflicts: []
            )
            apply(snapshot)
            enqueueGrowthReceipt(receipt, mutationId: mutationID)
        } catch {
            errorMessage = "Habit progress saved, but Growth could not be updated: \(error.localizedDescription)"
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
            let calendar = iTuCalendarSupport.calendar()
            let fromDate = calendar.date(byAdding: .day, value: -365, to: Date()) ?? Date()
            habitStatsByID[habit.id] = try await apiClient.fetchHabitInsights(
                id: habit.id,
                from: iTuCalendarSupport.dayString(fromDate),
                to: iTuCalendarSupport.dayString()
            )
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
