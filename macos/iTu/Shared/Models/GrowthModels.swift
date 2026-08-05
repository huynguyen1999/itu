import Foundation

struct UserAttribute: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var name: String
    var level: Int
    var currentXP: Int
    var nextLevelXP: Int
    var progressXP: Int? = nil
    var requiredXP: Int? = nil
    var icon: String
    var color: String

    static func sampleAttributes() -> [UserAttribute] {
        [
            UserAttribute(id: "attr-focus", name: "Deep Focus", level: 3, currentXP: 450, nextLevelXP: 1000, icon: "timer", color: "mint"),
            UserAttribute(id: "attr-learning", name: "Knowledge", level: 4, currentXP: 820, nextLevelXP: 1200, icon: "book.closed", color: "amber"),
            UserAttribute(id: "attr-consistency", name: "Consistency", level: 2, currentXP: 310, nextLevelXP: 800, icon: "repeat", color: "teal"),
            UserAttribute(id: "attr-grit", name: "Grit", level: 5, currentXP: 1100, nextLevelXP: 1500, icon: "sparkles", color: "coral")
        ]
    }
}

enum GrowthAttributeMappingSlot: String, Codable, CaseIterable, Identifiable, Sendable {
    case primary = "PRIMARY"
    case secondary = "SECONDARY"

    var id: String { rawValue }
    var title: String { self == .primary ? "Primary" : "Secondary" }
}

struct GrowthAttributeMappingSkillRef: Codable, Equatable, Sendable {
    let id: String
    let name: String?
    let kind: String?
    let archivedAt: String?
}

struct GrowthAttributeMappingAttributeRef: Codable, Equatable, Sendable {
    let id: String
    let name: String?
    let kind: String?
    let icon: String?
    let color: String?
    let archivedAt: String?
}

struct GrowthAttributeMappingDTO: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let userId: String?
    let skillId: String
    let attributeId: String
    let slot: GrowthAttributeMappingSlot
    let weight: Int
    let skill: GrowthAttributeMappingSkillRef?
    let attribute: GrowthAttributeMappingAttributeRef?

    init(
        id: String,
        userId: String? = nil,
        skillId: String,
        attributeId: String,
        slot: GrowthAttributeMappingSlot,
        weight: Int,
        skill: GrowthAttributeMappingSkillRef? = nil,
        attribute: GrowthAttributeMappingAttributeRef? = nil
    ) {
        self.id = id
        self.userId = userId
        self.skillId = skillId
        self.attributeId = attributeId
        self.slot = slot
        self.weight = weight
        self.skill = skill
        self.attribute = attribute
    }
}

struct GrowthAttributeMappingDraft: Codable, Equatable, Sendable {
    var attributeId: String
    var slot: GrowthAttributeMappingSlot
    var weight: Int
}

struct GrowthAttributeMappingValidation: Equatable, Sendable {
    let valid: Bool
    let errors: [String]
}

enum GrowthAttributeMappingRules {
    static func validate(_ mappings: [GrowthAttributeMappingDraft]) -> GrowthAttributeMappingValidation {
        var errors: [String] = []
        let primary = mappings.filter { $0.slot == .primary }
        let secondary = mappings.filter { $0.slot == .secondary }
        if mappings.count < 1 || mappings.count > 2 {
            errors.append("Choose one primary attribute and at most one secondary attribute.")
        }
        if primary.count != 1 { errors.append("Exactly one primary attribute is required.") }
        if secondary.count > 1 { errors.append("Only one secondary attribute is allowed.") }
        if let value = primary.first?.weight, !(70...100).contains(value) {
            errors.append("Primary weight must be an integer from 70% to 100%.")
        }
        if let value = secondary.first?.weight, !(1...30).contains(value) {
            errors.append("Secondary weight must be an integer from 1% to 30%.")
        }
        if (Set(mappings.map(\.attributeId).filter { !$0.isEmpty }).count != mappings.filter { !$0.attributeId.isEmpty }.count) {
            errors.append("Primary and secondary attributes must be different.")
        }
        if mappings.reduce(0, { $0 + $1.weight }) != 100 {
            errors.append("Mapping weights must total 100%.")
        }
        if mappings.contains(where: { $0.attributeId.isEmpty }) {
            errors.append("Choose an attribute for every mapping.")
        }
        return GrowthAttributeMappingValidation(valid: errors.isEmpty, errors: errors)
    }

    static let primaryOnly: [GrowthAttributeMappingDraft] = [
        GrowthAttributeMappingDraft(attributeId: "", slot: .primary, weight: 100)
    ]
}

