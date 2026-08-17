import Foundation
import iTuDomain
public extension OfflineStore {
    func reapplyPendingGrowthSkillMutations(optimisticByID: [String: SkillNode]) throws {
        for mutation in state.mutations where mutation.kind == "growthskill.update" {
            let skill = state.skills.first(where: { $0.id == mutation.entityId }) ?? optimisticByID[mutation.entityId]
            guard var value = skill else { continue }
            if let name = mutation.payload["name"]?.stringValue { value.name = name }
            if let description = mutation.payload["description"]?.stringValue { value.description = description }
            if let icon = mutation.payload["icon"]?.stringValue { value.icon = icon }
            if let index = state.skills.firstIndex(where: { $0.id == value.id }) { state.skills[index] = value } else { state.skills.append(value) }
        }
    }

    func reapplyPendingGrowthRewardRedemptions(
        optimisticShopItems: [String: ShopItem],
        optimisticInventory: [String: InventoryItem],
        debitCoins: Bool
    ) {
        for mutation in state.mutations where mutation.kind == "growthshopreward.redeem" {
            guard let optimistic = optimisticShopItems[mutation.entityId] else { continue }
            if let index = state.shopItems.firstIndex(where: { $0.id == mutation.entityId }) {
                state.shopItems[index].redemptionCount = max(state.shopItems[index].redemptionCount, optimistic.redemptionCount)
                state.shopItems[index].isPurchased = state.shopItems[index].isPurchased || optimistic.isPurchased
            } else {
                state.shopItems.append(optimistic)
            }
            if let optimisticInventoryItem = optimisticInventory[mutation.entityId] {
                if let index = state.inventoryItems.firstIndex(where: { $0.id == mutation.entityId }) {
                    state.inventoryItems[index].quantity = max(state.inventoryItems[index].quantity, optimisticInventoryItem.quantity)
                } else {
                    state.inventoryItems.append(optimisticInventoryItem)
                }
            }
            if debitCoins, let price = state.shopItems.first(where: { $0.id == mutation.entityId })?.costCoins {
                state.userCoins = max(0, state.userCoins - price)
            }
        }
    }
}
