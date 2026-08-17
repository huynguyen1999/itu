import Foundation

public struct UserAttribute: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var name: String
    public var level: Int
    public var currentXP: Int
    public var nextLevelXP: Int
    public var progressXP: Int?
    public var requiredXP: Int?
    public var icon: String
    public var color: String

    public init(id: String, name: String, level: Int, currentXP: Int, nextLevelXP: Int, progressXP: Int? = nil, requiredXP: Int? = nil, icon: String, color: String) {
        self.id = id; self.name = name; self.level = level; self.currentXP = currentXP; self.nextLevelXP = nextLevelXP; self.progressXP = progressXP; self.requiredXP = requiredXP; self.icon = icon; self.color = color
    }

    public static func sampleAttributes() -> [UserAttribute] {
        [
            UserAttribute(id: "attr-focus", name: "Deep Focus", level: 3, currentXP: 450, nextLevelXP: 1000, icon: "timer", color: "mint"),
            UserAttribute(id: "attr-learning", name: "Knowledge", level: 4, currentXP: 820, nextLevelXP: 1200, icon: "book.closed", color: "amber"),
            UserAttribute(id: "attr-consistency", name: "Consistency", level: 2, currentXP: 310, nextLevelXP: 800, icon: "repeat", color: "teal"),
            UserAttribute(id: "attr-grit", name: "Grit", level: 5, currentXP: 1100, nextLevelXP: 1500, icon: "sparkles", color: "coral")
        ]
    }
}

public struct GrowthAttributeMappingSkillRef: Codable, Equatable, Sendable {
    public let id: String; public let name: String?; public let kind: String?; public let archivedAt: String?
    public init(id: String, name: String?, kind: String?, archivedAt: String?) { self.id = id; self.name = name; self.kind = kind; self.archivedAt = archivedAt }
}

public struct GrowthAttributeMappingAttributeRef: Codable, Equatable, Sendable {
    public let id: String; public let name: String?; public let kind: String?; public let icon: String?; public let color: String?; public let archivedAt: String?
    public init(id: String, name: String?, kind: String?, icon: String?, color: String?, archivedAt: String?) { self.id = id; self.name = name; self.kind = kind; self.icon = icon; self.color = color; self.archivedAt = archivedAt }
}

public struct GrowthAttributeMappingDTO: Codable, Equatable, Sendable, Identifiable {
    public let id: String; public let userId: String?; public let skillId: String; public let attributeId: String; public let slot: GrowthAttributeMappingSlot; public let weight: Int; public let skill: GrowthAttributeMappingSkillRef?; public let attribute: GrowthAttributeMappingAttributeRef?
    public init(id: String, userId: String? = nil, skillId: String, attributeId: String, slot: GrowthAttributeMappingSlot, weight: Int, skill: GrowthAttributeMappingSkillRef? = nil, attribute: GrowthAttributeMappingAttributeRef? = nil) { self.id = id; self.userId = userId; self.skillId = skillId; self.attributeId = attributeId; self.slot = slot; self.weight = weight; self.skill = skill; self.attribute = attribute }
}

public struct GrowthAttributeMappingDraft: Codable, Equatable, Sendable {
    public var attributeId: String; public var slot: GrowthAttributeMappingSlot; public var weight: Int
    public init(attributeId: String, slot: GrowthAttributeMappingSlot, weight: Int) { self.attributeId = attributeId; self.slot = slot; self.weight = weight }
}

public struct GrowthAttributeMappingValidation: Equatable, Sendable {
    public let valid: Bool; public let errors: [String]
    public init(valid: Bool, errors: [String]) { self.valid = valid; self.errors = errors }
}

