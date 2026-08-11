import Foundation

struct AccountHydrationResult: Sendable {
    let snapshot: OfflineSnapshot
    let usagePreferences: UsagePreferences?
    let habitTimeBlocks: [HabitTimeBlockModel]?
    let studySessionHistory: [StudySessionHistoryItem]?
    let notifications: [AppNotificationModel]?
}

/// Fetches account resources independently, then applies one local snapshot.
/// A failed resource is represented as `nil`; an empty successful response
/// remains authoritative and is applied as an empty collection.
final class AccountHydrator: @unchecked Sendable {
    private let apiClient: APIClient
    private let offlineStore: OfflineStore

    init(apiClient: APIClient, offlineStore: OfflineStore) {
        self.apiClient = apiClient
        self.offlineStore = offlineStore
    }

    func hydrate() async throws -> AccountHydrationResult {
        async let tasks = fetch { try await self.apiClient.fetchTasks() }
        async let lists = fetch { try await self.apiClient.fetchTaskLists() }
        async let sections = fetch { try await self.apiClient.fetchTaskSections() }
        async let tags = fetch { try await self.apiClient.fetchTaskTags() }
        async let metadata = fetch { try await self.apiClient.fetchTaskMetadata() }
        async let habits = fetch { try await self.apiClient.fetchHabits() }
        async let timeBlocks = fetch { try await self.apiClient.fetchHabitTimeBlocks() }
        async let growth = fetch { try await self.apiClient.fetchGrowthOverview() }
        async let skills = fetch { try await self.apiClient.fetchGrowthSkills() }
        async let attributes = fetch { try await self.apiClient.fetchGrowthAttributes() }
        async let rewards = fetch { try await self.apiClient.fetchGrowthRewards() }
        async let inventory = fetch { try await self.apiClient.fetchGrowthInventory() }
        async let ledger = fetch { try await self.apiClient.fetchGrowthLedger() }
        async let decks = fetch { try await self.apiClient.fetchDecks() }
        async let history = fetch { try await self.apiClient.fetchStudySessionHistory() }
        async let notifications = fetch { try await self.apiClient.fetchNotifications() }
        async let profile = fetch { try await self.apiClient.fetchGrowthProfile() }
        async let presets = fetch { try await self.apiClient.fetchGrowthRewardPresetSettings() }
        async let taskRules = fetch { try await self.apiClient.fetchGrowthEarningRules(sourceType: .task) }
        async let habitRules = fetch { try await self.apiClient.fetchGrowthEarningRules(sourceType: .habit) }
        async let rewardDefaults = fetch { try await self.apiClient.fetchGrowthTaskRewardDefaults() }
        async let mappings = fetch { try await self.apiClient.fetchGrowthAttributeMappings() }
        async let budgetCategories = fetch { try await self.apiClient.getBudgetCategories() }
        async let budgetPeriod = fetch { try await self.apiClient.getBudgetPeriod(period: iTuCalendarSupport.monthString()) }
        async let budgetTransactions = fetch { try await self.apiClient.getBudgetTransactions() }
        async let gymExercises = fetch { try await self.apiClient.getGymExercises() }
        async let gymWorkouts = fetch { try await self.apiClient.getGymWorkouts() }
        async let journalNotes = fetch { try await self.apiClient.getJournalNotes() }
        async let journalTags = fetch { try await self.apiClient.getJournalTags() }
        async let journalTemplates = fetch { try await self.apiClient.getJournalTemplates() }
        async let usagePreferences = fetch { try await self.apiClient.fetchUsagePreferences() }

        let fetchedDecks = await decks
        var cardsByDeck: [String: [CardModel]?] = [:]
        if let deckValues = fetchedDecks {
            await withTaskGroup(of: (String, [CardModel]?).self) { group in
                for deck in deckValues {
                    group.addTask { (deck.id, await self.fetch { try await self.apiClient.fetchCards(deckId: deck.id) }) }
                }
                for await (deckID, cards) in group { cardsByDeck[deckID] = cards }
            }
        }

        var resource = AccountHydrationResources(
            tasks: await tasks, lists: await lists, sections: await sections, tags: await tags,
            metadata: await metadata, habits: await habits, growth: await growth, skills: await skills,
            attributes: await attributes, rewards: await rewards, inventory: await inventory,
            ledger: await ledger, decks: fetchedDecks, cards: cardsByDeck, profile: await profile,
            presets: await presets, taskRules: await taskRules, habitRules: await habitRules,
            rewardDefaults: await rewardDefaults, mappings: await mappings
        )
        resource.budgetCategories = await budgetCategories
        resource.budgetPeriod = await budgetPeriod
        resource.budgetTransactions = await budgetTransactions
        resource.gymExercises = await gymExercises
        resource.gymWorkouts = await gymWorkouts
        resource.journalNotes = await journalNotes
        resource.journalTags = await journalTags
        resource.journalTemplates = await journalTemplates
        let snapshot = try await offlineStore.applyHydration(resource)
        return AccountHydrationResult(
            snapshot: snapshot,
            usagePreferences: await usagePreferences,
            habitTimeBlocks: await timeBlocks,
            studySessionHistory: await history,
            notifications: await notifications
        )
    }

    private func fetch<Value: Sendable>(
        _ operation: @escaping @Sendable () async throws -> Value
    ) async -> Value? {
        do { return try await operation() } catch { return nil }
    }
}

struct AccountHydrationResources: Sendable {
    let tasks: [ProductivityTask]?
    let lists: [TaskListModel]?
    let sections: [TaskSectionModel]?
    let tags: [TagModel]?
    let metadata: [TaskMetadataDTO]?
    let habits: [HabitModel]?
    let growth: GrowthOverviewDTO?
    let skills: [GrowthSkillDTO]?
    let attributes: [GrowthSkillDTO]?
    let rewards: [GrowthRewardDTO]?
    let inventory: [GrowthInventoryDTO]?
    let ledger: [GrowthLedgerDTO]?
    let decks: [DeckModel]?
    let cards: [String: [CardModel]?]
    let profile: GrowthProfileDTO?
    let presets: [String: [String: GrowthRewardRuleDTO]]?
    let taskRules: [GrowthEarningRuleDTO]?
    let habitRules: [GrowthEarningRuleDTO]?
    let rewardDefaults: [GrowthTaskRewardDefaultDTO]?
    let mappings: [GrowthAttributeMappingDTO]?
    var budgetCategories: [BudgetCategoryModel]? = nil
    var budgetPeriod: BudgetPeriodModel? = nil
    var budgetTransactions: [BudgetTransactionModel]? = nil
    var gymExercises: [ExerciseModel]? = nil
    var gymWorkouts: [WorkoutModel]? = nil
    var journalNotes: [JournalNoteModel]? = nil
    var journalTags: [JournalTagModel]? = nil
    var journalTemplates: [JournalTemplateModel]? = nil
}
