import Foundation
import iTuNetworking
import iTuOffline
import iTuDomain

public struct AccountHydrationResult: Sendable {
    public let snapshot: OfflineSnapshot
    public let taskPage: TaskPage?
    public let usagePreferences: UsagePreferences?
    public let habitPreferences: HabitPreferencesModel?
    public let habitTimeBlocks: [HabitTimeBlockModel]?
    public let studySessionHistory: [StudySessionHistoryItem]?
    public let notifications: [AppNotificationModel]?
    public let failedResources: [String]

    public init(
        snapshot: OfflineSnapshot,
        taskPage: TaskPage?,
        usagePreferences: UsagePreferences?,
        habitPreferences: HabitPreferencesModel?,
        habitTimeBlocks: [HabitTimeBlockModel]?,
        studySessionHistory: [StudySessionHistoryItem]?,
        notifications: [AppNotificationModel]?,
        failedResources: [String] = []
    ) {
        self.snapshot = snapshot
        self.taskPage = taskPage
        self.usagePreferences = usagePreferences
        self.habitPreferences = habitPreferences
        self.habitTimeBlocks = habitTimeBlocks
        self.studySessionHistory = studySessionHistory
        self.notifications = notifications
        self.failedResources = failedResources
    }
}

private actor HydrationFailureRecorder {
    private var resources = Set<String>()

    func record(_ resource: String) {
        resources.insert(resource)
    }

    func values() -> [String] {
        resources.sorted()
    }
}

/// Fetches account resources independently, then applies one local snapshot.
/// A failed resource is represented as `nil`; an empty successful response
/// remains authoritative and is applied as an empty collection.
public final class AccountHydrator: @unchecked Sendable {
    private let apiClient: APIClient
    private let offlineStore: OfflineStore
    private let isCurrent: @Sendable () async -> Bool

    public init(apiClient: APIClient, offlineStore: OfflineStore, isCurrent: @escaping @Sendable () async -> Bool = { true }) {
        self.apiClient = apiClient
        self.offlineStore = offlineStore
        self.isCurrent = isCurrent
    }

