import Foundation

extension OfflineStore {
    @discardableResult
    func applyHydration(_ resources: AccountHydrationResources) throws -> OfflineSnapshot {
        let originalState = state
        suppressPersistence = true
        do {
            if let fetched = resources.tasks { try applyHydratedTasks(fetched) }
            if let fetched = resources.lists { try applyHydratedLists(fetched) }
            if let sections = resources.sections, let tags = resources.tags {
                state.sections = sections
                state.tags = tags
            } else {
                if let sections = resources.sections { state.sections = sections }
                if let tags = resources.tags { state.tags = tags }
            }
            if let metadata = resources.metadata { try updateTaskMetadata(metadata) }
            if let habits = resources.habits {
                let optimistic = Dictionary(uniqueKeysWithValues: state.habits.map { ($0.id, $0) })
                let pending = Set(state.mutations.compactMap { mutation -> String? in
                    if mutation.kind.hasPrefix("habit.") {
                        return mutation.entityId
                    } else if mutation.kind.hasPrefix("habitoccurrence.") {
                        return state.habitOccurrences.first(where: { $0.id == mutation.entityId })?.habitId
                    }
                    return nil
                })
                let retained = state.habits.filter { existing in
                    pending.contains(existing.id) && !habits.contains(where: { $0.id == existing.id })
                }
                state.habits = habits + retained
                try reapplyPendingHabitMutations(optimisticByID: optimistic)
            }
            let optimisticSkills = Dictionary(uniqueKeysWithValues: state.skills.map { ($0.id, $0) })
            let optimisticShopItems = Dictionary(uniqueKeysWithValues: state.shopItems.map { ($0.id, $0) })
            let optimisticInventory = Dictionary(uniqueKeysWithValues: state.inventoryItems.map { ($0.id, $0) })
            if let growth = resources.growth { try updateGrowthOverview(growth) }
            if let skills = resources.skills {
                try updateGrowthSkills(skills)
                try reapplyPendingGrowthSkillMutations(optimisticByID: optimisticSkills)
            } else if resources.growth != nil {
                // The overview endpoint may carry the authoritative skill list
                // when the dedicated skills request fails or is omitted.
                try reapplyPendingGrowthSkillMutations(optimisticByID: optimisticSkills)
            }
            if let attributes = resources.attributes { try updateGrowthAttributes(attributes) }
            if let rewards = resources.rewards { try updateGrowthRewards(rewards) }
            if let inventory = resources.inventory { try updateGrowthInventory(inventory) }
            if resources.growth != nil || resources.rewards != nil || resources.inventory != nil {
                reapplyPendingGrowthRewardRedemptions(
                    optimisticShopItems: optimisticShopItems,
                    optimisticInventory: optimisticInventory,
                    debitCoins: resources.growth != nil
                )
            }
            if let ledger = resources.ledger { try updateGrowthLedger(ledger) }
            if let decks = resources.decks { try applyHydratedDecks(decks) }
            for (deckID, cards) in resources.cards {
                if let cards { try updateCards(deckId: deckID, cards: cards) }
            }
            if let profile = resources.profile { try updateGrowthProfile(profile) }
            if let presets = resources.presets { try updateGrowthRewardPresetSettings(presets) }
            if let taskRules = resources.taskRules, let habitRules = resources.habitRules {
                try updateGrowthEarningRules(taskRules + habitRules)
            } else if let taskRules = resources.taskRules {
                try updateGrowthEarningRules(taskRules)
            } else if let habitRules = resources.habitRules {
                try updateGrowthEarningRules(habitRules)
            }
            if let defaults = resources.rewardDefaults { try updateGrowthTaskRewardDefaults(defaults) }
            if let mappings = resources.mappings { try updateGrowthAttributeMappings(mappings) }
            let optimisticBudgetCategories = Dictionary(uniqueKeysWithValues: state.budgetCategories.map { ($0.id, $0) })
            let optimisticBudgetPeriods = Dictionary(uniqueKeysWithValues: state.budgetPeriods.map { ($0.id, $0) })
            if let categories = resources.budgetCategories {
                let fetchedIDs = Set(categories.map(\.id))
                let pendingIDs = Set(state.mutations.filter { $0.kind.hasPrefix("moneycategory.") }.map(\.entityId))
                state.budgetCategories = categories + state.budgetCategories.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
            }
            if let period = resources.budgetPeriod {
                if let index = state.budgetPeriods.firstIndex(where: { $0.id == period.id }) {
                    state.budgetPeriods[index] = period
                } else {
                    state.budgetPeriods.append(period)
                }
            }
            let optimisticBudgetTransactions = Dictionary(uniqueKeysWithValues: state.budgetTransactions.map { ($0.id, $0) })
            let optimisticGymWorkouts = Dictionary(uniqueKeysWithValues: state.gymWorkouts.map { ($0.id, $0) })
            if let transactions = resources.budgetTransactions {
                let fetchedIDs = Set(transactions.map(\.id))
                let pendingIDs = Set(state.mutations.filter { $0.kind.hasPrefix("budgettransaction.") }.map(\.entityId))
                state.budgetTransactions = transactions + state.budgetTransactions.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
            }
            if let exercises = resources.gymExercises {
                let fetchedIDs = Set(exercises.map(\.id))
                let pendingIDs = Set(state.mutations.filter { $0.kind == "exercisedefinition.create" || $0.kind == "exercisedefinition.delete" || $0.kind == "exercisedefinition.restore" || $0.kind == "exercisedefinition.update" }.map(\.entityId))
                state.gymExercises = exercises + state.gymExercises.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
            }
            if let workouts = resources.gymWorkouts {
                let fetchedIDs = Set(workouts.map(\.id))
                let parentPendingIDs = Set(state.mutations.filter {
                    $0.kind == "workout.create" || $0.kind == "workout.update" || $0.kind == "workout.finish"
                        || $0.kind == "gymworkout.create" || $0.kind == "gymworkout.update"
                        || $0.kind == "gymworkout.delete" || $0.kind == "gymworkout.restore"
                }.map(\.entityId))
                let pendingIDs = parentPendingIDs.union(pendingGranularGymWorkoutIDs(optimisticByID: optimisticGymWorkouts))
                state.gymWorkouts = workouts + state.gymWorkouts.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
            }
            if let notes = resources.journalNotes { state.journalNotes = notes }
            if let tags = resources.journalTags { state.journalTags = tags }
            if let templates = resources.journalTemplates { state.journalTemplates = templates }
            reapplyPendingBudgetMetadataMutations(optimisticCategoriesByID: optimisticBudgetCategories, optimisticPeriodsByID: optimisticBudgetPeriods)
            try reapplyPendingBudgetGymMutations()
            reapplyPendingGymExerciseMutations()
            reapplyPendingBudgetTransactionMutations(optimisticByID: optimisticBudgetTransactions)
            reapplyPendingGymWorkoutMutations(optimisticByID: optimisticGymWorkouts)
            reapplyPendingGranularGymMutations(optimisticByID: optimisticGymWorkouts)
            reapplyPendingJournalMutations()
            suppressPersistence = false
            try persist()
            return state
        } catch {
            state = originalState
            suppressPersistence = false
            throw error
        }
    }