enum GrowthLedgerXPKind: String, Codable, Sendable {
    case skill = "SKILL"
    case attribute = "ATTRIBUTE"
    case derivedAttribute = "DERIVED_ATTRIBUTE"

    var label: String {
        switch self {
        case .skill: "Skill XP"
        case .attribute: "Attribute XP"
        case .derivedAttribute: "Derived Attribute XP"
        }
    }
}

struct GrowthMappingSnapshot: Codable, Equatable, Sendable {
    let mappingId: String
    let skillId: String
    let attributeId: String
    let slot: GrowthAttributeMappingSlot
    let weight: Int
}

struct SkillNode: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var name: String
    var description: String
    var level: Int
    var maxLevel: Int
    var icon: String
    var category: String
    var currentXP: Int? = nil
    var nextLevelXP: Int? = nil
    var progressXP: Int? = nil
    var requiredXP: Int? = nil
    var baseXp: Int? = nil
    var archivedAt: String? = nil

    static func sampleSkills() -> [SkillNode] {
        [
            SkillNode(id: "sk-1", name: "Pomodoro Master", description: "Increase focus XP bonus by 15%", level: 2, maxLevel: 5, icon: "timer", category: "Focus"),
            SkillNode(id: "sk-2", name: "Speed Reader", description: "Review flashcards 20% faster", level: 1, maxLevel: 3, icon: "book", category: "Learn"),
            SkillNode(id: "sk-3", name: "Streak Shield", description: "Protect habit streak once per week", level: 3, maxLevel: 3, icon: "shield.fill", category: "Habits")
        ]
    }
}

struct ShopItem: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var title: String
    var description: String
    var costCoins: Int
    var icon: String
    var category: String
    var isPurchased: Bool
    var repeatable: Bool = false
    var version: Int = 1
    var redemptionCount: Int = 0

    static func sampleItems() -> [ShopItem] {
        [
            ShopItem(id: "shop-1", title: "Coffee Break", description: "Enjoy a 30-minute guilt-free break", costCoins: 100, icon: "cup.and.saucer.fill", category: "Rewards", isPurchased: false),
            ShopItem(id: "shop-2", title: "Custom Theme Accent", description: "Unlock Forest Emerald color scheme", costCoins: 250, icon: "paintpalette.fill", category: "Cosmetics", isPurchased: true),
            ShopItem(id: "shop-3", title: "Weekend Pass", description: "Pause daily habit targets for Sunday", costCoins: 150, icon: "sun.max.fill", category: "Perks", isPurchased: false)
        ]
    }
}

struct InventoryItem: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var title: String
    var description: String
    var quantity: Int
    var icon: String
}

struct LedgerTransaction: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var title: String
    var amountXP: Int
    var amountCoins: Int
    var type: String
    var timestamp: String
    var amountAccountXP: Int = 0
    var amountSkillXP: Int = 0
    var amountAttributeXP: Int = 0
    var amountDerivedAttributeXP: Int = 0

    private enum CodingKeys: String, CodingKey {
        case id, title, amountXP, amountCoins, type, timestamp, amountAccountXP, amountSkillXP,
             amountAttributeXP, amountDerivedAttributeXP
    }

    init(id: String, title: String, amountXP: Int, amountCoins: Int, type: String, timestamp: String, amountAccountXP: Int = 0, amountSkillXP: Int = 0, amountAttributeXP: Int = 0, amountDerivedAttributeXP: Int = 0) {
        self.id = id
        self.title = title
        self.amountXP = amountXP
        self.amountCoins = amountCoins
        self.type = type
        self.timestamp = timestamp
        self.amountAccountXP = amountAccountXP
        self.amountSkillXP = amountSkillXP
        self.amountAttributeXP = amountAttributeXP
        self.amountDerivedAttributeXP = amountDerivedAttributeXP
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        title = try values.decode(String.self, forKey: .title)
        amountXP = try values.decodeIfPresent(Int.self, forKey: .amountXP) ?? 0
        amountCoins = try values.decodeIfPresent(Int.self, forKey: .amountCoins) ?? 0
        type = try values.decodeIfPresent(String.self, forKey: .type) ?? "Growth"
        timestamp = try values.decodeIfPresent(String.self, forKey: .timestamp) ?? ""
        amountAccountXP = try values.decodeIfPresent(Int.self, forKey: .amountAccountXP) ?? 0
        amountSkillXP = try values.decodeIfPresent(Int.self, forKey: .amountSkillXP) ?? 0
        amountAttributeXP = try values.decodeIfPresent(Int.self, forKey: .amountAttributeXP) ?? 0
        amountDerivedAttributeXP = try values.decodeIfPresent(Int.self, forKey: .amountDerivedAttributeXP) ?? 0
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(title, forKey: .title)
        try values.encode(amountXP, forKey: .amountXP)
        try values.encode(amountCoins, forKey: .amountCoins)
        try values.encode(type, forKey: .type)
        try values.encode(timestamp, forKey: .timestamp)
        try values.encode(amountAccountXP, forKey: .amountAccountXP)
        try values.encode(amountSkillXP, forKey: .amountSkillXP)
        try values.encode(amountAttributeXP, forKey: .amountAttributeXP)
        try values.encode(amountDerivedAttributeXP, forKey: .amountDerivedAttributeXP)
    }

    static func sampleTransactions() -> [LedgerTransaction] {
        let now = ISO8601DateFormatter().string(from: Date())
        return [
            LedgerTransaction(id: "tx-1", title: "Completed Focus Session (45m)", amountXP: 90, amountCoins: 45, type: "Focus", timestamp: now),
            LedgerTransaction(id: "tx-2", title: "Habit Check-in: Morning Meditation", amountXP: 30, amountCoins: 15, type: "Habit", timestamp: now),
            LedgerTransaction(id: "tx-3", title: "Completed Task: Review SwiftUI Architecture", amountXP: 50, amountCoins: 25, type: "Task", timestamp: now)
        ]
    }
}