    public func hydrate() async throws -> AccountHydrationResult {
        let failures = HydrationFailureRecorder()
        async let tasks = fetch("tasks", recording: failures) { try await self.apiClient.fetchTaskPage() }
        async let lists = fetch("taskLists", recording: failures) { try await self.apiClient.fetchTaskLists() }
        async let sections = fetch("taskSections", recording: failures) { try await self.apiClient.fetchTaskSections() }
        async let tags = fetch("taskTags", recording: failures) { try await self.apiClient.fetchTaskTags() }
        async let habits = fetch("habits", recording: failures) { try await self.apiClient.fetchHabits() }
        async let timeBlocks = fetch("habitTimeBlocks", recording: failures) { try await self.apiClient.fetchHabitTimeBlocks() }
        async let growth = fetch("growthOverview", recording: failures) { try await self.apiClient.fetchGrowthOverview() }
        async let skills = fetch("growthSkills", recording: failures) { try await self.apiClient.fetchGrowthSkills() }
        async let attributes = fetch("growthAttributes", recording: failures) { try await self.apiClient.fetchGrowthAttributes() }
        async let rewards = fetch("growthRewards", recording: failures) { try await self.apiClient.fetchGrowthRewards() }
        async let inventory = fetch("growthInventory", recording: failures) { try await self.apiClient.fetchGrowthInventory() }
        async let ledger = fetch("growthLedger", recording: failures) { try await self.apiClient.fetchGrowthLedger() }
        async let decks = fetch("decks", recording: failures) { try await self.apiClient.fetchDecks() }
        async let history = fetch("studyHistory", recording: failures) { try await self.apiClient.fetchStudySessionHistory() }
        async let notifications = fetch("notifications", recording: failures) { try await self.apiClient.fetchNotifications() }
        async let profile = fetch("growthProfile", recording: failures) { try await self.apiClient.fetchGrowthProfile() }
        async let presets = fetch("growthRewardPresets", recording: failures) { try await self.apiClient.fetchGrowthRewardPresetSettings() }
        async let taskRules = fetch("taskRewardRules", recording: failures) { try await self.apiClient.fetchGrowthEarningRules(sourceType: .task) }
        async let habitRules = fetch("habitRewardRules", recording: failures) { try await self.apiClient.fetchGrowthEarningRules(sourceType: .habit) }
        async let rewardDefaults = fetch("taskRewardDefaults", recording: failures) { try await self.apiClient.fetchGrowthTaskRewardDefaults() }
        async let mappings = fetch("growthAttributeMappings", recording: failures) { try await self.apiClient.fetchGrowthAttributeMappings() }
        async let expenseCategories = fetch("budgetCategories", recording: failures) { try await self.apiClient.getBudgetCategories() }
        async let monthlyBudget = fetch("monthlyBudget", recording: failures) { try await self.apiClient.getMonthlyBudget(period: iTuCalendarSupport.monthString()) }
        async let expenses = fetch("expenses", recording: failures) { try await self.apiClient.getBudgetExpenses() }
        async let recurringExpenses = fetch("recurringExpenses", recording: failures) { try await self.apiClient.getRecurringExpenses() }
        async let gymExercises = fetch("gymExercises", recording: failures) { try await self.apiClient.getGymExercises() }
        async let gymRoutines = fetch("gymRoutines", recording: failures) { try await self.apiClient.getGymRoutines() }
        async let gymWorkouts = fetch("gymWorkouts", recording: failures) { try await self.apiClient.getGymWorkouts() }
        async let journalNotes = fetch("journalNotes", recording: failures) { try await self.apiClient.getJournalNotes() }
        async let journalTags = fetch("journalTags", recording: failures) { try await self.apiClient.getJournalTags() }
        async let journalTemplates = fetch("journalTemplates", recording: failures) { try await self.apiClient.getJournalTemplates() }
        async let preferences = fetch("preferences", recording: failures) { try await self.apiClient.fetchPreferences() }

        let fetchedDecks = await decks
        var cardsByDeck: [String: [CardModel]?] = [:]
        if let deckValues = fetchedDecks {
            await withTaskGroup(of: (String, [CardModel]?).self) { group in
                for deck in deckValues {
                    group.addTask { (deck.id, await self.fetch("cards.\(deck.id)", recording: failures) { try await self.apiClient.fetchCards(deckId: deck.id) }) }
                }
                for await (deckID, cards) in group { cardsByDeck[deckID] = cards }
            }
        }

        let fetchedTaskPage = await tasks
        var resource = AccountHydrationResources(
            tasks: fetchedTaskPage?.data, lists: await lists, sections: await sections, tags: await tags,
            metadata: fetchedTaskPage?.metadata, habits: await habits, growth: await growth, skills: await skills,
            attributes: await attributes, rewards: await rewards, inventory: await inventory,
            ledger: await ledger, decks: fetchedDecks, cards: cardsByDeck, profile: await profile,
            presets: await presets, taskRules: await taskRules, habitRules: await habitRules,
            rewardDefaults: await rewardDefaults, mappings: await mappings
        )
        resource.habitPreferences = await preferences?.habits
        resource.expenseCategories = await expenseCategories
        resource.monthlyBudgets = await monthlyBudget.map { [$0] }
        resource.expenses = await expenses
        resource.recurringExpenses = await recurringExpenses
        resource.gymExercises = await gymExercises
        resource.gymRoutines = await gymRoutines
        resource.gymWorkouts = await gymWorkouts
        resource.journalNotes = await journalNotes
        resource.journalTags = await journalTags
        resource.journalTemplates = await journalTemplates
        try Task.checkCancellation()
        guard await isCurrent() else { throw AccountHydrationError.superseded }
        let snapshot = try await offlineStore.applyHydration(resource)
        return AccountHydrationResult(
            snapshot: snapshot,
            taskPage: fetchedTaskPage,
            usagePreferences: await preferences?.usage,
            habitPreferences: await preferences?.habits,
            habitTimeBlocks: await timeBlocks,
            studySessionHistory: await history,
            notifications: await notifications,
            failedResources: await failures.values()
        )
    }

    private func fetch<Value: Sendable>(
        _ resource: String,
        recording failures: HydrationFailureRecorder,
        _ operation: @escaping @Sendable () async throws -> Value
    ) async -> Value? {
        do {
            return try await operation()
        } catch is CancellationError {
            return nil
        } catch {
            await failures.record(resource)
            return nil
        }
    }
}

typealias AccountHydrationResources = iTuOffline.OfflineHydrationResources


public enum AccountHydrationError: LocalizedError, Sendable {
    case superseded

    public var errorDescription: String? {
        switch self {
        case .superseded: "Account hydration was superseded by a newer account generation"
        }
    }
}
