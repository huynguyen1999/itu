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

private struct GrowthHydrationResources: Sendable {
    var overview: GrowthOverviewDTO?
    var skills: [GrowthSkillDTO]?
    var attributes: [GrowthSkillDTO]?
    var rewards: [GrowthRewardDTO]?
    var inventory: [GrowthInventoryDTO]?
    var ledger: [GrowthLedgerDTO]?
    var profile: GrowthProfileDTO?
    var presets: [String: [String: GrowthRewardRuleDTO]]?
    var taskRules: [GrowthEarningRuleDTO]?
    var habitRules: [GrowthEarningRuleDTO]?
    var rewardDefaults: [GrowthTaskRewardDefaultDTO]?
    var mappings: [GrowthAttributeMappingDTO]?
}

private struct BudgetHydrationResources: Sendable {
    var categories: [ExpenseCategoryModel]?
    var monthlyBudgets: [MonthlyBudgetModel]?
    var expenses: [ExpenseModel]?
    var recurringExpenses: [RecurringExpenseModel]?
}

private struct GymHydrationResources: Sendable {
    var exercises: [ExerciseModel]?
    var routines: [RoutineModel]?
    var workouts: [WorkoutModel]?
}

private struct JournalHydrationResources: Sendable {
    var notes: [JournalNoteModel]?
    var tags: [JournalTagModel]?
    var templates: [JournalTemplateModel]?
}

private struct AuxiliaryHydrationResources: Sendable {
    var history: [StudySessionHistoryItem]?
    var notifications: [AppNotificationModel]?
    var usagePreferences: UsagePreferences?
    var habitPreferences: HabitPreferencesModel?
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

        async let taskGroup = fetchTaskResources(failures: failures)
        async let growthGroup = fetchGrowthResources(failures: failures)
        async let deckGroup = fetchDeckResources(failures: failures)
        async let budgetGroup = fetchBudgetResources(failures: failures)
        async let gymGroup = fetchGymResources(failures: failures)
        async let journalGroup = fetchJournalResources(failures: failures)
        async let habitGroup = fetchHabitResources(failures: failures)
        async let auxGroup = fetchAuxiliaryResources(failures: failures)

        let (tasks, lists, sections, tags) = try await taskGroup
        let growth = try await growthGroup
        let (decks, cards) = try await deckGroup
        let budget = try await budgetGroup
        let gym = try await gymGroup
        let journal = try await journalGroup
        let (habits, timeBlocks) = try await habitGroup
        let aux = try await auxGroup

        var resource = AccountHydrationResources(
            tasks: tasks?.data,
            lists: lists,
            sections: sections,
            tags: tags,
            metadata: tasks?.metadata,
            habits: habits,
            growth: growth.overview,
            skills: growth.skills,
            attributes: growth.attributes,
            rewards: growth.rewards,
            inventory: growth.inventory,
            ledger: growth.ledger,
            decks: decks,
            cards: cards,
            profile: growth.profile,
            presets: growth.presets,
            taskRules: growth.taskRules,
            habitRules: growth.habitRules,
            rewardDefaults: growth.rewardDefaults,
            mappings: growth.mappings
        )

        resource.habitPreferences = aux.habitPreferences
        resource.expenseCategories = budget.categories
        resource.monthlyBudgets = budget.monthlyBudgets
        resource.expenses = budget.expenses
        resource.recurringExpenses = budget.recurringExpenses
        resource.gymExercises = gym.exercises
        resource.gymRoutines = gym.routines
        resource.gymWorkouts = gym.workouts
        resource.journalNotes = journal.notes
        resource.journalTags = journal.tags
        resource.journalTemplates = journal.templates

        try Task.checkCancellation()
        guard await isCurrent() else { throw AccountHydrationError.superseded }
        let snapshot = try await offlineStore.applyHydration(resource)
        let failedResources = await failures.values()

