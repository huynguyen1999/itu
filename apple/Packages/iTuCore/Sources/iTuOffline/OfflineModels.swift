import Foundation
import iTuDomain

public enum OutboxEvent: Sendable {
    case enqueued(urgent: Bool)
}

public struct SyncMutation: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let kind: String
    public let entityId: String
    public var baseVersion: Int?
    public var baseValues: [String: JSONValue]?
    public var payload: [String: JSONValue]
    /// Per-field client edit clocks used by the server's granular merge.
    /// Kept optional for backwards-compatible snapshots and non-edit mutations.
    public var fieldEditedAt: [String: String]?
    public var occurredAt: String
    public var attemptCount: Int?
    public var lastAttemptAt: String?
    public var nextRetryAt: String?
    public var lastErrorCode: String?

    public init(
        id: String,
        kind: String,
        entityId: String,
        baseVersion: Int? = nil,
        baseValues: [String: JSONValue]? = nil,
        payload: [String: JSONValue],
        fieldEditedAt: [String: String]? = nil,
        occurredAt: String,
        attemptCount: Int? = nil,
        lastAttemptAt: String? = nil,
        nextRetryAt: String? = nil,
        lastErrorCode: String? = nil
    ) {
        self.id = id
        self.kind = kind
        self.entityId = entityId
        self.baseVersion = baseVersion
        self.baseValues = baseValues
        self.payload = payload
        self.fieldEditedAt = fieldEditedAt
        self.occurredAt = occurredAt
        self.attemptCount = attemptCount
        self.lastAttemptAt = lastAttemptAt
        self.nextRetryAt = nextRetryAt
        self.lastErrorCode = lastErrorCode
    }
}

public struct SyncConflict: Codable, Identifiable, Equatable, Sendable {
    public var id: String { mutationId }

    public let mutationId: String
    public let entityType: String
    public let entityId: String
    public let reason: String
    public let serverData: JSONValue?
    public var localDraft: [String: JSONValue]
    public var conflictingFields: [String]?
    public var kind: String?
    public var occurredAt: String?

    public init(
        mutationId: String,
        entityType: String,
        entityId: String,
        reason: String,
        serverData: JSONValue?,
        localDraft: [String: JSONValue],
        conflictingFields: [String]? = nil,
        kind: String? = nil,
        occurredAt: String? = nil
    ) {
        self.mutationId = mutationId
        self.entityType = entityType
        self.entityId = entityId
        self.reason = reason
        self.serverData = serverData
        self.localDraft = localDraft
        self.conflictingFields = conflictingFields
        self.kind = kind
        self.occurredAt = occurredAt
    }
}

public struct SyncMutationPayload: Codable, Sendable {
    public let id: String
    public let kind: String
    public let entityId: String
    public let baseVersion: Int?
    public let baseValues: [String: JSONValue]?
    public let payload: [String: JSONValue]
    public let fieldEditedAt: [String: String]?
    public let occurredAt: String

    public init(_ mutation: SyncMutation) {
        id = mutation.id
        kind = mutation.kind
        entityId = mutation.entityId
        baseVersion = mutation.baseVersion
        baseValues = mutation.baseValues
        payload = mutation.payload
        fieldEditedAt = mutation.fieldEditedAt
        occurredAt = mutation.occurredAt
    }
}

public struct SyncMutationOutcome: Codable, Equatable, Sendable, Identifiable {
    public var id: String { mutationId }
    public let mutationId: String
    public let growthReceipt: GrowthAwardReceipt?

    public init(mutationId: String, growthReceipt: GrowthAwardReceipt? = nil) {
        self.mutationId = mutationId
        self.growthReceipt = growthReceipt
    }
}

public struct SyncResult: Sendable {
    public let snapshot: OfflineSnapshot
    public let outcomes: [SyncMutationOutcome]
    public let conflicts: [SyncConflict]
    public let cursor: String
    public let changes: [SyncChange]

    public init(
        snapshot: OfflineSnapshot,
        outcomes: [SyncMutationOutcome],
        conflicts: [SyncConflict],
        cursor: String,
        changes: [SyncChange] = []
    ) {
        self.snapshot = snapshot
        self.outcomes = outcomes
        self.conflicts = conflicts
        self.cursor = cursor
        self.changes = changes
    }
}

public struct SyncRequest: Codable, Sendable {
    public let deviceId: String
    public let clientInstanceId: String
    public let cursor: String
    public let mutations: [SyncMutationPayload]

    public init(deviceId: String, clientInstanceId: String, cursor: String, mutations: [SyncMutationPayload]) {
        self.deviceId = deviceId
        self.clientInstanceId = clientInstanceId
        self.cursor = cursor
        self.mutations = mutations
    }
}

