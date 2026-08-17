import Foundation

public enum GrowthAttributeMappingSlot: String, Codable, CaseIterable, Identifiable, Sendable {
    case primary = "PRIMARY"
    case secondary = "SECONDARY"
    public var id: String { rawValue }
    public var title: String { self == .primary ? "Primary" : "Secondary" }
}

public enum GrowthLedgerXPKind: String, Codable, Sendable {
    case skill = "SKILL"
    case attribute = "ATTRIBUTE"
    case derivedAttribute = "DERIVED_ATTRIBUTE"
    public var label: String {
        switch self { case .skill: "Skill XP"; case .attribute: "Attribute XP"; case .derivedAttribute: "Derived Attribute XP" }
    }
}

public struct GrowthMappingSnapshot: Codable, Equatable, Sendable {
    public let mappingId: String; public let skillId: String; public let attributeId: String; public let slot: GrowthAttributeMappingSlot; public let weight: Int
    public init(mappingId: String, skillId: String, attributeId: String, slot: GrowthAttributeMappingSlot, weight: Int) { self.mappingId = mappingId; self.skillId = skillId; self.attributeId = attributeId; self.slot = slot; self.weight = weight }
}

public enum GrowthSourceType: String, Codable, CaseIterable, Identifiable, Sendable {
    case task = "TASK"; case habit = "HABIT"; case focusPreset = "FOCUS_PRESET"; case reviewDeck = "REVIEW_DECK"
    public var id: String { rawValue }
    public var title: String { switch self { case .task: "Tasks"; case .habit: "Habits"; case .focusPreset: "Focus"; case .reviewDeck: "Deck Reviews" } }
}

public struct GrowthAwardReceipt: Codable, Equatable, Sendable {
    public let sourceType: GrowthSourceType; public let sourceId: String; public let title: String; public let reverted: Bool?; public let receiptKey: String?; public let accountAward: GrowthAccountAward?; public let progressAwards: [GrowthProgressAward]; public let coinAward: GrowthCoinAward?; public let itemAwards: [GrowthItemAward]
    public var isReversal: Bool { reverted == true }
    public init(sourceType: GrowthSourceType, sourceId: String, title: String, reverted: Bool? = nil, accountAward: GrowthAccountAward? = nil, progressAwards: [GrowthProgressAward] = [], coinAward: GrowthCoinAward? = nil, itemAwards: [GrowthItemAward] = [], receiptKey: String? = nil) { self.sourceType = sourceType; self.sourceId = sourceId; self.title = title; self.reverted = reverted; self.receiptKey = receiptKey; self.accountAward = accountAward; self.progressAwards = progressAwards; self.coinAward = coinAward; self.itemAwards = itemAwards }
    private enum CodingKeys: String, CodingKey { case sourceType, sourceId, title, reverted, reversed, receiptKey, accountAward, progressAwards, coinAward, itemAwards }
    public init(from decoder: Decoder) throws { let values = try decoder.container(keyedBy: CodingKeys.self); sourceType = try values.decode(GrowthSourceType.self, forKey: .sourceType); sourceId = try values.decode(String.self, forKey: .sourceId); title = try values.decode(String.self, forKey: .title); reverted = try values.decodeIfPresent(Bool.self, forKey: .reverted) ?? values.decodeIfPresent(Bool.self, forKey: .reversed); receiptKey = try values.decodeIfPresent(String.self, forKey: .receiptKey); accountAward = try values.decodeIfPresent(GrowthAccountAward.self, forKey: .accountAward); progressAwards = try values.decodeIfPresent([GrowthProgressAward].self, forKey: .progressAwards) ?? []; coinAward = try values.decodeIfPresent(GrowthCoinAward.self, forKey: .coinAward); itemAwards = try values.decodeIfPresent([GrowthItemAward].self, forKey: .itemAwards) ?? [] }
    public func encode(to encoder: Encoder) throws { var values = encoder.container(keyedBy: CodingKeys.self); try values.encode(sourceType, forKey: .sourceType); try values.encode(sourceId, forKey: .sourceId); try values.encode(title, forKey: .title); try values.encodeIfPresent(reverted, forKey: .reverted); try values.encodeIfPresent(receiptKey, forKey: .receiptKey); try values.encodeIfPresent(accountAward, forKey: .accountAward); try values.encode(progressAwards, forKey: .progressAwards); try values.encodeIfPresent(coinAward, forKey: .coinAward); try values.encode(itemAwards, forKey: .itemAwards) }
}

