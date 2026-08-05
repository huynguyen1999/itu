import Foundation

extension OfflineStore {
@discardableResult
    func recordOptimisticGrowthReceipt(
        _ receipt: GrowthAwardReceipt,
        mutationId: String
    ) throws -> OfflineSnapshot {
        guard state.pendingGrowthReceipts[mutationId] == nil,
              !state.handledGrowthMutationIds.contains(mutationId) else { return state }
        applyGrowthReceipt(receipt)
        state.pendingGrowthReceipts[mutationId] = receipt
        try persist()
        return state
    }

@discardableResult
    func reconcileGrowthOutcomes(
        _ outcomes: [SyncMutationOutcome],
        conflicts: [SyncConflict]
    ) throws -> OfflineSnapshot {
        let conflictedIDs = Set(conflicts.map(\.mutationId))
        for mutationId in conflictedIDs {
            if let optimistic = state.pendingGrowthReceipts.removeValue(forKey: mutationId) {
                rollbackGrowthReceipt(optimistic)
            }
        }
        for outcome in outcomes {
            let optimistic = state.pendingGrowthReceipts.removeValue(forKey: outcome.mutationId)
            if let optimistic { rollbackGrowthReceipt(optimistic) }
            if !state.handledGrowthMutationIds.contains(outcome.mutationId),
               let receipt = outcome.growthReceipt,
               receipt.receiptKey.map({ !state.handledGrowthReceiptKeys.contains($0) }) ?? true {
                applyGrowthReceipt(receipt)
                if let receiptKey = receipt.receiptKey {
                    state.handledGrowthReceiptKeys.append(receiptKey)
                }
            }
            state.handledGrowthMutationIds.append(outcome.mutationId)
        }
        if state.handledGrowthMutationIds.count > 256 {
            state.handledGrowthMutationIds = Array(state.handledGrowthMutationIds.suffix(256))
        }
        if state.handledGrowthReceiptKeys.count > 256 {
            state.handledGrowthReceiptKeys = Array(state.handledGrowthReceiptKeys.suffix(256))
        }
        try persist()
        return state
    }

@discardableResult
    func updateGrowthOverview(_ overview: GrowthOverviewDTO) throws -> OfflineSnapshot {
        state.growthLevel = overview.account?.level
        state.growthCurrentXp = overview.account?.currentXp
        state.growthNextLevelXp = overview.account?.nextLevelXp
        state.growthProgressXp = overview.account?.progressXp
        state.growthRequiredXp = overview.account?.requiredXp
        if let coinBalance = overview.account?.coinBalance {
            state.userCoins = coinBalance
        }
        if let skills = overview.skills { state.skills = skills.map(Self.skillNode) }
        if let ledger = overview.recentLedger {
            state.transactions = ledger.map { dto in
                let amount = dto.amount ?? dto.xpAmount ?? dto.coinAmount ?? 0
                let xpKind: GrowthLedgerXPKind = {
                    if dto.currency != "SKILL_XP" { return .skill }
                    if dto.metadata?["awardType"]?.stringValue == "ATTRIBUTE" {
                        if dto.metadata?["derivedFromSkillId"]?.stringValue != nil || dto.metadata?["mappingSnapshot"] != nil {
                            return .derivedAttribute
                        }
                        return .attribute
                    }
                    return dto.metadata?["xpKind"]?.stringValue.flatMap(GrowthLedgerXPKind.init(rawValue:)) ?? .skill
                }()
                return LedgerTransaction(
                    id: dto.id,
                    title: dto.reason ?? "Activity reward",
                    amountXP: dto.currency == "ACCOUNT_XP" || dto.currency == "SKILL_XP" ? amount : 0,
                    amountCoins: dto.currency == "COIN" ? (dto.amount ?? dto.coinAmount ?? 0) : (dto.coinAmount ?? 0),
                    type: "Growth",
                    timestamp: dto.createdAt ?? ISO8601DateFormatter().string(from: Date()),
                    amountAccountXP: dto.currency == "ACCOUNT_XP" ? amount : 0,
                    amountSkillXP: dto.currency == "SKILL_XP" && xpKind == .skill ? amount : 0,
                    amountAttributeXP: dto.currency == "SKILL_XP" && xpKind == .attribute ? amount : 0,
                    amountDerivedAttributeXP: dto.currency == "SKILL_XP" && xpKind == .derivedAttribute ? amount : 0
                )
            }
        }
        // Reapply optimistic account deltas in outbox order so a pull cannot
        // reorder multiple pending receipts and leave the account total wrong.
        let pendingMutationIDs = state.mutations.map(\.id)
        for mutationID in pendingMutationIDs {
            if let receipt = state.pendingGrowthReceipts[mutationID] {
                applyGrowthReceipt(receipt)
            }
        }
        try persist()
        return state
    }

private func applyGrowthReceipt(_ receipt: GrowthAwardReceipt) {
        if let account = receipt.accountAward {
            state.growthCurrentXp = max(0, account.afterXp)
            state.growthLevel = account.afterLevel
            state.growthNextLevelXp = max(1, account.nextLevelXp)
        }
        for award in receipt.progressAwards {
            if let index = state.attributes.firstIndex(where: { $0.id == award.progressId }) {
                state.attributes[index].currentXP = max(0, award.afterXp)
                state.attributes[index].level = award.afterLevel
                state.attributes[index].nextLevelXP = max(1, award.nextLevelXp)
            }
            if let index = state.skills.firstIndex(where: { $0.id == award.progressId }) {
                state.skills[index].currentXP = max(0, award.afterXp)
                state.skills[index].level = award.afterLevel
                state.skills[index].nextLevelXP = max(1, award.nextLevelXp)
            }
        }
        if let coin = receipt.coinAward {
            state.userCoins = max(0, coin.balanceAfter)
        }
        for award in receipt.itemAwards {
            if let index = state.inventoryItems.firstIndex(where: { $0.id == award.itemId }) {
                state.inventoryItems[index].quantity = max(0, award.inventoryQuantityAfter)
            } else if award.inventoryQuantityAfter > 0 {
                state.inventoryItems.append(InventoryItem(
                    id: award.itemId,
                    title: award.name,
                    description: "Growth reward",
                    quantity: award.inventoryQuantityAfter,
                    icon: award.icon ?? "gift.fill"
                ))
            }
        }
    }

private func rollbackGrowthReceipt(_ receipt: GrowthAwardReceipt) {
        if let account = receipt.accountAward {
            state.growthCurrentXp = max(0, account.beforeXp)
            state.growthLevel = account.beforeLevel
            let metrics = progressMetrics(beforeXp: account.beforeXp, beforeLevel: account.beforeLevel, afterLevel: account.afterLevel, authoritativeNextLevelXp: account.nextLevelXp)
            state.growthNextLevelXp = metrics.nextLevelXP
            state.growthProgressXp = metrics.progressXP
            state.growthRequiredXp = metrics.requiredXP
        }
        for award in receipt.progressAwards {
            if let index = state.attributes.firstIndex(where: { $0.id == award.progressId }) {
                state.attributes[index].currentXP = max(0, award.beforeXp)
                state.attributes[index].level = award.beforeLevel
                restoreProgress(&state.attributes[index], award: award)
            }
            if let index = state.skills.firstIndex(where: { $0.id == award.progressId }) {
                state.skills[index].currentXP = max(0, award.beforeXp)
                state.skills[index].level = award.beforeLevel
                restoreProgress(&state.skills[index], award: award)
            }
        }
        if let coin = receipt.coinAward {
            let previous = receipt.isReversal ? coin.balanceAfter + coin.amount : coin.balanceAfter - coin.amount
            state.userCoins = max(0, previous)
        }
        for award in receipt.itemAwards {
            guard let index = state.inventoryItems.firstIndex(where: { $0.id == award.itemId }) else { continue }
            let previous = receipt.isReversal ? award.inventoryQuantityAfter + award.quantity : award.inventoryQuantityAfter - award.quantity
            state.inventoryItems[index].quantity = max(0, previous)
        }
    }

private func restoreProgress(_ value: inout UserAttribute, award: GrowthProgressAward) {
        let metrics = progressMetrics(beforeXp: award.beforeXp, beforeLevel: award.beforeLevel, afterLevel: award.afterLevel, authoritativeNextLevelXp: award.nextLevelXp)
        value.nextLevelXP = metrics.nextLevelXP
        value.progressXP = metrics.progressXP
        value.requiredXP = metrics.requiredXP
    }

private func restoreProgress(_ value: inout SkillNode, award: GrowthProgressAward) {
        let metrics = progressMetrics(beforeXp: award.beforeXp, beforeLevel: award.beforeLevel, afterLevel: award.afterLevel, authoritativeNextLevelXp: award.nextLevelXp)
        value.nextLevelXP = metrics.nextLevelXP
        value.progressXP = metrics.progressXP
        value.requiredXP = metrics.requiredXP
    }

private func progressMetrics(beforeXp: Int, beforeLevel: Int, afterLevel: Int, authoritativeNextLevelXp: Int) -> (nextLevelXP: Int, progressXP: Int, requiredXP: Int) {
        let safeAfterLevel = max(1, afterLevel)
        let safeBeforeLevel = max(1, beforeLevel)
        let afterSquare = safeAfterLevel.multipliedReportingOverflow(by: safeAfterLevel)
        let base = afterSquare.overflow || afterSquare.partialValue == 0
            ? 1
            : max(1, authoritativeNextLevelXp / afterSquare.partialValue)
        let nextSquare = safeBeforeLevel.multipliedReportingOverflow(by: safeBeforeLevel)
        let startSquare = (safeBeforeLevel - 1).multipliedReportingOverflow(by: safeBeforeLevel - 1)
        let next = nextSquare.overflow || base.multipliedReportingOverflow(by: nextSquare.partialValue).overflow
            ? Int.max
            : max(1, base * nextSquare.partialValue)
        let start = startSquare.overflow || base.multipliedReportingOverflow(by: startSquare.partialValue).overflow
            ? 0
            : base * startSquare.partialValue
        return (next, max(0, beforeXp - start), max(1, next - start))
    }
}

