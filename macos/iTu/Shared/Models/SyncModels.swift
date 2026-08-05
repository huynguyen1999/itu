import Foundation

enum SyncPhase: String, Codable, Sendable {
    case offline
    case pending
    case syncing
    case upToDate
    case conflict
}

enum OutboxEvent: Sendable {
    case enqueued(urgent: Bool)
}

struct SyncMutation: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let kind: String
    let entityId: String
    var baseVersion: Int?
    var baseValues: [String: JSONValue]?
    var payload: [String: JSONValue]
    var occurredAt: String
    var attemptCount: Int?
    var lastAttemptAt: String?
    var nextRetryAt: String?
    var lastErrorCode: String?
}

struct SyncConflict: Codable, Identifiable, Equatable, Sendable {
    var id: String { mutationId }

    let mutationId: String
    let entityType: String
    let entityId: String
    let reason: String
    let serverData: JSONValue?
    var localDraft: [String: JSONValue]
    var conflictingFields: [String]?
    var kind: String?
    var occurredAt: String?
}

struct PushMutationsRequest: Codable, Sendable {
    let deviceId: String
    let clientInstanceId: String
    let mutations: [SyncMutationPayload]
}

struct SyncMutationPayload: Codable, Sendable {
    let id: String
    let kind: String
    let entityId: String
    let baseVersion: Int?
    let baseValues: [String: JSONValue]?
    let payload: [String: JSONValue]
    let occurredAt: String

    init(_ mutation: SyncMutation) {
        id = mutation.id
        kind = mutation.kind
        entityId = mutation.entityId
        baseVersion = mutation.baseVersion
        baseValues = mutation.baseValues
        payload = mutation.payload
        occurredAt = mutation.occurredAt
    }
}

struct PushMutationsResponse: Codable, Sendable {
    let acknowledgedMutationIds: [String]
    let conflicts: [SyncConflict]
    let latestServerCursor: String
    let mutationOutcomes: [SyncMutationOutcome]?

    init(
        acknowledgedMutationIds: [String],
        conflicts: [SyncConflict],
        latestServerCursor: String,
        mutationOutcomes: [SyncMutationOutcome]? = nil
    ) {
        self.acknowledgedMutationIds = acknowledgedMutationIds
        self.conflicts = conflicts
        self.latestServerCursor = latestServerCursor
        self.mutationOutcomes = mutationOutcomes
    }
}

struct SyncMutationOutcome: Codable, Equatable, Sendable, Identifiable {
    var id: String { mutationId }
    let mutationId: String
    let growthReceipt: GrowthAwardReceipt?
}

struct PresentedGrowthReceipt: Identifiable, Equatable, Sendable {
    let id: String
    let receipt: GrowthAwardReceipt
}

struct GrowthAwardReceipt: Codable, Equatable, Sendable {
    let sourceType: GrowthSourceType
    let sourceId: String
    let title: String
    let reverted: Bool?
    /// Stable lifecycle identifier supplied by the server/web client when a
    /// receipt is replayed. It is intentionally persisted with the receipt so
    /// a restart cannot enqueue a second presentation for the same award.
    let receiptKey: String?
    let accountAward: GrowthAccountAward?
    let progressAwards: [GrowthProgressAward]
    let coinAward: GrowthCoinAward?
    let itemAwards: [GrowthItemAward]

    var isReversal: Bool { reverted == true }

    init(
        sourceType: GrowthSourceType,
        sourceId: String,
        title: String,
        reverted: Bool? = nil,
        accountAward: GrowthAccountAward? = nil,
        progressAwards: [GrowthProgressAward] = [],
        coinAward: GrowthCoinAward? = nil,
        itemAwards: [GrowthItemAward] = [],
        receiptKey: String? = nil
    ) {
        self.sourceType = sourceType
        self.sourceId = sourceId
        self.title = title
        self.reverted = reverted
        self.receiptKey = receiptKey
        self.accountAward = accountAward
        self.progressAwards = progressAwards
        self.coinAward = coinAward
        self.itemAwards = itemAwards
    }