public struct GrowthAccountAward: Codable, Equatable, Sendable {
    public let amount: Int; public let beforeXp: Int; public let afterXp: Int; public let beforeLevel: Int; public let afterLevel: Int; public let nextLevelXp: Int
    public init(amount: Int, beforeXp: Int, afterXp: Int, beforeLevel: Int, afterLevel: Int, nextLevelXp: Int) { self.amount = amount; self.beforeXp = beforeXp; self.afterXp = afterXp; self.beforeLevel = beforeLevel; self.afterLevel = afterLevel; self.nextLevelXp = nextLevelXp }
}

public struct GrowthProgressAward: Codable, Equatable, Sendable, Identifiable {
    public var id: String { progressId }
    public let progressId: String; public let name: String; public let kind: String; public let icon: String?; public let color: String?; public let xpGained: Int; public let beforeXp: Int; public let afterXp: Int; public let beforeLevel: Int; public let afterLevel: Int; public let nextLevelXp: Int; public let awardType: GrowthLedgerXPKind?; public let derivedFromSkillId: String?; public let mappingSnapshot: [GrowthMappingSnapshot]
    private enum CodingKeys: String, CodingKey { case progressId, name, kind, icon, color, xpGained, beforeXp, afterXp, beforeLevel, afterLevel, nextLevelXp, awardType, derivedFromSkillId, mappingSnapshot }
    public init(progressId: String, name: String, kind: String, icon: String?, color: String?, xpGained: Int, beforeXp: Int, afterXp: Int, beforeLevel: Int, afterLevel: Int, nextLevelXp: Int, awardType: GrowthLedgerXPKind? = nil, derivedFromSkillId: String? = nil, mappingSnapshot: [GrowthMappingSnapshot] = []) { self.progressId = progressId; self.name = name; self.kind = kind; self.icon = icon; self.color = color; self.xpGained = xpGained; self.beforeXp = beforeXp; self.afterXp = afterXp; self.beforeLevel = beforeLevel; self.afterLevel = afterLevel; self.nextLevelXp = nextLevelXp; self.awardType = awardType; self.derivedFromSkillId = derivedFromSkillId; self.mappingSnapshot = mappingSnapshot }
    public init(from decoder: Decoder) throws { let values = try decoder.container(keyedBy: CodingKeys.self); progressId = try values.decode(String.self, forKey: .progressId); name = try values.decode(String.self, forKey: .name); kind = try values.decode(String.self, forKey: .kind); icon = try values.decodeIfPresent(String.self, forKey: .icon); color = try values.decodeIfPresent(String.self, forKey: .color); xpGained = try values.decode(Int.self, forKey: .xpGained); beforeXp = try values.decode(Int.self, forKey: .beforeXp); afterXp = try values.decode(Int.self, forKey: .afterXp); beforeLevel = try values.decode(Int.self, forKey: .beforeLevel); afterLevel = try values.decode(Int.self, forKey: .afterLevel); nextLevelXp = try values.decode(Int.self, forKey: .nextLevelXp); awardType = try? values.decode(GrowthLedgerXPKind.self, forKey: .awardType); derivedFromSkillId = try values.decodeIfPresent(String.self, forKey: .derivedFromSkillId); mappingSnapshot = try values.decodeIfPresent([GrowthMappingSnapshot].self, forKey: .mappingSnapshot) ?? [] }
}

public struct GrowthCoinAward: Codable, Equatable, Sendable {
    public let amount: Int; public let balanceAfter: Int
    public init(amount: Int, balanceAfter: Int) { self.amount = amount; self.balanceAfter = balanceAfter }
}

public struct GrowthItemAward: Codable, Equatable, Sendable, Identifiable {
    public var id: String { itemId }
    public let itemId: String; public let name: String; public let icon: String?; public let color: String?; public let quantity: Int; public let inventoryQuantityAfter: Int
    public init(itemId: String, name: String, icon: String?, color: String?, quantity: Int, inventoryQuantityAfter: Int) { self.itemId = itemId; self.name = name; self.icon = icon; self.color = color; self.quantity = quantity; self.inventoryQuantityAfter = inventoryQuantityAfter }
}
