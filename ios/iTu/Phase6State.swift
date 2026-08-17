import Foundation
import iTuDomain
import iTuOffline
import iTuSync

enum IOSRemoteResourceState: Equatable, Sendable {
    case idle
    case loading
    case loaded
    case failed(String)

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    var errorMessage: String? {
        if case let .failed(message) = self { return message }
        return nil
    }
}

/// The portable account snapshot exposed to iOS feature views.
/// REST-only resources remain separate so an empty value is never mistaken for
/// an offline cache.
struct IOSPhase6State {
    var taskLists: [TaskListModel] = []
    var sections: [TaskSectionModel] = []
    var tags: [TagModel] = []
    var tagIdsByTaskID: [String: [String]] = [:]

    var decks: [DeckModel] = []
    var cardsByDeckID: [String: [CardModel]] = [:]
    var studySessionHistory: [StudySessionHistoryItem] = []

    var expenseCategories: [ExpenseCategoryModel] = []
    var monthlyBudgets: [MonthlyBudgetModel] = []
    var expenses: [ExpenseModel] = []
    var recurringExpenses: [RecurringExpenseModel] = []
    var budgetPreferences = BudgetPreferencesModel()

    var gymRoutines: [RoutineModel] = []
    var gymExercises: [ExerciseModel] = []
    var gymWorkouts: [WorkoutModel] = []
    var gymPreferences = GymPreferencesModel()

    var userCoins = 0
    var growthLevel: Int?
    var growthCurrentXp: Int?
    var growthNextLevelXp: Int?
    var growthProgressXp: Int?
    var growthRequiredXp: Int?
    var growthProfile: GrowthProfileDTO?
    var attributes: [UserAttribute] = []
    var skills: [SkillNode] = []
    var shopItems: [ShopItem] = []
    var inventoryItems: [InventoryItem] = []
    var transactions: [LedgerTransaction] = []
    var growthRewardPresets: [String: [String: GrowthRewardRuleDTO]] = [:]
    var growthTaskRewardDefaults: [String: GrowthTaskRewardDefaultDTO] = [:]
    var growthEarningRules: [String: GrowthEarningRuleDTO] = [:]
    var growthAttributeMappings: [String: [GrowthAttributeMappingDTO]] = [:]

    var journalTags: [JournalTagModel] = []
    var journalTemplates: [JournalTemplateModel] = []
    var journalRevisionsByEntryID: [String: [JournalEntryRevisionModel]] = [:]
    var journalPreferences = JournalPreferencesModel()
    var pendingJournalAttachments: [String: Data] = [:]
    var pendingJournalAttachmentMetadata: [String: JournalPendingAttachment] = [:]
    var calendarPreferences = CalendarPreferencesModel()

    var usageSummaries: [UsageSummary] = []
    var websiteUsageSummaries: [WebsiteUsageSummary] = []
    var usageStatistics: UsageStatistics?
    var websiteUsageStatistics: WebsiteUsageStatistics?
    var usageStatisticsState: IOSRemoteResourceState = .idle
    var websiteUsageStatisticsState: IOSRemoteResourceState = .idle
    var usageStatisticsIsLocalOnly = true
    var websiteUsageStatisticsIsLocalOnly = true
    var usagePreferences: UsagePreferences?
    var habitPreferences = HabitPreferencesModel()
    var habitTimeBlocks: [HabitTimeBlockModel] = []
    var healthDailySummaries: [HealthDailySummaryModel] = []
    var healthWorkouts: [HealthWorkoutSummaryModel] = []
    var healthImportState = HealthImportState()

    var notifications: [AppNotificationModel] = []
    var notificationsState: IOSRemoteResourceState = .idle
    var trashSnapshot: TrashSnapshotModel?
    var trashState: IOSRemoteResourceState = .idle
    var lastSyncTime: String?