public enum GrowthAttributeMappingRules {
    public static func validate(_ mappings: [GrowthAttributeMappingDraft]) -> GrowthAttributeMappingValidation {
        var errors: [String] = []
        let primary = mappings.filter { $0.slot == .primary }
        let secondary = mappings.filter { $0.slot == .secondary }
        if mappings.count < 1 || mappings.count > 2 { errors.append("Choose one primary attribute and at most one secondary attribute.") }
        if primary.count != 1 { errors.append("Exactly one primary attribute is required.") }
        if secondary.count > 1 { errors.append("Only one secondary attribute is allowed.") }
        if let value = primary.first?.weight, !(70...100).contains(value) { errors.append("Primary weight must be an integer from 70% to 100%.") }
        if let value = secondary.first?.weight, !(1...30).contains(value) { errors.append("Secondary weight must be an integer from 1% to 30%.") }
        if Set(mappings.map(\.attributeId).filter { !$0.isEmpty }).count != mappings.filter({ !$0.attributeId.isEmpty }).count { errors.append("Primary and secondary attributes must be different.") }
        if mappings.reduce(0, { $0 + $1.weight }) != 100 { errors.append("Mapping weights must total 100%.") }
        if mappings.contains(where: { $0.attributeId.isEmpty }) { errors.append("Choose an attribute for every mapping.") }
        return GrowthAttributeMappingValidation(valid: errors.isEmpty, errors: errors)
    }

    public static let primaryOnly: [GrowthAttributeMappingDraft] = [GrowthAttributeMappingDraft(attributeId: "", slot: .primary, weight: 100)]
}

public struct SkillNode: Identifiable, Codable, Equatable, Sendable {
    public let id: String; public var name: String; public var description: String; public var level: Int; public var maxLevel: Int; public var icon: String; public var category: String; public var currentXP: Int?; public var nextLevelXP: Int?; public var progressXP: Int?; public var requiredXP: Int?; public var baseXp: Int?; public var archivedAt: String?
    public init(id: String, name: String, description: String, level: Int, maxLevel: Int, icon: String, category: String, currentXP: Int? = nil, nextLevelXP: Int? = nil, progressXP: Int? = nil, requiredXP: Int? = nil, baseXp: Int? = nil, archivedAt: String? = nil) { self.id = id; self.name = name; self.description = description; self.level = level; self.maxLevel = maxLevel; self.icon = icon; self.category = category; self.currentXP = currentXP; self.nextLevelXP = nextLevelXP; self.progressXP = progressXP; self.requiredXP = requiredXP; self.baseXp = baseXp; self.archivedAt = archivedAt }
    public static func sampleSkills() -> [SkillNode] { [SkillNode(id: "sk-1", name: "Pomodoro Master", description: "Increase focus XP bonus by 15%", level: 2, maxLevel: 5, icon: "timer", category: "Focus"), SkillNode(id: "sk-2", name: "Speed Reader", description: "Review flashcards 20% faster", level: 1, maxLevel: 3, icon: "book", category: "Learn"), SkillNode(id: "sk-3", name: "Streak Shield", description: "Protect habit streak once per week", level: 3, maxLevel: 3, icon: "shield.fill", category: "Habits")] }
}

public struct ShopItem: Identifiable, Codable, Equatable, Sendable {
    public let id: String; public var title: String; public var description: String; public var costCoins: Int; public var icon: String; public var category: String; public var isPurchased: Bool; public var repeatable: Bool; public var version: Int; public var redemptionCount: Int
    public init(id: String, title: String, description: String, costCoins: Int, icon: String, category: String, isPurchased: Bool, repeatable: Bool = false, version: Int = 1, redemptionCount: Int = 0) { self.id = id; self.title = title; self.description = description; self.costCoins = costCoins; self.icon = icon; self.category = category; self.isPurchased = isPurchased; self.repeatable = repeatable; self.version = version; self.redemptionCount = redemptionCount }
    public static func sampleItems() -> [ShopItem] { [ShopItem(id: "shop-1", title: "Coffee Break", description: "Enjoy a 30-minute guilt-free break", costCoins: 100, icon: "cup.and.saucer.fill", category: "Rewards", isPurchased: false), ShopItem(id: "shop-2", title: "Custom Theme Accent", description: "Unlock Forest Emerald color scheme", costCoins: 250, icon: "paintpalette.fill", category: "Cosmetics", isPurchased: true), ShopItem(id: "shop-3", title: "Weekend Pass", description: "Pause daily habit targets for Sunday", costCoins: 150, icon: "sun.max.fill", category: "Perks", isPurchased: false)] }
}

public struct InventoryItem: Identifiable, Codable, Equatable, Sendable {
    public let id: String; public var title: String; public var description: String; public var quantity: Int; public var icon: String
    public init(id: String, title: String, description: String, quantity: Int, icon: String) { self.id = id; self.title = title; self.description = description; self.quantity = quantity; self.icon = icon }
}

