import Foundation
import iTuDomain
public extension OfflineStore {
@discardableResult
    func updateGrowthRewards(_ rewards: [GrowthRewardDTO]) throws -> OfflineSnapshot {
        state.shopItems = rewards
            .filter { $0.archivedAt == nil && $0.listedInShop && $0.price != nil }
            .map(Self.shopItem)
        try persist()
        return state
    }

@discardableResult
    func updateGrowthInventory(_ inventory: [GrowthInventoryDTO]) throws -> OfflineSnapshot {
        state.inventoryItems = inventory
            .filter { $0.quantity > 0 }
            .map { item in
                InventoryItem(
                    id: item.item.id,
                    title: item.item.name,
                    description: item.item.description ?? "A reward ready when you are.",
                    quantity: item.quantity,
                    icon: item.item.icon ?? "gift.fill"
                )
            }
        try persist()
        return state
    }

@discardableResult
    func updateGrowthLedger(_ entries: [GrowthLedgerDTO]) throws -> OfflineSnapshot {
        state.transactions = entries.map { entry in
            let amount = entry.amount ?? entry.xpAmount ?? entry.coinAmount ?? 0
            let xpKind: GrowthLedgerXPKind = {
                if entry.currency != "SKILL_XP" { return .skill }
                if entry.metadata?["awardType"]?.stringValue == "ATTRIBUTE" {
                    if entry.metadata?["derivedFromSkillId"]?.stringValue != nil || entry.metadata?["mappingSnapshot"] != nil {
                        return .derivedAttribute
                    }
                    return .attribute
                }
                return entry.metadata?["xpKind"]?.stringValue.flatMap(GrowthLedgerXPKind.init(rawValue:)) ?? .skill
            }()
            return LedgerTransaction(
                id: entry.id,
                title: entry.titleSnapshot ?? entry.reason ?? "Growth activity",
                amountXP: entry.currency == "ACCOUNT_XP" || entry.currency == "SKILL_XP" ? amount : 0,
                amountCoins: entry.currency == "COIN" ? (entry.amount ?? entry.coinAmount ?? 0) : (entry.coinAmount ?? 0),
                type: entry.sourceType ?? entry.kind ?? "Growth",
                timestamp: entry.createdAt ?? ISO8601DateFormatter().string(from: Date()),
                amountAccountXP: entry.currency == "ACCOUNT_XP" ? amount : 0,
                amountSkillXP: entry.currency == "SKILL_XP" && xpKind == .skill ? amount : 0,
                amountAttributeXP: entry.currency == "SKILL_XP" && xpKind == .attribute ? amount : 0,
                amountDerivedAttributeXP: entry.currency == "SKILL_XP" && xpKind == .derivedAttribute ? amount : 0
            )
        }
        try persist()
        return state
    }

@discardableResult
    func redeemGrowthReward(id: String) throws -> OfflineSnapshot {
        guard let index = state.shopItems.firstIndex(where: { $0.id == id }) else { return state }
        let item = state.shopItems[index]
        let price = item.costCoins
        guard state.userCoins >= price,
              item.repeatable || item.redemptionCount == 0 else { return state }
        state.userCoins -= price
        state.shopItems[index].redemptionCount += 1
        state.shopItems[index].isPurchased = !item.repeatable
        let inventoryIndex = state.inventoryItems.firstIndex(where: { $0.id == id })
        if let inventoryIndex {
            state.inventoryItems[inventoryIndex].quantity += 1
        } else {
            state.inventoryItems.append(InventoryItem(
                id: id,
                title: item.title,
                description: item.description,
                quantity: 1,
                icon: item.icon
            ))
        }
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "growthshopreward.redeem",
            entityId: id,
            payload: [:],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

private static func shopItem(_ dto: GrowthRewardDTO) -> ShopItem {
        let redemptionCount = dto._count?.redemptions ?? 0
        return ShopItem(
            id: dto.id,
            title: dto.name,
            description: dto.description ?? "A reward ready when you are.",
            costCoins: dto.price ?? 0,
            icon: dto.icon ?? "gift.fill",
            category: "Rewards",
            isPurchased: !dto.repeatable && redemptionCount > 0,
            repeatable: dto.repeatable,
            version: dto.version,
            redemptionCount: redemptionCount
        )
    }

@discardableResult
    func updateSkill(id: String, name: String, description: String, icon: String) throws -> OfflineSnapshot {
        guard let index = state.skills.firstIndex(where: { $0.id == id }) else { return state }
        state.skills[index].name = name
        state.skills[index].description = description
        state.skills[index].icon = icon
        let now = ISO8601DateFormatter().string(from: Date())
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "growthskill.update",
            entityId: id,
            payload: [
                "name": .string(name),
                "description": .string(description),
                "icon": .string(icon)
            ],
            occurredAt: now
        ))
        try persist()
        return state
    }


}
