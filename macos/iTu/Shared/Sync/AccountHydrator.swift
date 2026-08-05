import Foundation

enum HydratedResource<Value: Sendable>: Sendable {
    case success(Value)
    case failure

    var value: Value? {
        guard case let .success(value) = self else { return nil }
        return value
    }
}

struct AccountHydrationResult: Sendable {
    let snapshot: OfflineSnapshot
    let habitTimeBlocks: HydratedResource<[HabitTimeBlockModel]>
    let studySessionHistory: HydratedResource<[StudySessionHistoryItem]>
    let notifications: HydratedResource<[AppNotificationModel]>
}

/// Fetches account resources independently, then applies one local snapshot.
/// A failed resource is represented as `.failure`; an empty successful response
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

        let fetchedDecks = await decks
        var cardsByDeck: [String: HydratedResource<[CardModel]>] = [:]
        if let deckValues = fetchedDecks.value {
            await withTaskGroup(of: (String, HydratedResource<[CardModel]>).self) { group in
                for deck in deckValues {
                    group.addTask { (deck.id, await self.fetch { try await self.apiClient.fetchCards(deckId: deck.id) }) }
                }
                for await (deckID, cards) in group { cardsByDeck[deckID] = cards }
            }
        }

        let resource = AccountHydrationResources(
            tasks: await tasks, lists: await lists, sections: await sections, tags: await tags,
            metadata: await metadata, habits: await habits, growth: await growth, skills: await skills,
            attributes: await attributes, rewards: await rewards, inventory: await inventory,
            ledger: await ledger, decks: fetchedDecks, cards: cardsByDeck, profile: await profile,
            presets: await presets, taskRules: await taskRules, habitRules: await habitRules,
            rewardDefaults: await rewardDefaults, mappings: await mappings
        )
        let snapshot = try await offlineStore.applyHydration(resource)
        return AccountHydrationResult(
            snapshot: snapshot,
            habitTimeBlocks: await timeBlocks,
            studySessionHistory: await history,
            notifications: await notifications
        )
    }

    private func fetch<Value: Sendable>(
        _ operation: @escaping @Sendable () async throws -> Value
    ) async -> HydratedResource<Value> {
        do { return .success(try await operation()) } catch { return .failure }
    }
}

struct AccountHydrationResources: Sendable {
    let tasks: HydratedResource<[ProductivityTask]>
    let lists: HydratedResource<[TaskListModel]>
    let sections: HydratedResource<[TaskSectionModel]>
    let tags: HydratedResource<[TagModel]>
    let metadata: HydratedResource<[TaskMetadataDTO]>
    let habits: HydratedResource<[HabitModel]>
    let growth: HydratedResource<GrowthOverviewDTO>
    let skills: HydratedResource<[GrowthSkillDTO]>
    let attributes: HydratedResource<[GrowthSkillDTO]>
    let rewards: HydratedResource<[GrowthRewardDTO]>
    let inventory: HydratedResource<[GrowthInventoryDTO]>
    let ledger: HydratedResource<[GrowthLedgerDTO]>
    let decks: HydratedResource<[DeckModel]>
    let cards: [String: HydratedResource<[CardModel]>]
    let profile: HydratedResource<GrowthProfileDTO>
    let presets: HydratedResource<[String: [String: GrowthRewardRuleDTO]]>
    let taskRules: HydratedResource<[GrowthEarningRuleDTO]>
    let habitRules: HydratedResource<[GrowthEarningRuleDTO]>
    let rewardDefaults: HydratedResource<[GrowthTaskRewardDefaultDTO]>
    let mappings: HydratedResource<[GrowthAttributeMappingDTO]>
}