public struct LedgerTransaction: Identifiable, Codable, Equatable, Sendable {
    public let id: String; public var title: String; public var amountXP: Int; public var amountCoins: Int; public var type: String; public var timestamp: String; public var amountAccountXP: Int; public var amountSkillXP: Int; public var amountAttributeXP: Int; public var amountDerivedAttributeXP: Int
    private enum CodingKeys: String, CodingKey { case id, title, amountXP, amountCoins, type, timestamp, amountAccountXP, amountSkillXP, amountAttributeXP, amountDerivedAttributeXP }
    public init(id: String, title: String, amountXP: Int, amountCoins: Int, type: String, timestamp: String, amountAccountXP: Int = 0, amountSkillXP: Int = 0, amountAttributeXP: Int = 0, amountDerivedAttributeXP: Int = 0) { self.id = id; self.title = title; self.amountXP = amountXP; self.amountCoins = amountCoins; self.type = type; self.timestamp = timestamp; self.amountAccountXP = amountAccountXP; self.amountSkillXP = amountSkillXP; self.amountAttributeXP = amountAttributeXP; self.amountDerivedAttributeXP = amountDerivedAttributeXP }
    public init(from decoder: Decoder) throws { let values = try decoder.container(keyedBy: CodingKeys.self); id = try values.decode(String.self, forKey: .id); title = try values.decode(String.self, forKey: .title); amountXP = try values.decodeIfPresent(Int.self, forKey: .amountXP) ?? 0; amountCoins = try values.decodeIfPresent(Int.self, forKey: .amountCoins) ?? 0; type = try values.decodeIfPresent(String.self, forKey: .type) ?? "Growth"; timestamp = try values.decodeIfPresent(String.self, forKey: .timestamp) ?? ""; amountAccountXP = try values.decodeIfPresent(Int.self, forKey: .amountAccountXP) ?? 0; amountSkillXP = try values.decodeIfPresent(Int.self, forKey: .amountSkillXP) ?? 0; amountAttributeXP = try values.decodeIfPresent(Int.self, forKey: .amountAttributeXP) ?? 0; amountDerivedAttributeXP = try values.decodeIfPresent(Int.self, forKey: .amountDerivedAttributeXP) ?? 0 }
    public func encode(to encoder: Encoder) throws { var values = encoder.container(keyedBy: CodingKeys.self); try values.encode(id, forKey: .id); try values.encode(title, forKey: .title); try values.encode(amountXP, forKey: .amountXP); try values.encode(amountCoins, forKey: .amountCoins); try values.encode(type, forKey: .type); try values.encode(timestamp, forKey: .timestamp); try values.encode(amountAccountXP, forKey: .amountAccountXP); try values.encode(amountSkillXP, forKey: .amountSkillXP); try values.encode(amountAttributeXP, forKey: .amountAttributeXP); try values.encode(amountDerivedAttributeXP, forKey: .amountDerivedAttributeXP) }
    public static func sampleTransactions() -> [LedgerTransaction] { let now = ISO8601DateFormatter().string(from: Date()); return [LedgerTransaction(id: "tx-1", title: "Completed Focus Session (45m)", amountXP: 90, amountCoins: 45, type: "Focus", timestamp: now), LedgerTransaction(id: "tx-2", title: "Habit Check-in: Morning Meditation", amountXP: 30, amountCoins: 15, type: "Habit", timestamp: now), LedgerTransaction(id: "tx-3", title: "Completed Task: Review SwiftUI Architecture", amountXP: 50, amountCoins: 25, type: "Task", timestamp: now)] }
}

public struct GrowthAccountDTO: Codable, Sendable {
    public let level: Int?; public let currentXp: Int?; public let nextLevelXp: Int?; public let coinBalance: Int?; public var levelStartXp: Int?; public var progressXp: Int?; public var requiredXp: Int?; public var baseXp: Int?
    public init(level: Int?, currentXp: Int?, nextLevelXp: Int?, coinBalance: Int?, levelStartXp: Int? = nil, progressXp: Int? = nil, requiredXp: Int? = nil, baseXp: Int? = nil) { self.level = level; self.currentXp = currentXp; self.nextLevelXp = nextLevelXp; self.coinBalance = coinBalance; self.levelStartXp = levelStartXp; self.progressXp = progressXp; self.requiredXp = requiredXp; self.baseXp = baseXp }
}