    private enum CodingKeys: String, CodingKey {
        case sourceType, sourceId, title, reverted, reversed, receiptKey
        case accountAward, progressAwards, coinAward, itemAwards
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        sourceType = try values.decode(GrowthSourceType.self, forKey: .sourceType)
        sourceId = try values.decode(String.self, forKey: .sourceId)
        title = try values.decode(String.self, forKey: .title)
        reverted = try values.decodeIfPresent(Bool.self, forKey: .reverted)
            ?? values.decodeIfPresent(Bool.self, forKey: .reversed)
        receiptKey = try values.decodeIfPresent(String.self, forKey: .receiptKey)
        accountAward = try values.decodeIfPresent(GrowthAccountAward.self, forKey: .accountAward)
        progressAwards = try values.decodeIfPresent([GrowthProgressAward].self, forKey: .progressAwards) ?? []
        coinAward = try values.decodeIfPresent(GrowthCoinAward.self, forKey: .coinAward)
        itemAwards = try values.decodeIfPresent([GrowthItemAward].self, forKey: .itemAwards) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(sourceType, forKey: .sourceType)
        try values.encode(sourceId, forKey: .sourceId)
        try values.encode(title, forKey: .title)
        try values.encodeIfPresent(reverted, forKey: .reverted)
        try values.encodeIfPresent(receiptKey, forKey: .receiptKey)
        try values.encodeIfPresent(accountAward, forKey: .accountAward)
        try values.encode(progressAwards, forKey: .progressAwards)
        try values.encodeIfPresent(coinAward, forKey: .coinAward)
        try values.encode(itemAwards, forKey: .itemAwards)
    }
}

struct GrowthAccountAward: Codable, Equatable, Sendable {
    let amount: Int
    let beforeXp: Int
    let afterXp: Int
    let beforeLevel: Int
    let afterLevel: Int
    let nextLevelXp: Int
}

struct GrowthProgressAward: Codable, Equatable, Sendable, Identifiable {
    var id: String { progressId }
    let progressId: String
    let name: String
    let kind: String
    let icon: String?
    let color: String?
    let xpGained: Int
    let beforeXp: Int
    let afterXp: Int
    let beforeLevel: Int
    let afterLevel: Int
    let nextLevelXp: Int
    let awardType: GrowthLedgerXPKind?
    let derivedFromSkillId: String?
    let mappingSnapshot: [GrowthMappingSnapshot]

    private enum CodingKeys: String, CodingKey {
        case progressId, name, kind, icon, color, xpGained, beforeXp, afterXp, beforeLevel, afterLevel, nextLevelXp,
             awardType, derivedFromSkillId, mappingSnapshot
    }

    init(
        progressId: String,
        name: String,
        kind: String,
        icon: String?,
        color: String?,
        xpGained: Int,
        beforeXp: Int,
        afterXp: Int,
        beforeLevel: Int,
        afterLevel: Int,
        nextLevelXp: Int,
        awardType: GrowthLedgerXPKind? = nil,
        derivedFromSkillId: String? = nil,
        mappingSnapshot: [GrowthMappingSnapshot] = []
    ) {
        self.progressId = progressId
        self.name = name
        self.kind = kind
        self.icon = icon
        self.color = color
        self.xpGained = xpGained
        self.beforeXp = beforeXp
        self.afterXp = afterXp
        self.beforeLevel = beforeLevel
        self.afterLevel = afterLevel
        self.nextLevelXp = nextLevelXp
        self.awardType = awardType
        self.derivedFromSkillId = derivedFromSkillId
        self.mappingSnapshot = mappingSnapshot
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        progressId = try values.decode(String.self, forKey: .progressId)
        name = try values.decode(String.self, forKey: .name)
        kind = try values.decode(String.self, forKey: .kind)
        icon = try values.decodeIfPresent(String.self, forKey: .icon)
        color = try values.decodeIfPresent(String.self, forKey: .color)
        xpGained = try values.decode(Int.self, forKey: .xpGained)
        beforeXp = try values.decode(Int.self, forKey: .beforeXp)
        afterXp = try values.decode(Int.self, forKey: .afterXp)
        beforeLevel = try values.decode(Int.self, forKey: .beforeLevel)
        afterLevel = try values.decode(Int.self, forKey: .afterLevel)
        nextLevelXp = try values.decode(Int.self, forKey: .nextLevelXp)
        awardType = try? values.decode(GrowthLedgerXPKind.self, forKey: .awardType)
        derivedFromSkillId = try values.decodeIfPresent(String.self, forKey: .derivedFromSkillId)
        mappingSnapshot = try values.decodeIfPresent([GrowthMappingSnapshot].self, forKey: .mappingSnapshot) ?? []
    }
}

struct GrowthCoinAward: Codable, Equatable, Sendable {
    let amount: Int
    let balanceAfter: Int
}

struct GrowthItemAward: Codable, Equatable, Sendable, Identifiable {
    var id: String { itemId }
    let itemId: String
    let name: String
    let icon: String?
    let color: String?
    let quantity: Int
    let inventoryQuantityAfter: Int
}

struct SyncResult: Sendable {
    let snapshot: OfflineSnapshot
    let outcomes: [SyncMutationOutcome]
    let conflicts: [SyncConflict]
    let cursor: String
}

struct PullChangesResponse: Codable, Sendable {
    let cursor: String
    let lastSyncTime: String?
    let changes: [SyncChange]
}