    private func reapplyPendingBudgetGymMutations() throws {
        for mutation in state.mutations {
            switch mutation.kind {
            case "moneycategory.delete": state.budgetCategories.removeAll { $0.id == mutation.entityId }
            case "budgettransaction.delete":
                if let index = state.budgetTransactions.firstIndex(where: { $0.id == mutation.entityId }) {
                    let value = state.budgetTransactions[index]
                    state.budgetTransactions[index] = BudgetTransactionModel(id: value.id, userId: value.userId, type: value.type, amount: value.amount, currency: value.currency, category: value.category, categoryId: value.categoryId, merchant: value.merchant, paymentMethod: value.paymentMethod, transactionAt: value.transactionAt, note: value.note, version: max(value.version ?? 1, (mutation.baseVersion ?? value.version ?? 1) + 1), createdAt: value.createdAt, updatedAt: value.updatedAt, deletedAt: mutation.payload["deletedAt"]?.stringValue ?? value.deletedAt ?? mutation.occurredAt, deletedByDeviceId: value.deletedByDeviceId)
                }
            case "budgettransaction.restore":
                if let index = state.budgetTransactions.firstIndex(where: { $0.id == mutation.entityId }) {
                    let value = state.budgetTransactions[index]
                    state.budgetTransactions[index] = BudgetTransactionModel(id: value.id, userId: value.userId, type: value.type, amount: value.amount, currency: value.currency, category: value.category, categoryId: value.categoryId, merchant: value.merchant, paymentMethod: value.paymentMethod, transactionAt: value.transactionAt, note: value.note, version: max(value.version ?? 1, (mutation.baseVersion ?? value.version ?? 1) + 1), createdAt: value.createdAt, updatedAt: value.updatedAt, deletedAt: nil, deletedByDeviceId: nil)
                }
            case "exercisedefinition.delete":
                if let index = state.gymExercises.firstIndex(where: { $0.id == mutation.entityId }) {
                    let value = state.gymExercises[index]
                    state.gymExercises[index] = ExerciseModel(id: value.id, userId: value.userId, name: value.name, normalizedName: value.normalizedName, description: value.description, imageStorageKey: value.imageStorageKey, imageUrl: value.imageUrl, metricType: value.metricType, equipment: value.equipment, primaryMuscleGroup: value.primaryMuscleGroup, secondaryMuscleGroups: value.secondaryMuscleGroups, defaultWeightUnit: value.defaultWeightUnit, defaultRestSeconds: value.defaultRestSeconds, archivedAt: value.archivedAt, deletedAt: mutation.payload["deletedAt"]?.stringValue ?? value.deletedAt ?? mutation.occurredAt, version: max(value.version ?? 1, (mutation.baseVersion ?? value.version ?? 1) + 1), deletedByDeviceId: value.deletedByDeviceId)
                }
            case "exercisedefinition.restore":
                if let index = state.gymExercises.firstIndex(where: { $0.id == mutation.entityId }) {
                    let value = state.gymExercises[index]
                    state.gymExercises[index] = ExerciseModel(id: value.id, userId: value.userId, name: value.name, normalizedName: value.normalizedName, description: value.description, imageStorageKey: value.imageStorageKey, imageUrl: value.imageUrl, metricType: value.metricType, equipment: value.equipment, primaryMuscleGroup: value.primaryMuscleGroup, secondaryMuscleGroups: value.secondaryMuscleGroups, defaultWeightUnit: value.defaultWeightUnit, defaultRestSeconds: value.defaultRestSeconds, archivedAt: value.archivedAt, deletedAt: nil, version: max(value.version ?? 1, (mutation.baseVersion ?? value.version ?? 1) + 1), deletedByDeviceId: nil)
                }
            case "exercisedefinition.update":
                if let index = state.gymExercises.firstIndex(where: { $0.id == mutation.entityId }) {
                    let value = state.gymExercises[index]
                    let archivedAt: String?
                    if let archived = mutation.payload["archivedAt"] {
                        archivedAt = archived.stringValue
                    } else {
                        archivedAt = value.archivedAt
                    }
                    state.gymExercises[index] = ExerciseModel(id: value.id, userId: value.userId, name: mutation.payload["name"]?.stringValue ?? value.name, normalizedName: (mutation.payload["name"]?.stringValue ?? value.name).lowercased(), description: mutation.payload["description"]?.stringValue ?? value.description, imageStorageKey: value.imageStorageKey, imageUrl: value.imageUrl, metricType: mutation.payload["metricType"]?.stringValue ?? value.metricType, equipment: mutation.payload["equipment"]?.stringValue ?? value.equipment, primaryMuscleGroup: mutation.payload["primaryMuscleGroup"]?.stringValue ?? value.primaryMuscleGroup, secondaryMuscleGroups: value.secondaryMuscleGroups, defaultWeightUnit: mutation.payload["defaultWeightUnit"]?.stringValue ?? value.defaultWeightUnit, defaultRestSeconds: mutation.payload["defaultRestSeconds"]?.numberValue.map(Int.init) ?? value.defaultRestSeconds, archivedAt: archivedAt, deletedAt: value.deletedAt, version: max(value.version ?? 1, (mutation.baseVersion ?? value.version ?? 1) + 1), deletedByDeviceId: value.deletedByDeviceId)
                }
            case "gymworkout.delete":
                if let index = state.gymWorkouts.firstIndex(where: { $0.id == mutation.entityId }) {
                    let value = state.gymWorkouts[index]
                    state.gymWorkouts[index] = WorkoutModel(id: value.id, userId: value.userId, title: value.title, status: value.status, startedAt: value.startedAt, endedAt: value.endedAt, durationMinutes: value.durationMinutes, exercises: value.exercises, version: max(value.version ?? 1, (mutation.baseVersion ?? value.version ?? 1) + 1), deletedAt: mutation.payload["deletedAt"]?.stringValue ?? value.deletedAt ?? mutation.occurredAt, deletedByDeviceId: value.deletedByDeviceId)
                }
            case "gymworkout.restore":
                if let index = state.gymWorkouts.firstIndex(where: { $0.id == mutation.entityId }) {
                    let value = state.gymWorkouts[index]
                    state.gymWorkouts[index] = WorkoutModel(id: value.id, userId: value.userId, title: value.title, status: value.status, startedAt: value.startedAt, endedAt: value.endedAt, durationMinutes: value.durationMinutes, exercises: value.exercises, version: max(value.version ?? 1, (mutation.baseVersion ?? value.version ?? 1) + 1), deletedAt: nil, deletedByDeviceId: nil)
                }
            default: break
            }
        }
    }