public enum GrowthRewardPreset: String, Codable, CaseIterable, Identifiable, Sendable {
    case light = "LIGHT"; case standard = "STANDARD"; case strong = "STRONG"
    public var id: String { rawValue }
    public var title: String { switch self { case .light: "Light"; case .standard: "Standard"; case .strong: "Strong" } }
}

public enum GrowthScalingMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case fixed = "FIXED"; case linear = "LINEAR"
    public var id: String { rawValue }
    public var title: String { rawValue == "FIXED" ? "Fixed" : "Linear" }
}

public struct GrowthEarningRuleSkillAwardDTO: Codable, Equatable, Sendable {
    public let skillId: String; public let xpReward: Int; public let skill: GrowthSkillDTO?
    public init(skillId: String, xpReward: Int, skill: GrowthSkillDTO?) { self.skillId = skillId; self.xpReward = xpReward; self.skill = skill }
}

public struct GrowthEarningRuleItemDTO: Codable, Equatable, Sendable {
    public let itemId: String; public let quantity: Int; public let item: GrowthAwardItemDTO?
    public init(itemId: String, quantity: Int, item: GrowthAwardItemDTO?) { self.itemId = itemId; self.quantity = quantity; self.item = item }
}

public struct GrowthAwardItemDTO: Codable, Equatable, Sendable {
    public let id: String; public let name: String; public let icon: String?; public let color: String?
    public init(id: String, name: String, icon: String?, color: String?) { self.id = id; self.name = name; self.icon = icon; self.color = color }
}

public struct GrowthEarningRuleDTO: Codable, Equatable, Sendable {
    public let id: String; public let sourceType: GrowthSourceType; public let sourceId: String; public let coinReward: Int; public let accountXp: Int; public let enabled: Bool; public let scalingMode: GrowthScalingMode; public let maxRewardCap: Int?; public let version: Int; public let skillAwards: [GrowthEarningRuleSkillAwardDTO]; public let itemAwards: [GrowthEarningRuleItemDTO]
    private enum CodingKeys: String, CodingKey { case id, sourceType, sourceId, coinReward, accountXp, enabled, scalingMode, maxRewardCap, version, skillAwards, itemAwards }
    public init(id: String, sourceType: GrowthSourceType, sourceId: String, coinReward: Int, accountXp: Int = 0, enabled: Bool, scalingMode: GrowthScalingMode, maxRewardCap: Int?, version: Int, skillAwards: [GrowthEarningRuleSkillAwardDTO], itemAwards: [GrowthEarningRuleItemDTO]) { self.id = id; self.sourceType = sourceType; self.sourceId = sourceId; self.coinReward = coinReward; self.accountXp = accountXp; self.enabled = enabled; self.scalingMode = scalingMode; self.maxRewardCap = maxRewardCap; self.version = version; self.skillAwards = skillAwards; self.itemAwards = itemAwards }
    public init(from decoder: Decoder) throws { let values = try decoder.container(keyedBy: CodingKeys.self); id = try values.decode(String.self, forKey: .id); sourceType = try values.decode(GrowthSourceType.self, forKey: .sourceType); sourceId = try values.decode(String.self, forKey: .sourceId); coinReward = try values.decodeIfPresent(Int.self, forKey: .coinReward) ?? 0; let legacyAwards = try values.decodeIfPresent([GrowthEarningRuleSkillAwardDTO].self, forKey: .skillAwards) ?? []; accountXp = try values.decodeIfPresent(Int.self, forKey: .accountXp) ?? legacyAwards.map(\.xpReward).max() ?? 0; enabled = try values.decodeIfPresent(Bool.self, forKey: .enabled) ?? true; scalingMode = try values.decodeIfPresent(GrowthScalingMode.self, forKey: .scalingMode) ?? .fixed; maxRewardCap = try values.decodeIfPresent(Int.self, forKey: .maxRewardCap); version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1; skillAwards = legacyAwards; itemAwards = try values.decodeIfPresent([GrowthEarningRuleItemDTO].self, forKey: .itemAwards) ?? [] }
}