    mutating func apply(_ snapshot: OfflineSnapshot) {
        taskLists = snapshot.taskLists
        sections = snapshot.sections
        tags = snapshot.tags
        tagIdsByTaskID = snapshot.tagIdsByTaskID

        decks = snapshot.decks
        cardsByDeckID = snapshot.cardsByDeckId

        expenseCategories = snapshot.expenseCategories
        monthlyBudgets = snapshot.monthlyBudgets
        expenses = snapshot.expenses
        recurringExpenses = snapshot.recurringExpenses
        budgetPreferences = snapshot.budgetPreferences

        gymRoutines = snapshot.gymRoutines
        gymExercises = snapshot.gymExercises
        gymWorkouts = snapshot.gymWorkouts
        gymPreferences = snapshot.gymPreferences

        userCoins = snapshot.userCoins
        growthLevel = snapshot.growthLevel
        growthCurrentXp = snapshot.growthCurrentXp
        growthNextLevelXp = snapshot.growthNextLevelXp
        growthProgressXp = snapshot.growthProgressXp
        growthRequiredXp = snapshot.growthRequiredXp
        growthProfile = snapshot.growthProfile
        attributes = snapshot.attributes
        skills = snapshot.skills
        shopItems = snapshot.shopItems
        inventoryItems = snapshot.inventoryItems
        transactions = snapshot.transactions
        growthRewardPresets = snapshot.growthRewardPresets
        growthTaskRewardDefaults = snapshot.growthTaskRewardDefaults
        growthEarningRules = snapshot.growthEarningRules
        growthAttributeMappings = snapshot.growthAttributeMappings

        journalTags = snapshot.journalTags
        journalTemplates = snapshot.journalTemplates
        journalRevisionsByEntryID = snapshot.journalRevisionsByEntryID
        journalPreferences = snapshot.journalPreferences
        pendingJournalAttachments = snapshot.pendingJournalAttachments
        pendingJournalAttachmentMetadata = snapshot.pendingJournalAttachmentMetadata
        calendarPreferences = snapshot.calendarPreferences

        usageSummaries = snapshot.usageSummaries
        websiteUsageSummaries = snapshot.websiteUsageSummaries
        if usageStatisticsIsLocalOnly {
            usageStatistics = UsageStatistics.aggregating(usageSummaries)
            usageStatisticsState = .loaded
        }
        if websiteUsageStatisticsIsLocalOnly {
            websiteUsageStatistics = WebsiteUsageStatistics.aggregating(websiteUsageSummaries)
            websiteUsageStatisticsState = .loaded
        }
        healthDailySummaries = snapshot.healthDailySummaries
        healthWorkouts = snapshot.healthWorkouts
        healthImportState = snapshot.healthImportState
        habitPreferences = snapshot.habitPreferences
        lastSyncTime = snapshot.lastSyncTime
    }
}

@MainActor
extension AppModel {
    var profile: UserProfile? { user }

    var taskLists: [TaskListModel] { phase6State.taskLists }
    var sections: [TaskSectionModel] { phase6State.sections }
    var tags: [TagModel] { phase6State.tags }
    var tagIdsByTaskID: [String: [String]] { phase6State.tagIdsByTaskID }

    var decks: [DeckModel] { phase6State.decks }
    var cardsByDeckID: [String: [CardModel]] { phase6State.cardsByDeckID }
    var cardsByDeckId: [String: [CardModel]] { phase6State.cardsByDeckID }
    var cards: [CardModel] { phase6State.cardsByDeckID.values.flatMap { $0 } }
    var studySessionHistory: [StudySessionHistoryItem] { phase6State.studySessionHistory }

    var expenseCategories: [ExpenseCategoryModel] { phase6State.expenseCategories }
    var monthlyBudgets: [MonthlyBudgetModel] { phase6State.monthlyBudgets }
    var expenses: [ExpenseModel] { phase6State.expenses }
    var recurringExpenses: [RecurringExpenseModel] { phase6State.recurringExpenses }
    var budgetPreferences: BudgetPreferencesModel { phase6State.budgetPreferences }

    var gymRoutines: [RoutineModel] { phase6State.gymRoutines }
    var gymExercises: [ExerciseModel] { phase6State.gymExercises }
    var gymWorkouts: [WorkoutModel] { phase6State.gymWorkouts }
    var gymWorkoutExercises: [WorkoutExerciseModel] {
        gymWorkouts.flatMap { $0.exercises ?? [] }
    }
    var gymSets: [WorkoutSetModel] {
        gymWorkoutExercises.flatMap { $0.sets ?? [] }
    }
    var gymPreferences: GymPreferencesModel { phase6State.gymPreferences }

