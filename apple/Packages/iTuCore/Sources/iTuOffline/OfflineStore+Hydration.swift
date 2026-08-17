import Foundation
import iTuDomain
public extension OfflineStore {
    @discardableResult
    func applyHydration(_ resources: OfflineHydrationResources) throws -> OfflineSnapshot {
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
            if let habitPreferences = resources.habitPreferences {
                state.habitPreferences = habitPreferences
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
            if let categories = resources.expenseCategories { try replaceBudgetCategories(categories) }
            if let budgets = resources.monthlyBudgets { try replaceMonthlyBudgets(budgets) }
            if let expenses = resources.expenses { try replaceExpenses(expenses) }
            if let recurring = resources.recurringExpenses { try replaceRecurringExpenses(recurring) }
            let optimisticGymWorkouts = Dictionary(uniqueKeysWithValues: state.gymWorkouts.map { ($0.id, $0) })
            let optimisticGymRoutines = Dictionary(uniqueKeysWithValues: state.gymRoutines.map { ($0.id, $0) })
            if let exercises = resources.gymExercises {
                let fetchedIDs = Set(exercises.map(\.id))
                let pendingIDs = Set(state.mutations.filter { $0.kind == "exercisedefinition.create" || $0.kind == "exercisedefinition.delete" || $0.kind == "exercisedefinition.restore" || $0.kind == "exercisedefinition.update" }.map(\.entityId))
                state.gymExercises = exercises + state.gymExercises.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
            }
            if let routines = resources.gymRoutines {
                let fetchedIDs = Set(routines.map(\.id))
                let parentPendingIDs = Set(state.mutations.filter {
                    $0.kind == "gymroutine.create" || $0.kind == "gymroutine.update"
                        || $0.kind == "gymroutine.delete" || $0.kind == "gymroutine.archive" || $0.kind == "gymroutine.restore"
                }.map(\.entityId))
                let childPendingIDs = Set(state.mutations.filter { $0.kind.hasPrefix("gymroutineexercise.") }.compactMap { $0.payload["routineId"]?.stringValue })
                let pendingIDs = parentPendingIDs.union(childPendingIDs)
                state.gymRoutines = routines + state.gymRoutines.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
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
            try reapplyPendingBudgetGymMutations()
            reapplyPendingGymExerciseMutations()
            reapplyPendingGymRoutineMutations(optimisticByID: optimisticGymRoutines)
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