struct GrowthAccountDTO: Codable, Sendable {
    let level: Int?
    let currentXp: Int?
    let nextLevelXp: Int?
    let coinBalance: Int?
    var levelStartXp: Int? = nil
    var progressXp: Int? = nil
    var requiredXp: Int? = nil
    var baseXp: Int? = nil
}

enum GrowthRewardPreset: String, Codable, CaseIterable, Identifiable, Sendable {
    case light = "LIGHT"
    case standard = "STANDARD"
    case strong = "STRONG"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .light: "Light"
        case .standard: "Standard"
        case .strong: "Strong"
        }
    }
}

enum GrowthSourceType: String, Codable, CaseIterable, Identifiable, Sendable {
    case task = "TASK"
    case habit = "HABIT"
    case focusPreset = "FOCUS_PRESET"
    case reviewDeck = "REVIEW_DECK"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .task: "Tasks"
        case .habit: "Habits"
        case .focusPreset: "Focus"
        case .reviewDeck: "Deck Reviews"
        }
    }
}

enum GrowthScalingMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case fixed = "FIXED"
    case linear = "LINEAR"

    var id: String { rawValue }
    var title: String { rawValue == "FIXED" ? "Fixed" : "Linear" }
}

struct GrowthEarningRuleSkillAwardDTO: Codable, Equatable, Sendable {
    let skillId: String
    let xpReward: Int
    let skill: GrowthSkillDTO?
}

struct GrowthEarningRuleItemDTO: Codable, Equatable, Sendable {
    let itemId: String
    let quantity: Int
    let item: GrowthAwardItemDTO?
}

struct GrowthAwardItemDTO: Codable, Equatable, Sendable {
    let id: String
    let name: String
    let icon: String?
    let color: String?
}

struct GrowthEarningRuleDTO: Codable, Equatable, Sendable {
    let id: String
    let sourceType: GrowthSourceType
    let sourceId: String
    let coinReward: Int
    let accountXp: Int
    let enabled: Bool
    let scalingMode: GrowthScalingMode
    let maxRewardCap: Int?
    let version: Int
    let skillAwards: [GrowthEarningRuleSkillAwardDTO]
    let itemAwards: [GrowthEarningRuleItemDTO]

    private enum CodingKeys: String, CodingKey {
        case id, sourceType, sourceId, coinReward, accountXp, enabled, scalingMode, maxRewardCap, version, skillAwards, itemAwards
    }