public struct GrowthRewardRuleDTO: Codable, Equatable, Sendable {
    public var coinReward: Int; public var accountXp: Int; public var xpRewardPerSkill: Int; public var scalingMode: GrowthScalingMode; public var maxRewardCap: Int?
    public init(coinReward: Int, accountXp: Int = 0, xpRewardPerSkill: Int, scalingMode: GrowthScalingMode, maxRewardCap: Int?) { self.coinReward = coinReward; self.accountXp = accountXp; self.xpRewardPerSkill = xpRewardPerSkill; self.scalingMode = scalingMode; self.maxRewardCap = maxRewardCap }
    private enum CodingKeys: String, CodingKey { case coinReward, accountXp, xpRewardPerSkill, scalingMode, maxRewardCap }
    public init(from decoder: Decoder) throws { let values = try decoder.container(keyedBy: CodingKeys.self); coinReward = try values.decodeIfPresent(Int.self, forKey: .coinReward) ?? 0; xpRewardPerSkill = try values.decodeIfPresent(Int.self, forKey: .xpRewardPerSkill) ?? 0; accountXp = try values.decodeIfPresent(Int.self, forKey: .accountXp) ?? xpRewardPerSkill; scalingMode = try values.decodeIfPresent(GrowthScalingMode.self, forKey: .scalingMode) ?? .fixed; maxRewardCap = try values.decodeIfPresent(Int.self, forKey: .maxRewardCap) }
}

public struct GrowthTaskRewardDefaultDTO: Codable, Equatable, Sendable {
    public let id: String; public let taskListId: String?; public let coinReward: Int; public let accountXp: Int; public let enabled: Bool; public let skillAwards: [GrowthEarningRuleSkillAwardDTO]; public let itemAwards: [GrowthEarningRuleItemDTO]
    private enum CodingKeys: String, CodingKey { case id, taskListId, coinReward, accountXp, enabled, skillAwards, itemAwards }
    public init(id: String, taskListId: String?, coinReward: Int, accountXp: Int, enabled: Bool, skillAwards: [GrowthEarningRuleSkillAwardDTO], itemAwards: [GrowthEarningRuleItemDTO]) { self.id = id; self.taskListId = taskListId; self.coinReward = coinReward; self.accountXp = accountXp; self.enabled = enabled; self.skillAwards = skillAwards; self.itemAwards = itemAwards }
    public init(from decoder: Decoder) throws { let values = try decoder.container(keyedBy: CodingKeys.self); id = try values.decode(String.self, forKey: .id); taskListId = try values.decodeIfPresent(String.self, forKey: .taskListId); coinReward = try values.decodeIfPresent(Int.self, forKey: .coinReward) ?? 0; skillAwards = try values.decodeIfPresent([GrowthEarningRuleSkillAwardDTO].self, forKey: .skillAwards) ?? []; accountXp = try values.decodeIfPresent(Int.self, forKey: .accountXp) ?? skillAwards.map(\.xpReward).max() ?? 0; enabled = try values.decodeIfPresent(Bool.self, forKey: .enabled) ?? true; itemAwards = try values.decodeIfPresent([GrowthEarningRuleItemDTO].self, forKey: .itemAwards) ?? [] }
}

public enum GrowthResetScope: String, Codable, CaseIterable, Identifiable, Sendable {
    case skill = "SKILL"; case allXP = "ALL_XP"; case full = "FULL"
    public var id: String { rawValue }
    public var title: String { switch self { case .skill: "Single Skill"; case .allXP: "All Skills XP"; case .full: "Full Reset" } }
}

public struct GrowthResetPreviewDTO: Codable, Equatable, Sendable {
    public struct AffectedSkill: Codable, Equatable, Sendable, Identifiable {
        public let id: String; public let name: String; public let xpToReset: Int; public let currentLevel: Int; public let newLevel: Int
        public init(id: String, name: String, xpToReset: Int, currentLevel: Int, newLevel: Int) { self.id = id; self.name = name; self.xpToReset = xpToReset; self.currentLevel = currentLevel; self.newLevel = newLevel }
    }
    public let scope: GrowthResetScope; public let affectedSkills: [AffectedSkill]; public let coinBalanceToReset: Int?
    public init(scope: GrowthResetScope, affectedSkills: [AffectedSkill], coinBalanceToReset: Int?) { self.scope = scope; self.affectedSkills = affectedSkills; self.coinBalanceToReset = coinBalanceToReset }
}