    var userCoins: Int { phase6State.userCoins }
    var growthLevel: Int? { phase6State.growthLevel }
    var growthCurrentXp: Int? { phase6State.growthCurrentXp }
    var growthNextLevelXp: Int? { phase6State.growthNextLevelXp }
    var growthProgressXp: Int? { phase6State.growthProgressXp }
    var growthRequiredXp: Int? { phase6State.growthRequiredXp }
    var growthProfile: GrowthProfileDTO? { phase6State.growthProfile }
    var attributes: [UserAttribute] { phase6State.attributes }
    var skills: [SkillNode] { phase6State.skills }
    var shopItems: [ShopItem] { phase6State.shopItems }
    var inventoryItems: [InventoryItem] { phase6State.inventoryItems }
    var transactions: [LedgerTransaction] { phase6State.transactions }
    var growthRewardPresets: [String: [String: GrowthRewardRuleDTO]] { phase6State.growthRewardPresets }
    var growthTaskRewardDefaults: [String: GrowthTaskRewardDefaultDTO] { phase6State.growthTaskRewardDefaults }
    var growthEarningRules: [String: GrowthEarningRuleDTO] { phase6State.growthEarningRules }
    var growthAttributeMappings: [String: [GrowthAttributeMappingDTO]] { phase6State.growthAttributeMappings }

    var journalTags: [JournalTagModel] { phase6State.journalTags }
    var journalTemplates: [JournalTemplateModel] { phase6State.journalTemplates }
    var journalRevisionsByEntryID: [String: [JournalEntryRevisionModel]] { phase6State.journalRevisionsByEntryID }
    var journalPreferences: JournalPreferencesModel { phase6State.journalPreferences }
    var pendingJournalAttachments: [String: Data] { phase6State.pendingJournalAttachments }
    var pendingJournalAttachmentMetadata: [String: JournalPendingAttachment] { phase6State.pendingJournalAttachmentMetadata }
    var calendarPreferences: CalendarPreferencesModel { phase6State.calendarPreferences }

    var usageSummaries: [UsageSummary] { phase6State.usageSummaries }
    var websiteUsageSummaries: [WebsiteUsageSummary] { phase6State.websiteUsageSummaries }
    var usageStatistics: UsageStatistics? { phase6State.usageStatistics }
    var websiteUsageStatistics: WebsiteUsageStatistics? { phase6State.websiteUsageStatistics }
    var usageStatisticsState: IOSRemoteResourceState { phase6State.usageStatisticsState }
    var websiteUsageStatisticsState: IOSRemoteResourceState { phase6State.websiteUsageStatisticsState }
    var usageStatisticsIsLocalOnly: Bool { phase6State.usageStatisticsIsLocalOnly }
    var websiteUsageStatisticsIsLocalOnly: Bool { phase6State.websiteUsageStatisticsIsLocalOnly }
    var usagePreferences: UsagePreferences? { phase6State.usagePreferences }
    var habitPreferences: HabitPreferencesModel { phase6State.habitPreferences }
    var habitTimeBlocks: [HabitTimeBlockModel] { phase6State.habitTimeBlocks }
    var healthDailySummaries: [HealthDailySummaryModel] { phase6State.healthDailySummaries }
    var healthWorkouts: [HealthWorkoutSummaryModel] { phase6State.healthWorkouts }
    var healthImportState: HealthImportState { phase6State.healthImportState }

    var notifications: [AppNotificationModel] { phase6State.notifications }
    var notificationsState: IOSRemoteResourceState { phase6State.notificationsState }
    var notificationsLoading: Bool { phase6State.notificationsState.isLoading }
    var notificationsErrorMessage: String? { phase6State.notificationsState.errorMessage }
    var trashSnapshot: TrashSnapshotModel? { phase6State.trashSnapshot }
    var trashState: IOSRemoteResourceState { phase6State.trashState }
    var trashIsLoading: Bool { phase6State.trashState.isLoading }
    var trashErrorMessage: String? { phase6State.trashState.errorMessage }
    var lastSyncTime: String? { phase6State.lastSyncTime }

    var failedMutations: [SyncMutation] {
        pendingMutations.filter { $0.lastErrorCode != nil }
    }

    func applyPhase6Snapshot(_ snapshot: OfflineSnapshot) {
        phase6State.apply(snapshot)
    }

    func applyHydration(_ result: AccountHydrationResult) {
        applyPhase6Snapshot(result.snapshot)
        if let preferences = result.usagePreferences { phase6State.usagePreferences = preferences }
        if let preferences = result.habitPreferences { phase6State.habitPreferences = preferences }
        if let timeBlocks = result.habitTimeBlocks { phase6State.habitTimeBlocks = timeBlocks }
        if let history = result.studySessionHistory { phase6State.studySessionHistory = history }
        if let notifications = result.notifications {
            phase6State.notifications = notifications
            phase6State.notificationsState = .loaded
        } else {
            phase6State.notifications = []
            phase6State.notificationsState = .failed("Notifications are unavailable right now.")
        }
    }
}