    init(
        id: String,
        sourceType: GrowthSourceType,
        sourceId: String,
        coinReward: Int,
        accountXp: Int = 0,
        enabled: Bool,
        scalingMode: GrowthScalingMode,
        maxRewardCap: Int?,
        version: Int,
        skillAwards: [GrowthEarningRuleSkillAwardDTO],
        itemAwards: [GrowthEarningRuleItemDTO]
    ) {
        self.id = id
        self.sourceType = sourceType
        self.sourceId = sourceId
        self.coinReward = coinReward
        self.accountXp = accountXp
        self.enabled = enabled
        self.scalingMode = scalingMode
        self.maxRewardCap = maxRewardCap
        self.version = version
        self.skillAwards = skillAwards
        self.itemAwards = itemAwards
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        sourceType = try values.decode(GrowthSourceType.self, forKey: .sourceType)
        sourceId = try values.decode(String.self, forKey: .sourceId)
        coinReward = try values.decodeIfPresent(Int.self, forKey: .coinReward) ?? 0
        let legacyAwards = try values.decodeIfPresent([GrowthEarningRuleSkillAwardDTO].self, forKey: .skillAwards) ?? []
        accountXp = try values.decodeIfPresent(Int.self, forKey: .accountXp) ?? legacyAwards.map(\.xpReward).max() ?? 0
        enabled = try values.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        scalingMode = try values.decodeIfPresent(GrowthScalingMode.self, forKey: .scalingMode) ?? .fixed
        maxRewardCap = try values.decodeIfPresent(Int.self, forKey: .maxRewardCap)
        version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1
        skillAwards = legacyAwards
        itemAwards = try values.decodeIfPresent([GrowthEarningRuleItemDTO].self, forKey: .itemAwards) ?? []
    }
}

struct GrowthRewardRuleDTO: Codable, Equatable, Sendable {
    var coinReward: Int
    var accountXp: Int
    var xpRewardPerSkill: Int
    var scalingMode: GrowthScalingMode
    var maxRewardCap: Int?

    init(coinReward: Int, accountXp: Int = 0, xpRewardPerSkill: Int, scalingMode: GrowthScalingMode, maxRewardCap: Int?) {
        self.coinReward = coinReward
        self.accountXp = accountXp
        self.xpRewardPerSkill = xpRewardPerSkill
        self.scalingMode = scalingMode
        self.maxRewardCap = maxRewardCap
    }

    private enum CodingKeys: String, CodingKey { case coinReward, accountXp, xpRewardPerSkill, scalingMode, maxRewardCap }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        coinReward = try values.decodeIfPresent(Int.self, forKey: .coinReward) ?? 0
        xpRewardPerSkill = try values.decodeIfPresent(Int.self, forKey: .xpRewardPerSkill) ?? 0
        accountXp = try values.decodeIfPresent(Int.self, forKey: .accountXp) ?? xpRewardPerSkill
        scalingMode = try values.decodeIfPresent(GrowthScalingMode.self, forKey: .scalingMode) ?? .fixed
        maxRewardCap = try values.decodeIfPresent(Int.self, forKey: .maxRewardCap)
    }
}

struct GrowthTaskRewardDefaultDTO: Codable, Equatable, Sendable {
    let id: String
    let taskListId: String?
    let coinReward: Int
    let accountXp: Int
    let enabled: Bool
    let skillAwards: [GrowthEarningRuleSkillAwardDTO]
    let itemAwards: [GrowthEarningRuleItemDTO]

    private enum CodingKeys: String, CodingKey { case id, taskListId, coinReward, accountXp, enabled, skillAwards, itemAwards }

    init(id: String, taskListId: String?, coinReward: Int, accountXp: Int, enabled: Bool, skillAwards: [GrowthEarningRuleSkillAwardDTO], itemAwards: [GrowthEarningRuleItemDTO]) {
        self.id = id
        self.taskListId = taskListId
        self.coinReward = coinReward
        self.accountXp = accountXp
        self.enabled = enabled
        self.skillAwards = skillAwards
        self.itemAwards = itemAwards
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        taskListId = try values.decodeIfPresent(String.self, forKey: .taskListId)
        coinReward = try values.decodeIfPresent(Int.self, forKey: .coinReward) ?? 0
        skillAwards = try values.decodeIfPresent([GrowthEarningRuleSkillAwardDTO].self, forKey: .skillAwards) ?? []
        accountXp = try values.decodeIfPresent(Int.self, forKey: .accountXp) ?? skillAwards.map(\.xpReward).max() ?? 0
        enabled = try values.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        itemAwards = try values.decodeIfPresent([GrowthEarningRuleItemDTO].self, forKey: .itemAwards) ?? []
    }
}

enum GrowthResetScope: String, Codable, CaseIterable, Identifiable, Sendable {
    case skill = "SKILL"
    case allXP = "ALL_XP"
    case full = "FULL"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .skill: "Single Skill"
        case .allXP: "All Skills XP"
        case .full: "Full Reset"
        }
    }
}

struct GrowthResetPreviewDTO: Codable, Equatable, Sendable {
    struct AffectedSkill: Codable, Equatable, Sendable, Identifiable {
        let id: String
        let name: String
        let xpToReset: Int
        let currentLevel: Int
        let newLevel: Int
    }