public struct SyncChange: Codable, Sendable {
    public let cursor: Int?
    public let entityType: String
    public let entityId: String
    public let deleted: Bool
    public let data: JSONValue?
    public let complete: Bool?

    public init(
        cursor: Int? = nil,
        entityType: String,
        entityId: String,
        deleted: Bool,
        data: JSONValue? = nil,
        complete: Bool? = nil
    ) {
        self.cursor = cursor
        self.entityType = entityType
        self.entityId = entityId
        self.deleted = deleted
        self.data = data
        self.complete = complete
    }
}

public struct SyncResponse: Codable, Sendable {
    public let acknowledgedMutationIds: [String]
    public let cursor: String
    public let lastSyncTime: String?
    public let changes: [SyncChange]
    public let conflicts: [SyncConflict]
    public let mutationOutcomes: [SyncMutationOutcome]?

    public init(
        acknowledgedMutationIds: [String],
        cursor: String,
        lastSyncTime: String? = nil,
        changes: [SyncChange],
        conflicts: [SyncConflict],
        mutationOutcomes: [SyncMutationOutcome]? = nil
    ) {
        self.acknowledgedMutationIds = acknowledgedMutationIds
        self.cursor = cursor
        self.lastSyncTime = lastSyncTime
        self.changes = changes
        self.conflicts = conflicts
        self.mutationOutcomes = mutationOutcomes
    }
}