public struct GrowthProfileDTO: Codable, Equatable, Sendable {
    public let id: String; public let userId: String; public var accountBaseXp: Int; public let activeCycleId: String; public let onboardingState: String; public var rewardPreset: GrowthRewardPreset; public let createdAt: String; public let updatedAt: String
    public init(id: String, userId: String, accountBaseXp: Int, activeCycleId: String, onboardingState: String, rewardPreset: GrowthRewardPreset, createdAt: String, updatedAt: String) { self.id = id; self.userId = userId; self.accountBaseXp = accountBaseXp; self.activeCycleId = activeCycleId; self.onboardingState = onboardingState; self.rewardPreset = rewardPreset; self.createdAt = createdAt; self.updatedAt = updatedAt }
}

public struct GrowthSkillDTO: Codable, Equatable, Sendable {
    public let id: String?; public let key: String?; public let name: String?; public let level: Int?; public let maxLevel: Int?; public let currentXp: Int?; public let nextLevelXp: Int?; public var levelStartXp: Int?; public var progressXp: Int?; public var requiredXp: Int?; public let category: String?; public var kind: String?; public let description: String?; public let icon: String?; public let color: String?; public let baseXp: Int?; public let version: Int?; public var archivedAt: String?; public var starterKey: String?
    public init(id: String?, key: String?, name: String?, level: Int?, maxLevel: Int?, currentXp: Int?, nextLevelXp: Int?, levelStartXp: Int? = nil, progressXp: Int? = nil, requiredXp: Int? = nil, category: String?, kind: String? = nil, description: String?, icon: String?, color: String?, baseXp: Int?, version: Int?, archivedAt: String? = nil, starterKey: String? = nil) { self.id = id; self.key = key; self.name = name; self.level = level; self.maxLevel = maxLevel; self.currentXp = currentXp; self.nextLevelXp = nextLevelXp; self.levelStartXp = levelStartXp; self.progressXp = progressXp; self.requiredXp = requiredXp; self.category = category; self.kind = kind; self.description = description; self.icon = icon; self.color = color; self.baseXp = baseXp; self.version = version; self.archivedAt = archivedAt; self.starterKey = starterKey }
}

public enum GrowthRewardMath {
    public static func selectedAwards(_ awards: [GrowthEarningRuleSkillAwardDTO], archivedSkillIDs: Set<String> = []) -> [GrowthEarningRuleSkillAwardDTO] { awards.filter { $0.xpReward > 0 && !archivedSkillIDs.contains($0.skillId) && $0.skill?.archivedAt == nil }.sorted { $0.skillId < $1.skillId }.prefix(3).map { $0 } }
    public static func split(accountXp: Int, awards: [GrowthEarningRuleSkillAwardDTO], archivedSkillIDs: Set<String> = []) -> [Int] {
        let selected = selectedAwards(awards, archivedSkillIDs: archivedSkillIDs); let budget = max(0, accountXp); guard budget > 0, !selected.isEmpty else { return selected.map { _ in 0 } }; let total = selected.reduce(0) { $0 + $1.xpReward }; guard total > 0 else { return selected.map { _ in 0 } }; let exact = selected.map { Double(budget * $0.xpReward) / Double(total) }; var allocations = exact.map { Int(floor($0)) }; var remainder = budget - allocations.reduce(0, +); var order: [(index: Int, fraction: Double, skillID: String)] = []; for (index, value) in exact.enumerated() { order.append((index: index, fraction: value - floor(value), skillID: selected[index].skillId)) }; order.sort { left, right in left.fraction == right.fraction ? left.skillID < right.skillID : left.fraction > right.fraction }; for item in order where remainder > 0 { allocations[item.index] += 1; remainder -= 1 }; return allocations
    }
}

