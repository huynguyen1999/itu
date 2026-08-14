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

}