public struct OfflineSnapshot: Codable, Equatable, Sendable {
    public var schemaVersion: Int = 2
    public var cursor = "0"
    public var tasks: [ProductivityTask] = []
    public var taskLists: [TaskListModel] = []
    public var sections: [TaskSectionModel] = []
    public var tags: [TagModel] = []
    public var tagIdsByTaskID: [String: [String]] = [:]
    public var focusSessions: [FocusSession] = []
    public var habits: [HabitModel] = []
    public var habitOccurrences: [HabitOccurrenceModel] = []
    public var habitPreferences: HabitPreferencesModel = HabitPreferencesModel()
    public var decks: [DeckModel] = []
    public var cardsByDeckId: [String: [CardModel]] = [:]
    public var growthLevel: Int?
    public var growthCurrentXp: Int?
    public var growthNextLevelXp: Int?
    public var growthProgressXp: Int?
    public var growthRequiredXp: Int?
    public var growthTaskRewardDefaults: [String: GrowthTaskRewardDefaultDTO] = [:]
    public var userCoins: Int = 0
    public var attributes: [UserAttribute] = []
    public var skills: [SkillNode] = []
    public var transactions: [LedgerTransaction] = []
    public var shopItems: [ShopItem] = []
    public var inventoryItems: [InventoryItem] = []
    public var growthProfile: GrowthProfileDTO?
    public var growthRewardPresets: [String: [String: GrowthRewardRuleDTO]] = [:]
    public var growthEarningRules: [String: GrowthEarningRuleDTO] = [:]
    public var growthAttributeMappings: [String: [GrowthAttributeMappingDTO]] = [:]
    public var pendingGrowthReceipts: [String: GrowthAwardReceipt] = [:]
    public var handledGrowthMutationIds: [String] = []
    public var handledGrowthReceiptKeys: [String] = []
    public var mutations: [SyncMutation] = []
    public var conflicts: [SyncConflict] = []
    public var lastSyncTime: String?
    public var usageSummaries: [UsageSummary] = []
    public var usageUploadWatermarks: [String: UsageUploadWatermark] = [:]
    public var usageAppIconUploadHashes: [String: String] = [:]
    public var websiteUsageSummaries: [WebsiteUsageSummary] = []
    public var websiteUsageUploadWatermarks: [String: Int] = [:]
    public var budgetDataEpoch: Int = 2
    public var expenseCategories: [ExpenseCategoryModel] = []
    public var monthlyBudgets: [MonthlyBudgetModel] = []
    public var expenses: [ExpenseModel] = []
    public var recurringExpenses: [RecurringExpenseModel] = []
    public var gymExercises: [ExerciseModel] = []
    public var gymRoutines: [RoutineModel] = []
    public var gymWorkouts: [WorkoutModel] = []
    public var budgetPreferences: BudgetPreferencesModel = BudgetPreferencesModel()
    public var gymPreferences: GymPreferencesModel = GymPreferencesModel()
    public var pendingGymExerciseImages: [String: Data] = [:]
    public var journalNotes: [JournalNoteModel] = []
    public var journalTags: [JournalTagModel] = []
    public var journalTemplates: [JournalTemplateModel] = []
    public var journalRevisionsByEntryID: [String: [JournalEntryRevisionModel]] = [:]
    public var journalPreferences: JournalPreferencesModel = JournalPreferencesModel()
    public var calendarPreferences: CalendarPreferencesModel = CalendarPreferencesModel()
    public var pendingJournalAttachments: [String: Data] = [:]
    public var pendingJournalAttachmentMetadata: [String: JournalPendingAttachment] = [:]
    public var healthDailySummaries: [HealthDailySummaryModel] = []
    public var healthWorkouts: [HealthWorkoutSummaryModel] = []
    public var healthImportState = HealthImportState()

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, cursor, tasks, taskLists, sections, tags, tagIdsByTaskID
        case focusSessions, habits, habitOccurrences, habitPreferences, decks, cardsByDeckId
        case growthLevel, growthCurrentXp, growthNextLevelXp, growthProgressXp, growthRequiredXp, growthTaskRewardDefaults
        case userCoins, attributes, skills, transactions, shopItems, inventoryItems, growthProfile
        case growthRewardPresets, growthEarningRules, growthAttributeMappings, pendingGrowthReceipts
        case handledGrowthMutationIds, handledGrowthReceiptKeys, mutations, conflicts, lastSyncTime
        case usageSummaries, usageUploadWatermarks, usageAppIconUploadHashes, websiteUsageSummaries, websiteUsageUploadWatermarks
        case budgetDataEpoch, expenseCategories, monthlyBudgets, expenses, recurringExpenses, gymExercises, gymRoutines, gymWorkouts, budgetPreferences, gymPreferences
        case pendingGymExerciseImages
        case journalNotes, journalTags, journalTemplates, journalRevisionsByEntryID, journalPreferences, pendingJournalAttachments, pendingJournalAttachmentMetadata
        case calendarPreferences
        case healthDailySummaries, healthWorkouts, healthImportState
    }

    public init() {}

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try values.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
        cursor = try values.decodeIfPresent(String.self, forKey: .cursor) ?? "0"
        tasks = try values.decodeIfPresent([ProductivityTask].self, forKey: .tasks) ?? []
        taskLists = try values.decodeIfPresent([TaskListModel].self, forKey: .taskLists) ?? []
        sections = try values.decodeIfPresent([TaskSectionModel].self, forKey: .sections) ?? []
        tags = try values.decodeIfPresent([TagModel].self, forKey: .tags) ?? []
        tagIdsByTaskID = try values.decodeIfPresent([String: [String]].self, forKey: .tagIdsByTaskID) ?? [:]
        focusSessions = try values.decodeIfPresent([FocusSession].self, forKey: .focusSessions) ?? []
        habits = try values.decodeIfPresent([HabitModel].self, forKey: .habits) ?? []
        habitOccurrences = try values.decodeIfPresent([HabitOccurrenceModel].self, forKey: .habitOccurrences) ?? []
        habitPreferences = try values.decodeIfPresent(HabitPreferencesModel.self, forKey: .habitPreferences) ?? HabitPreferencesModel()
        decks = try values.decodeIfPresent([DeckModel].self, forKey: .decks) ?? []
        cardsByDeckId = try values.decodeIfPresent([String: [CardModel]].self, forKey: .cardsByDeckId) ?? [:]
        growthLevel = try values.decodeIfPresent(Int.self, forKey: .growthLevel)
        growthCurrentXp = try values.decodeIfPresent(Int.self, forKey: .growthCurrentXp)
        growthNextLevelXp = try values.decodeIfPresent(Int.self, forKey: .growthNextLevelXp)
        growthProgressXp = try values.decodeIfPresent(Int.self, forKey: .growthProgressXp)
        growthRequiredXp = try values.decodeIfPresent(Int.self, forKey: .growthRequiredXp)
        growthTaskRewardDefaults = try values.decodeIfPresent([String: GrowthTaskRewardDefaultDTO].self, forKey: .growthTaskRewardDefaults) ?? [:]
        userCoins = try values.decodeIfPresent(Int.self, forKey: .userCoins) ?? 0
        attributes = try values.decodeIfPresent([UserAttribute].self, forKey: .attributes) ?? []
        skills = try values.decodeIfPresent([SkillNode].self, forKey: .skills) ?? []
        transactions = try values.decodeIfPresent([LedgerTransaction].self, forKey: .transactions) ?? []
        shopItems = try values.decodeIfPresent([ShopItem].self, forKey: .shopItems) ?? []
        inventoryItems = try values.decodeIfPresent([InventoryItem].self, forKey: .inventoryItems) ?? []
        growthProfile = try values.decodeIfPresent(GrowthProfileDTO.self, forKey: .growthProfile)
        growthRewardPresets = try values.decodeIfPresent([String: [String: GrowthRewardRuleDTO]].self, forKey: .growthRewardPresets) ?? [:]
        growthEarningRules = try values.decodeIfPresent([String: GrowthEarningRuleDTO].self, forKey: .growthEarningRules) ?? [:]
        growthAttributeMappings = try values.decodeIfPresent([String: [GrowthAttributeMappingDTO]].self, forKey: .growthAttributeMappings) ?? [:]
        pendingGrowthReceipts = try values.decodeIfPresent([String: GrowthAwardReceipt].self, forKey: .pendingGrowthReceipts) ?? [:]
        handledGrowthMutationIds = try values.decodeIfPresent([String].self, forKey: .handledGrowthMutationIds) ?? []
        handledGrowthReceiptKeys = try values.decodeIfPresent([String].self, forKey: .handledGrowthReceiptKeys) ?? []
        // Budget v2 epoch reset: never replay queued v1 mutations from an upgraded client.
        mutations = (try values.decodeIfPresent([SyncMutation].self, forKey: .mutations) ?? []).filter { mutation in
            !mutation.kind.hasPrefix("budgettransaction.") &&
            !mutation.kind.hasPrefix("moneycategory.") &&
            !mutation.kind.hasPrefix("moneybudgetperiod.") &&
            !mutation.kind.hasPrefix("moneycategorybudget.")
        }
        conflicts = try values.decodeIfPresent([SyncConflict].self, forKey: .conflicts) ?? []
        lastSyncTime = try values.decodeIfPresent(String.self, forKey: .lastSyncTime)
        usageSummaries = try values.decodeIfPresent([UsageSummary].self, forKey: .usageSummaries) ?? []
        usageUploadWatermarks = try values.decodeIfPresent([String: UsageUploadWatermark].self, forKey: .usageUploadWatermarks) ?? [:]
        usageAppIconUploadHashes = try values.decodeIfPresent([String: String].self, forKey: .usageAppIconUploadHashes) ?? [:]
        websiteUsageSummaries = try values.decodeIfPresent([WebsiteUsageSummary].self, forKey: .websiteUsageSummaries) ?? []
        websiteUsageUploadWatermarks = try values.decodeIfPresent([String: Int].self, forKey: .websiteUsageUploadWatermarks) ?? [:]
        budgetDataEpoch = try values.decodeIfPresent(Int.self, forKey: .budgetDataEpoch) ?? 1
        expenseCategories = try values.decodeIfPresent([ExpenseCategoryModel].self, forKey: .expenseCategories) ?? []
        monthlyBudgets = try values.decodeIfPresent([MonthlyBudgetModel].self, forKey: .monthlyBudgets) ?? []
        expenses = try values.decodeIfPresent([ExpenseModel].self, forKey: .expenses) ?? []
        recurringExpenses = try values.decodeIfPresent([RecurringExpenseModel].self, forKey: .recurringExpenses) ?? []
        gymExercises = try values.decodeIfPresent([ExerciseModel].self, forKey: .gymExercises) ?? []
        gymRoutines = try values.decodeIfPresent([RoutineModel].self, forKey: .gymRoutines) ?? []
        gymWorkouts = try values.decodeIfPresent([WorkoutModel].self, forKey: .gymWorkouts) ?? []
        budgetPreferences = try values.decodeIfPresent(BudgetPreferencesModel.self, forKey: .budgetPreferences) ?? BudgetPreferencesModel()
        gymPreferences = try values.decodeIfPresent(GymPreferencesModel.self, forKey: .gymPreferences) ?? GymPreferencesModel()
        pendingGymExerciseImages = try values.decodeIfPresent([String: Data].self, forKey: .pendingGymExerciseImages) ?? [:]
        journalNotes = try values.decodeIfPresent([JournalNoteModel].self, forKey: .journalNotes) ?? []
        journalTags = try values.decodeIfPresent([JournalTagModel].self, forKey: .journalTags) ?? []
        journalTemplates = try values.decodeIfPresent([JournalTemplateModel].self, forKey: .journalTemplates) ?? []
        journalRevisionsByEntryID = try values.decodeIfPresent([String: [JournalEntryRevisionModel]].self, forKey: .journalRevisionsByEntryID) ?? [:]
        journalPreferences = try values.decodeIfPresent(JournalPreferencesModel.self, forKey: .journalPreferences) ?? JournalPreferencesModel()
        calendarPreferences = try values.decodeIfPresent(CalendarPreferencesModel.self, forKey: .calendarPreferences) ?? CalendarPreferencesModel()
        pendingJournalAttachments = try values.decodeIfPresent([String: Data].self, forKey: .pendingJournalAttachments) ?? [:]
        pendingJournalAttachmentMetadata = try values.decodeIfPresent([String: JournalPendingAttachment].self, forKey: .pendingJournalAttachmentMetadata) ?? [:]
        healthDailySummaries = try values.decodeIfPresent([HealthDailySummaryModel].self, forKey: .healthDailySummaries) ?? []
        healthWorkouts = try values.decodeIfPresent([HealthWorkoutSummaryModel].self, forKey: .healthWorkouts) ?? []
        healthImportState = try values.decodeIfPresent(HealthImportState.self, forKey: .healthImportState) ?? HealthImportState()
    }
}