    private func applyHydratedTasks(_ fetched: [ProductivityTask]) throws {
        let optimistic = Dictionary(uniqueKeysWithValues: state.tasks.map { ($0.id, $0) })
        let fetchedIDs = Set(fetched.map(\.id))
        let pending = Set(state.mutations.filter { $0.kind == "task.create" || $0.kind == "task.update" }.map(\.entityId))
        state.tasks = fetched + state.tasks.filter { !fetchedIDs.contains($0.id) && pending.contains($0.id) }
        try reapplyPendingTaskMutations(optimisticTasksByID: optimistic)
    }

    private func applyHydratedLists(_ fetched: [TaskListModel]) throws {
        let optimistic = Dictionary(uniqueKeysWithValues: state.taskLists.map { ($0.id, $0) })
        state.taskLists = fetched
        try reapplyPendingTaskListMutations(optimisticByID: optimistic)
    }

    private func applyHydratedDecks(_ fetched: [DeckModel]) throws {
        let optimistic = Dictionary(uniqueKeysWithValues: state.decks.map { ($0.id, $0) })
        let fetchedIDs = Set(fetched.map(\.id))
        let pendingIDs = Set(state.mutations.filter { $0.kind == "deck.create" || $0.kind == "deck.restore" }.map(\.entityId))
        state.decks = fetched + state.decks.filter { !fetchedIDs.contains($0.id) && pendingIDs.contains($0.id) }
        var latestDeckOperationByID: [String: String] = [:]
        for mutation in state.mutations where mutation.kind == "deck.delete" || mutation.kind == "deck.restore" {
            latestDeckOperationByID[mutation.entityId] = mutation.kind
        }
        let deletedDeckIDs = Set(
            latestDeckOperationByID.compactMap { $0.value == "deck.delete" ? $0.key : nil }
        )
        state.decks.removeAll { deletedDeckIDs.contains($0.id) }
        for mutation in state.mutations where mutation.kind == "deck.create" || mutation.kind == "deck.restore" {
            if !state.decks.contains(where: { $0.id == mutation.entityId }), let deck = optimistic[mutation.entityId] {
                state.decks.append(deck)
            }
        }
        for deckID in Set(state.cardsByDeckId.keys).subtracting(Set(state.decks.map(\.id))) {
            state.cardsByDeckId.removeValue(forKey: deckID)
        }
    }