    let scope: GrowthResetScope
    let affectedSkills: [AffectedSkill]
    let coinBalanceToReset: Int?
}

struct GrowthProfileDTO: Codable, Equatable, Sendable {
    let id: String
    let userId: String
    var accountBaseXp: Int
    let activeCycleId: String
    let onboardingState: String
    var rewardPreset: GrowthRewardPreset
    let createdAt: String
    let updatedAt: String
}

struct GrowthSkillDTO: Codable, Equatable, Sendable {
    let id: String?
    let key: String?
    let name: String?
    let level: Int?
    let maxLevel: Int?
    let currentXp: Int?
    let nextLevelXp: Int?
    var levelStartXp: Int? = nil
    var progressXp: Int? = nil
    var requiredXp: Int? = nil
    let category: String?
    var kind: String? = nil
    let description: String?
    let icon: String?
    let color: String?
    let baseXp: Int?
    let version: Int?
    var archivedAt: String? = nil
    var starterKey: String? = nil
}

enum GrowthRewardMath {
    static func selectedAwards(_ awards: [GrowthEarningRuleSkillAwardDTO], archivedSkillIDs: Set<String> = []) -> [GrowthEarningRuleSkillAwardDTO] {
        awards
            .filter { $0.xpReward > 0 && !archivedSkillIDs.contains($0.skillId) && $0.skill?.archivedAt == nil }
            .sorted { $0.skillId < $1.skillId }
            .prefix(3)
            .map { $0 }
    }

    static func split(accountXp: Int, awards: [GrowthEarningRuleSkillAwardDTO], archivedSkillIDs: Set<String> = []) -> [Int] {
        let selected = selectedAwards(awards, archivedSkillIDs: archivedSkillIDs)
        let budget = max(0, accountXp)
        guard budget > 0, !selected.isEmpty else { return selected.map { _ in 0 } }
        let total = selected.reduce(0) { $0 + $1.xpReward }
        guard total > 0 else { return selected.map { _ in 0 } }
        let exact = selected.map { Double(budget * $0.xpReward) / Double(total) }
        var allocations = exact.map { Int(floor($0)) }
        var remainder = budget - allocations.reduce(0, +)
        var order: [(index: Int, fraction: Double, skillID: String)] = []
        for (index, value) in exact.enumerated() {
            order.append((index: index, fraction: value - floor(value), skillID: selected[index].skillId))
        }
        order.sort { left, right in
            left.fraction == right.fraction ? left.skillID < right.skillID : left.fraction > right.fraction
        }
        for item in order where remainder > 0 {
            allocations[item.index] += 1
            remainder -= 1
        }
        return allocations
    }
}

struct GrowthLedgerDTO: Codable, Sendable {
    let id: String
    let reason: String?
    let xpAmount: Int?
    let coinAmount: Int?
    let createdAt: String?
    let currency: String?
    let amount: Int?
    let kind: String?
    let sourceType: String?
    let titleSnapshot: String?
    var metadata: [String: JSONValue]? = nil
}

struct GrowthRewardDTO: Codable, Sendable {
    let id: String
    let name: String
    let description: String?
    let icon: String?
    let price: Int?
    let repeatable: Bool
    let version: Int
    let archivedAt: String?
    let listedInShop: Bool
    let _count: GrowthRedemptionCountDTO?
}

struct GrowthRedemptionCountDTO: Codable, Sendable {
    let redemptions: Int
}

struct GrowthInventoryDTO: Codable, Sendable {
    let item: GrowthRewardDTO
    let quantity: Int
}

struct GrowthOverviewDTO: Codable, Sendable {
    let account: GrowthAccountDTO?
    let skills: [GrowthSkillDTO]?
    let recentLedger: [GrowthLedgerDTO]?
}

struct StudyCalendarDayDTO: Codable, Equatable, Sendable {
    let date: String
    let sessions: Int
    let focusSessions: Int
    let reviews: Int
    let correct: Int
    let completedTasks: Int
    let focusedMinutes: Int
    let cardsCreated: Int
}

struct GrowthStatisticsTrendDTO: Codable, Equatable, Sendable {
    let date: String
    let xp: Int
}

struct GrowthStatisticsAttributeDTO: Codable, Equatable, Sendable {
    let skillId: String
    let name: String
    let icon: String
    let color: String
    let gained: Int
    let lost: Int
    let net: Int
    let changes: Int
}

struct GrowthStatisticsDTO: Codable, Equatable, Sendable {
    let totalXp: Int
    let trend: [GrowthStatisticsTrendDTO]
    let attributes: [GrowthStatisticsAttributeDTO]
}