public struct GrowthLedgerDTO: Codable, Sendable {
    public let id: String; public let reason: String?; public let xpAmount: Int?; public let coinAmount: Int?; public let createdAt: String?; public let currency: String?; public let amount: Int?; public let kind: String?; public let sourceType: String?; public let titleSnapshot: String?; public var metadata: [String: JSONValue]?
    public init(id: String, reason: String?, xpAmount: Int?, coinAmount: Int?, createdAt: String?, currency: String?, amount: Int?, kind: String?, sourceType: String?, titleSnapshot: String?, metadata: [String: JSONValue]? = nil) { self.id = id; self.reason = reason; self.xpAmount = xpAmount; self.coinAmount = coinAmount; self.createdAt = createdAt; self.currency = currency; self.amount = amount; self.kind = kind; self.sourceType = sourceType; self.titleSnapshot = titleSnapshot; self.metadata = metadata }
}

public struct GrowthRewardDTO: Codable, Sendable {
    public let id: String; public let name: String; public let description: String?; public let icon: String?; public let price: Int?; public let repeatable: Bool; public let version: Int; public let archivedAt: String?; public let listedInShop: Bool; public let _count: GrowthRedemptionCountDTO?
    public init(id: String, name: String, description: String?, icon: String?, price: Int?, repeatable: Bool, version: Int, archivedAt: String?, listedInShop: Bool, _count: GrowthRedemptionCountDTO?) { self.id = id; self.name = name; self.description = description; self.icon = icon; self.price = price; self.repeatable = repeatable; self.version = version; self.archivedAt = archivedAt; self.listedInShop = listedInShop; self._count = _count }
}

public struct GrowthRedemptionCountDTO: Codable, Sendable {
    public let redemptions: Int
    public init(redemptions: Int) { self.redemptions = redemptions }
}

public struct GrowthInventoryDTO: Codable, Sendable {
    public let item: GrowthRewardDTO; public let quantity: Int
    public init(item: GrowthRewardDTO, quantity: Int) { self.item = item; self.quantity = quantity }
}

public struct GrowthOverviewDTO: Codable, Sendable {
    public let account: GrowthAccountDTO?; public let skills: [GrowthSkillDTO]?; public let recentLedger: [GrowthLedgerDTO]?
    public init(account: GrowthAccountDTO?, skills: [GrowthSkillDTO]?, recentLedger: [GrowthLedgerDTO]?) { self.account = account; self.skills = skills; self.recentLedger = recentLedger }
}

public struct StudyCalendarDayDTO: Codable, Equatable, Sendable {
    public let date: String; public let sessions: Int; public let focusSessions: Int; public let reviews: Int; public let correct: Int; public let completedTasks: Int; public let focusedMinutes: Int; public let cardsCreated: Int
    public init(date: String, sessions: Int, focusSessions: Int, reviews: Int, correct: Int, completedTasks: Int, focusedMinutes: Int, cardsCreated: Int) { self.date = date; self.sessions = sessions; self.focusSessions = focusSessions; self.reviews = reviews; self.correct = correct; self.completedTasks = completedTasks; self.focusedMinutes = focusedMinutes; self.cardsCreated = cardsCreated }
}

public struct GrowthStatisticsTrendDTO: Codable, Equatable, Sendable {
    public let date: String; public let xp: Int
    public init(date: String, xp: Int) { self.date = date; self.xp = xp }
}

public struct GrowthStatisticsAttributeDTO: Codable, Equatable, Sendable {
    public let skillId: String; public let name: String; public let icon: String; public let color: String; public let gained: Int; public let lost: Int; public let net: Int; public let changes: Int
    public init(skillId: String, name: String, icon: String, color: String, gained: Int, lost: Int, net: Int, changes: Int) { self.skillId = skillId; self.name = name; self.icon = icon; self.color = color; self.gained = gained; self.lost = lost; self.net = net; self.changes = changes }
}

public struct GrowthStatisticsDTO: Codable, Equatable, Sendable {
    public let totalXp: Int; public let trend: [GrowthStatisticsTrendDTO]; public let attributes: [GrowthStatisticsAttributeDTO]
    public init(totalXp: Int, trend: [GrowthStatisticsTrendDTO], attributes: [GrowthStatisticsAttributeDTO]) { self.totalXp = totalXp; self.trend = trend; self.attributes = attributes }
}