struct SyncChange: Codable, Sendable {
    let cursor: Int
    let resourceType: String
    let resourceId: String
    let operation: String
    let resource: JSONValue?
    let complete: Bool
}

struct UnifiedSyncRequest: Codable, Sendable {
    let deviceId: String
    let clientInstanceId: String
    let cursor: String
    let mutations: [SyncMutationPayload]
}

struct UnifiedSyncChange: Codable, Sendable {
    let cursor: Int?
    let entityType: String
    let entityId: String
    let deleted: Bool
    let data: JSONValue?
    let complete: Bool?
}

struct UnifiedSyncResponse: Codable, Sendable {
    let acknowledgedMutationIds: [String]
    let cursor: String
    let lastSyncTime: String?
    let changes: [UnifiedSyncChange]
    let conflicts: [SyncConflict]
    let mutationOutcomes: [SyncMutationOutcome]?
}

struct OfflineSnapshot: Codable, Equatable, Sendable {
    var cursor = "0"
    var tasks: [ProductivityTask] = []
    var taskLists: [TaskListModel] = []
    var sections: [TaskSectionModel] = []
    var tags: [TagModel] = []
    var tagIdsByTaskID: [String: [String]] = [:]
    var focusSessions: [FocusSession] = []
    var habits: [HabitModel] = []
    var habitOccurrences: [HabitOccurrenceModel] = []
    var decks: [DeckModel] = []
    var cardsByDeckId: [String: [CardModel]] = [:]
    var growthLevel: Int?
    var growthCurrentXp: Int?
    var growthNextLevelXp: Int?
    var growthProgressXp: Int?
    var growthRequiredXp: Int?
    var growthTaskRewardDefaults: [String: GrowthTaskRewardDefaultDTO] = [:]
    var userCoins: Int = 0
    var attributes: [UserAttribute] = []
    var skills: [SkillNode] = []
    var transactions: [LedgerTransaction] = []
    var shopItems: [ShopItem] = []
    var inventoryItems: [InventoryItem] = []
    var growthProfile: GrowthProfileDTO?
    var growthRewardPresets: [String: [String: GrowthRewardRuleDTO]] = [:]
    var growthEarningRules: [String: GrowthEarningRuleDTO] = [:]
    var growthAttributeMappings: [String: [GrowthAttributeMappingDTO]] = [:]
    var pendingGrowthReceipts: [String: GrowthAwardReceipt] = [:]
    var handledGrowthMutationIds: [String] = []
    var handledGrowthReceiptKeys: [String] = []
    var mutations: [SyncMutation] = []
    var conflicts: [SyncConflict] = []
    var lastSyncTime: String?

    private enum CodingKeys: String, CodingKey {
        case cursor
        case tasks
        case taskLists
        case sections
        case tags
        case tagIdsByTaskID
        case focusSessions
        case habits
        case habitOccurrences
        case decks
        case cardsByDeckId
        case growthLevel
        case growthCurrentXp
        case growthNextLevelXp
        case growthProgressXp
        case growthRequiredXp
        case growthTaskRewardDefaults
        case userCoins
        case attributes
        case skills
        case transactions
        case shopItems
        case inventoryItems
        case growthProfile
        case growthRewardPresets
        case growthEarningRules
        case growthAttributeMappings
        case pendingGrowthReceipts
        case handledGrowthMutationIds
        case handledGrowthReceiptKeys
        case mutations
        case conflicts
        case lastSyncTime
    }

    init() {}

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        cursor = try values.decodeIfPresent(String.self, forKey: .cursor) ?? "0"
        tasks = try values.decodeIfPresent([ProductivityTask].self, forKey: .tasks) ?? []
        taskLists = try values.decodeIfPresent([TaskListModel].self, forKey: .taskLists) ?? []
        sections = try values.decodeIfPresent([TaskSectionModel].self, forKey: .sections) ?? []
        tags = try values.decodeIfPresent([TagModel].self, forKey: .tags) ?? []
        tagIdsByTaskID = try values.decodeIfPresent([String: [String]].self, forKey: .tagIdsByTaskID) ?? [:]
        focusSessions = try values.decodeIfPresent([FocusSession].self, forKey: .focusSessions) ?? []
        habits = try values.decodeIfPresent([HabitModel].self, forKey: .habits) ?? []
        habitOccurrences = try values.decodeIfPresent([HabitOccurrenceModel].self, forKey: .habitOccurrences) ?? []
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
        mutations = try values.decodeIfPresent([SyncMutation].self, forKey: .mutations) ?? []
        conflicts = try values.decodeIfPresent([SyncConflict].self, forKey: .conflicts) ?? []
        lastSyncTime = try values.decodeIfPresent(String.self, forKey: .lastSyncTime)
    }
}