        return AccountHydrationResult(
            snapshot: snapshot,
            taskPage: tasks,
            usagePreferences: aux.usagePreferences,
            habitPreferences: aux.habitPreferences,
            habitTimeBlocks: timeBlocks,
            studySessionHistory: aux.history,
            notifications: aux.notifications,
            failedResources: failedResources
        )
    }

    private func fetchTaskResources(failures: HydrationFailureRecorder) async throws -> (TaskPage?, [TaskListModel]?, [TaskSectionModel]?, [TagModel]?) {
        async let tasks = fetch("tasks", recording: failures) { try await self.apiClient.fetchTaskPage() }
        async let lists = fetch("taskLists", recording: failures) { try await self.apiClient.fetchTaskLists() }
        async let sections = fetch("taskSections", recording: failures) { try await self.apiClient.fetchTaskSections() }
        async let tags = fetch("taskTags", recording: failures) { try await self.apiClient.fetchTaskTags() }
        return (try await tasks, try await lists, try await sections, try await tags)
    }

    private func fetchGrowthResources(failures: HydrationFailureRecorder) async throws -> GrowthHydrationResources {
        async let overview = fetch("growthOverview", recording: failures) { try await self.apiClient.fetchGrowthOverview() }
        async let skills = fetch("growthSkills", recording: failures) { try await self.apiClient.fetchGrowthSkills() }
        async let attributes = fetch("growthAttributes", recording: failures) { try await self.apiClient.fetchGrowthAttributes() }
        async let rewards = fetch("growthRewards", recording: failures) { try await self.apiClient.fetchGrowthRewards() }
        async let inventory = fetch("growthInventory", recording: failures) { try await self.apiClient.fetchGrowthInventory() }
        async let ledger = fetch("growthLedger", recording: failures) { try await self.apiClient.fetchGrowthLedger() }
        async let profile = fetch("growthProfile", recording: failures) { try await self.apiClient.fetchGrowthProfile() }
        async let presets = fetch("growthRewardPresets", recording: failures) { try await self.apiClient.fetchGrowthRewardPresetSettings() }
        async let taskRules = fetch("taskRewardRules", recording: failures) { try await self.apiClient.fetchGrowthEarningRules(sourceType: .task) }
        async let habitRules = fetch("habitRewardRules", recording: failures) { try await self.apiClient.fetchGrowthEarningRules(sourceType: .habit) }
        async let rewardDefaults = fetch("taskRewardDefaults", recording: failures) { try await self.apiClient.fetchGrowthTaskRewardDefaults() }
        async let mappings = fetch("growthAttributeMappings", recording: failures) { try await self.apiClient.fetchGrowthAttributeMappings() }

        let fetchedOverview = try await overview
        let fetchedSkills = try await skills
        let fetchedAttributes = try await attributes
        let fetchedRewards = try await rewards
        let fetchedInventory = try await inventory
        let fetchedLedger = try await ledger
        let fetchedProfile = try await profile
        let fetchedPresets = try await presets
        let fetchedTaskRules = try await taskRules
        let fetchedHabitRules = try await habitRules
        let fetchedRewardDefaults = try await rewardDefaults
        let fetchedMappings = try await mappings

        return GrowthHydrationResources(
            overview: fetchedOverview,
            skills: fetchedSkills,
            attributes: fetchedAttributes,
            rewards: fetchedRewards,
            inventory: fetchedInventory,
            ledger: fetchedLedger,
            profile: fetchedProfile,
            presets: fetchedPresets,
            taskRules: fetchedTaskRules,
            habitRules: fetchedHabitRules,
            rewardDefaults: fetchedRewardDefaults,
            mappings: fetchedMappings
        )
    }

    private func fetchDeckResources(failures: HydrationFailureRecorder) async throws -> ([DeckModel]?, [String: [CardModel]?]) {
        let fetchedDecks = try await fetch("decks", recording: failures) { try await self.apiClient.fetchDecks() }
        var cardsByDeck: [String: [CardModel]?] = [:]
        if let deckValues = fetchedDecks {
            try await withThrowingTaskGroup(of: (String, [CardModel]?).self) { group in
                for deck in deckValues {
                    group.addTask {
                        let cards = try await self.fetch("cards.\(deck.id)", recording: failures) {
                            try await self.apiClient.fetchCards(deckId: deck.id)
                        }
                        return (deck.id, cards)
                    }
                }
                for try await (deckID, cards) in group {
                    cardsByDeck[deckID] = cards
                }
            }
        }
        return (fetchedDecks, cardsByDeck)
    }

    private func fetchBudgetResources(failures: HydrationFailureRecorder) async throws -> BudgetHydrationResources {
        async let categories = fetch("budgetCategories", recording: failures) { try await self.apiClient.getBudgetCategories() }
        async let monthlyBudget = fetch("monthlyBudget", recording: failures) { try await self.apiClient.getMonthlyBudget(period: iTuCalendarSupport.monthString()) }
        async let expenses = fetch("expenses", recording: failures) { try await self.apiClient.getBudgetExpenses() }
        async let recurringExpenses = fetch("recurringExpenses", recording: failures) { try await self.apiClient.getRecurringExpenses() }

        let fetchedCategories = try await categories
        let fetchedMonthlyBudget = try await monthlyBudget
        let fetchedExpenses = try await expenses
        let fetchedRecurringExpenses = try await recurringExpenses

        return BudgetHydrationResources(
            categories: fetchedCategories,
            monthlyBudgets: fetchedMonthlyBudget.map { [$0] },
            expenses: fetchedExpenses,
            recurringExpenses: fetchedRecurringExpenses
        )
    }

    private func fetchGymResources(failures: HydrationFailureRecorder) async throws -> GymHydrationResources {
        async let exercises = fetch("gymExercises", recording: failures) { try await self.apiClient.getGymExercises() }
        async let routines = fetch("gymRoutines", recording: failures) { try await self.apiClient.getGymRoutines() }
        async let workouts = fetch("gymWorkouts", recording: failures) { try await self.apiClient.getGymWorkouts() }

        let fetchedExercises = try await exercises
        let fetchedRoutines = try await routines
        let fetchedWorkouts = try await workouts

        return GymHydrationResources(
            exercises: fetchedExercises,
            routines: fetchedRoutines,
            workouts: fetchedWorkouts
        )
    }

    private func fetchJournalResources(failures: HydrationFailureRecorder) async throws -> JournalHydrationResources {
        async let notes = fetch("journalNotes", recording: failures) { try await self.apiClient.getJournalNotes() }
        async let tags = fetch("journalTags", recording: failures) { try await self.apiClient.getJournalTags() }
        async let templates = fetch("journalTemplates", recording: failures) { try await self.apiClient.getJournalTemplates() }

        let fetchedNotes = try await notes
        let fetchedTags = try await tags
        let fetchedTemplates = try await templates

        return JournalHydrationResources(
            notes: fetchedNotes,
            tags: fetchedTags,
            templates: fetchedTemplates
        )
    }

    private func fetchHabitResources(failures: HydrationFailureRecorder) async throws -> ([HabitModel]?, [HabitTimeBlockModel]?) {
        async let habits = fetch("habits", recording: failures) { try await self.apiClient.fetchHabits() }
        async let timeBlocks = fetch("habitTimeBlocks", recording: failures) { try await self.apiClient.fetchHabitTimeBlocks() }
        return (try await habits, try await timeBlocks)
    }

    private func fetchAuxiliaryResources(failures: HydrationFailureRecorder) async throws -> AuxiliaryHydrationResources {
        async let history = fetch("studyHistory", recording: failures) { try await self.apiClient.fetchStudySessionHistory() }
        async let notifications = fetch("notifications", recording: failures) { try await self.apiClient.fetchNotifications() }
        async let preferences = fetch("preferences", recording: failures) { try await self.apiClient.fetchPreferences() }

        let fetchedHistory = try await history
        let fetchedNotifications = try await notifications
        let fetchedPreferences = try await preferences

        return AuxiliaryHydrationResources(
            history: fetchedHistory,
            notifications: fetchedNotifications,
            usagePreferences: fetchedPreferences?.usage,
            habitPreferences: fetchedPreferences?.habits
        )
    }

    private func fetch<Value: Sendable>(
        _ resource: String,
        recording failures: HydrationFailureRecorder,
        _ operation: @escaping @Sendable () async throws -> Value
    ) async throws -> Value? {
        do {
            return try await operation()
        } catch is CancellationError {
            return nil
        } catch let error as APIError where error.isTerminalAuthFailure {
            throw error
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