    private func reapplyPendingHabitMutations(optimisticByID: [String: HabitModel]) throws {
        for mutation in state.mutations where mutation.kind == "habit.update" || mutation.kind == "habit.create" || mutation.kind == "habit.checkin" {
            if mutation.kind == "habit.checkin" {
                if let opt = optimisticByID[mutation.entityId], let index = state.habits.firstIndex(where: { $0.id == mutation.entityId }) {
                    state.habits[index] = opt
                }
                continue
            }
            let habit = state.habits.first(where: { $0.id == mutation.entityId }) ?? optimisticByID[mutation.entityId]
            guard habit != nil else { continue }
            guard var value = habit else { continue }
            if let name = mutation.payload["name"]?.stringValue { value.name = name }
            if case let .string(description)? = mutation.payload["description"] { value.description = description }
            if case .null? = mutation.payload["description"] { value.description = nil }
            if let icon = mutation.payload["icon"]?.stringValue { value.icon = icon }
            if let color = mutation.payload["color"]?.stringValue { value.color = color }
            if let frequency = mutation.payload["frequency"]?.stringValue, let parsed = HabitFrequency(rawValue: frequency) { value.frequency = parsed }
            if let target = mutation.payload["targetValue"]?.numberValue { value.targetValue = target }
            if let targetType = mutation.payload["targetType"]?.stringValue { value.targetType = targetType }
            if case let .string(unit)? = mutation.payload["unit"] { value.unit = unit }
            if case .null? = mutation.payload["unit"] { value.unit = nil }
            if let days = mutation.payload["targetDaysPerWeek"]?.numberValue { value.targetDaysPerWeek = Int(days) }
            if let direction = mutation.payload["direction"]?.stringValue, let parsed = HabitDirection(rawValue: direction) { value.direction = parsed }
            if let schedule = mutation.payload["scheduleType"]?.stringValue { value.scheduleType = schedule }
            if case let .array(days)? = mutation.payload["weekdays"] { value.weekdays = days.compactMap { $0.numberValue.map(Int.init) } }
            if let interval = mutation.payload["intervalDays"]?.numberValue { value.intervalDays = Int(interval) }
            if case .null? = mutation.payload["intervalDays"] { value.intervalDays = nil }
            if let times = mutation.payload["timesPerPeriod"]?.numberValue { value.timesPerPeriod = Int(times) }
            if case .null? = mutation.payload["timesPerPeriod"] { value.timesPerPeriod = nil }
            if case let .string(period)? = mutation.payload["period"] { value.period = period }
            if case .null? = mutation.payload["period"] { value.period = nil }
            if let start = mutation.payload["startDate"]?.stringValue { value.startDate = start }
            if case let .string(end)? = mutation.payload["endDate"] { value.endDate = end }
            if case .null? = mutation.payload["endDate"] { value.endDate = nil }
            if case let .string(block)? = mutation.payload["timeBlockId"] { value.timeBlockId = block }
            if case .null? = mutation.payload["timeBlockId"] { value.timeBlockId = nil }
            if case let .array(tags)? = mutation.payload["tagIds"] { value.tagIds = tags.compactMap(\.stringValue) }
            if case .bool(true)? = mutation.payload["archived"] { value.archivedAt = value.archivedAt ?? ISO8601DateFormatter().string(from: Date()) }
            if let index = state.habits.firstIndex(where: { $0.id == value.id }) { state.habits[index] = value } else { state.habits.append(value) }
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let todayStr = formatter.string(from: Date())
        
        for mutation in state.mutations {
            if mutation.kind == "habitoccurrence.checkin" {
                if let occurrence = state.habitOccurrences.first(where: { $0.id == mutation.entityId }),
                   occurrence.localDayString == todayStr,
                   let habitIndex = state.habits.firstIndex(where: { $0.id == occurrence.habitId }) {
                    if let optimisticHabit = optimisticByID[occurrence.habitId] {
                        state.habits[habitIndex].isCompletedToday = optimisticHabit.isCompletedToday
                        state.habits[habitIndex].currentStreak = optimisticHabit.currentStreak
                        state.habits[habitIndex].bestStreak = optimisticHabit.bestStreak
                        state.habits[habitIndex].totalCompletions = optimisticHabit.totalCompletions
                    } else {
                        state.habits[habitIndex].isCompletedToday = true
                    }
                }
            } else if mutation.kind == "habitoccurrence.action",
                      let action = mutation.payload["action"]?.stringValue,
                      action == "undo" {
                if let occurrence = state.habitOccurrences.first(where: { $0.id == mutation.entityId }),
                   occurrence.localDayString == todayStr,
                   let habitIndex = state.habits.firstIndex(where: { $0.id == occurrence.habitId }) {
                    if let optimisticHabit = optimisticByID[occurrence.habitId] {
                        state.habits[habitIndex].isCompletedToday = optimisticHabit.isCompletedToday
                        state.habits[habitIndex].currentStreak = optimisticHabit.currentStreak
                        state.habits[habitIndex].bestStreak = optimisticHabit.bestStreak
                        state.habits[habitIndex].totalCompletions = optimisticHabit.totalCompletions
                    } else {
                        state.habits[habitIndex].isCompletedToday = false
                    }
                }
            }
        }
    }

    private func reapplyPendingGrowthSkillMutations(optimisticByID: [String: SkillNode]) throws {
        for mutation in state.mutations where mutation.kind == "growthskill.update" {
            let skill = state.skills.first(where: { $0.id == mutation.entityId }) ?? optimisticByID[mutation.entityId]
            guard var value = skill else { continue }
            if let name = mutation.payload["name"]?.stringValue { value.name = name }
            if let description = mutation.payload["description"]?.stringValue { value.description = description }
            if let icon = mutation.payload["icon"]?.stringValue { value.icon = icon }
            if let index = state.skills.firstIndex(where: { $0.id == value.id }) { state.skills[index] = value } else { state.skills.append(value) }
        }
    }

    private func reapplyPendingGrowthRewardRedemptions(
        optimisticShopItems: [String: ShopItem],
        optimisticInventory: [String: InventoryItem],
        debitCoins: Bool
    ) {
        for mutation in state.mutations where mutation.kind == "growthshopreward.redeem" {
            guard let optimistic = optimisticShopItems[mutation.entityId] else { continue }
            if let index = state.shopItems.firstIndex(where: { $0.id == mutation.entityId }) {
                state.shopItems[index].redemptionCount = max(state.shopItems[index].redemptionCount, optimistic.redemptionCount)
                state.shopItems[index].isPurchased = state.shopItems[index].isPurchased || optimistic.isPurchased
            } else {
                state.shopItems.append(optimistic)
            }
            if let optimisticInventoryItem = optimisticInventory[mutation.entityId] {
                if let index = state.inventoryItems.firstIndex(where: { $0.id == mutation.entityId }) {
                    state.inventoryItems[index].quantity = max(state.inventoryItems[index].quantity, optimisticInventoryItem.quantity)
                } else {
                    state.inventoryItems.append(optimisticInventoryItem)
                }
            }
            if debitCoins, let price = state.shopItems.first(where: { $0.id == mutation.entityId })?.costCoins {
                state.userCoins = max(0, state.userCoins - price)
            }
        }
    }
}
