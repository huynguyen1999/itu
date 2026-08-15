import Foundation

@MainActor
extension AppModel {
    func updateSkill(_ skill: SkillNode, name: String, description: String, icon: String) async {
        do {
            apply(try await offlineStore.updateSkill(id: skill.id, name: name, description: description, icon: icon))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not update skill: \(error.localizedDescription)"
        }
    }

    func updateGrowthProfile(accountBaseXp: Int, rewardPreset: GrowthRewardPreset) async {
        do {
            apply(try await offlineStore.updateGrowthProfile(accountBaseXp: accountBaseXp, rewardPreset: rewardPreset))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not save Growth settings: \(error.localizedDescription)"
        }
    }

    func updateGrowthRewardPreset(preset: GrowthRewardPreset, rules: [String: GrowthRewardRuleDTO]) async {
        do {
            apply(try await offlineStore.updateGrowthRewardPreset(preset: preset, rules: rules))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not save Growth reward preset: \(error.localizedDescription)"
        }
    }

    func applyGrowthPreset(_ preset: GrowthRewardPreset) async {
        do {
            apply(try await offlineStore.applyGrowthPreset(preset))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not apply Growth preset: \(error.localizedDescription)"
        }
    }

    func refreshGrowthRule(for taskID: String) async {
        do {
            let rules = try await apiClient.fetchGrowthEarningRules(sourceType: .task, sourceId: taskID)
            var updatedRules = growthEarningRules
            if let rule = rules.first {
                updatedRules[taskID] = rule
            } else {
                updatedRules.removeValue(forKey: taskID)
            }
            apply(try await offlineStore.updateGrowthEarningRules(Array(updatedRules.values)))
        } catch {
            // Keep cached Growth details available when the task editor is offline.
        }
    }

    func upsertTaskGrowthRule(
        taskID: String,
        coinReward: Int,
        accountXp: Int? = nil,
        skillAwards: [String: Int],
        itemAwards: [String: Int]
    ) async {
        do {
            apply(try await offlineStore.upsertTaskGrowthEarningRule(
                taskID: taskID,
                coinReward: coinReward,
                accountXp: accountXp,
                skillAwards: skillAwards,
                itemAwards: itemAwards
            ))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not save Growth rewards: \(error.localizedDescription)"
        }
    }

    func upsertGrowthAttributeMappings(skillID: String, mappings: [GrowthAttributeMappingDraft]) async {
        do {
            let snapshot = try await offlineStore.upsertGrowthAttributeMappings(skillID: skillID, mappings: mappings)
            apply(snapshot)
            syncPhase = .pending
        } catch {
            errorMessage = "Could not save attribute mapping: \(error.localizedDescription)"
        }
    }

    func previewGrowthReset(scope: GrowthResetScope, skillId: String?) async {
        growthResetLoading = true
        growthResetError = nil
        do {
            growthResetPreview = try await apiClient.previewGrowthReset(scope: scope, skillId: skillId)
        } catch {
            growthResetPreview = nil
            growthResetError = error.localizedDescription
        }
        growthResetLoading = false
    }

    func executeGrowthReset(
        scope: GrowthResetScope,
        skillId: String?,
        keepEarningRules: Bool,
        keepShopRewards: Bool
    ) async {
        growthResetLoading = true
        growthResetError = nil
        do {
            try await apiClient.executeGrowthReset(
                scope: scope,
                skillId: skillId,
                idempotencyKey: "macos-reset-\(ULID.generate())",
                keepEarningRules: keepEarningRules,
                keepShopRewards: keepShopRewards
            )
            growthResetPreview = nil
            await loadServerState()
        } catch {
            growthResetError = error.localizedDescription
        }
        growthResetLoading = false
    }

    func refreshStatistics(days: Int) async {
        let normalizedDays = max(1, min(days, 365))
        let end = StatisticsPeriod.dateKey(Date())
        await refreshStatistics(period: StatisticsPeriod(
            range: StatisticsDateRange(from: StatisticsPeriod.addDays(end, -(normalizedDays - 1)), to: end)
        ))
    }

    func refreshStatistics(period: StatisticsPeriod) async {
        statisticsLoading = true
        statisticsError = false
        statisticsCalendarError = false
        growthStatisticsError = false
        statisticsErrorMessage = nil
        statisticsComparisonCalendar = []
        growthStatisticsComparison = nil
        statisticsComparisonAvailable = false
        async let calendarRequest = apiClient.fetchStudyCalendar(fromDate: period.from, toDate: period.to)
        async let growthRequest = apiClient.fetchGrowthStatistics(fromDate: period.apiFrom, toDate: period.apiTo)
        async let comparisonCalendarRequest = apiClient.fetchStudyCalendar(fromDate: period.comparison.from, toDate: period.comparison.to)
        async let comparisonGrowthRequest = apiClient.fetchGrowthStatistics(fromDate: period.comparison.apiFrom, toDate: period.comparison.apiTo)
        do {
            statisticsCalendar = try await calendarRequest
        } catch {
            statisticsCalendarError = true
            statisticsError = true
            statisticsErrorMessage = error.localizedDescription
        }
        do {
            let fetched = try await growthRequest
            growthStatistics = GrowthStatisticsDTO(
                totalXp: fetched.totalXp,
                trend: fetched.trend,
                attributes: fetched.attributes.filter {
                    $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general"
                }
            )
        } catch {
            growthStatisticsError = true
            statisticsError = true
            statisticsErrorMessage = error.localizedDescription
        }
        do {
            statisticsComparisonCalendar = try await comparisonCalendarRequest
            statisticsComparisonAvailable = true
        } catch {
            statisticsComparisonCalendar = []
        }
        do {
            let fetched = try await comparisonGrowthRequest
            growthStatisticsComparison = GrowthStatisticsDTO(
                totalXp: fetched.totalXp,
                trend: fetched.trend,
                attributes: fetched.attributes.filter {
                    $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general"
                }
            )
        } catch {
            growthStatisticsComparison = nil
        }
        statisticsLoading = false
    }

    func refreshStatistics(calendarDays: Int, fromDate: String, toDate: String) async {
        statisticsLoading = true
        statisticsError = false
        statisticsCalendarError = false
        growthStatisticsError = false
        statisticsErrorMessage = nil
        async let calendarRequest = apiClient.fetchStudyCalendar(days: calendarDays)
        async let growthRequest = apiClient.fetchGrowthStatistics(fromDate: fromDate, toDate: toDate)
        do {
            statisticsCalendar = try await calendarRequest
        } catch {
            statisticsCalendarError = true
            statisticsError = true
            statisticsErrorMessage = error.localizedDescription
        }
        do {
            let fetched = try await growthRequest
            growthStatistics = GrowthStatisticsDTO(
                totalXp: fetched.totalXp,
                trend: fetched.trend,
                attributes: fetched.attributes.filter {
                    $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general"
                }
            )
        } catch {
            growthStatisticsError = true
            statisticsError = true
            statisticsErrorMessage = error.localizedDescription
        }
        statisticsLoading = false
    }

    func redeemGrowthReward(_ item: ShopItem) async {
        do {
            apply(try await offlineStore.redeemGrowthReward(id: item.id))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not redeem reward: \(error.localizedDescription)"
        }
    }

    func dismissCurrentGrowthReceipt() {
        guard !growthReceiptQueue.isEmpty else { return }
        growthReceiptQueue.removeFirst()
    }

    func enqueueGrowthReceipt(_ receipt: GrowthAwardReceipt, mutationId: String) {
        guard !growthReceiptQueue.contains(where: {
            $0.id == mutationId ||
            (receipt.receiptKey != nil && $0.receipt.receiptKey == receipt.receiptKey)
        }) else { return }
        growthReceiptQueue.append(PresentedGrowthReceipt(id: mutationId, receipt: receipt))
    }

    func makeOptimisticGrowthReceipt(
        for task: ProductivityTask,
        newStatus: TaskStatus
    ) -> GrowthAwardReceipt? {
        let isAward = task.status != .completed && newStatus == .completed
        let isReversal = task.status == .completed && newStatus != .completed
        guard isAward || isReversal else { return nil }
        return makeOptimisticGrowthReceipt(
            sourceType: .task,
            sourceId: task.id,
            title: task.title,
            wasCompleted: task.status == .completed,
            isCompleted: newStatus == .completed
        )
    }

    func makeOptimisticGrowthReceipt(
        sourceType: GrowthSourceType,
        sourceId: String,
        ruleSourceId: String? = nil,
        title: String,
        wasCompleted: Bool,
        isCompleted: Bool
    ) -> GrowthAwardReceipt? {
        let isAward = !wasCompleted && isCompleted
        let isReversal = wasCompleted && !isCompleted
        guard isAward || isReversal,
              let rule = growthEarningRules[ruleSourceId ?? sourceId],
              rule.enabled else { return nil }

        let archivedIDs = Set(skills.filter { $0.archivedAt != nil }.map(\.id))
        let selected = GrowthRewardMath.selectedAwards(rule.skillAwards, archivedSkillIDs: archivedIDs)
        let accountAmount = max(0, rule.accountXp)
        let allocations = GrowthRewardMath.split(accountXp: accountAmount, awards: selected, archivedSkillIDs: archivedIDs)
        let progressAwards = selected.enumerated().compactMap { index, award -> GrowthProgressAward? in
            let xpAmount = allocations[index]
            guard xpAmount > 0 else { return nil }
            let skill = skills.first(where: { $0.id == award.skillId })
            let embedded = award.skill
            guard skill != nil || embedded != nil else { return nil }
            let beforeXP = skill?.currentXP ?? embedded?.currentXp ?? 0
            let baseXP = max(10, min(10_000, skill?.baseXp ?? embedded?.baseXp ?? 100))
            let beforeLevel = growthLevelProgress(xp: beforeXP, baseXP: baseXP).level
            let afterXP = max(0, beforeXP + (isReversal ? -xpAmount : xpAmount))
            let afterProgress = growthLevelProgress(xp: afterXP, baseXP: baseXP)
            return GrowthProgressAward(
                progressId: award.skillId,
                name: skill?.name ?? embedded?.name ?? "Skill",
                kind: embedded?.kind ?? "SKILL",
                icon: skill?.icon ?? embedded?.icon,
                color: embedded?.color,
                xpGained: xpAmount,
                beforeXp: beforeXP,
                afterXp: afterXP,
                beforeLevel: beforeLevel,
                afterLevel: afterProgress.level,
                nextLevelXp: afterProgress.nextLevelXp
            )
        }
        let accountAward: GrowthAccountAward?
        if accountAmount > 0 {
            let beforeXP = max(0, growthCurrentXp ?? 0)
            let afterXP = max(0, beforeXP + (isReversal ? -accountAmount : accountAmount))
            let base = max(10, min(10_000, growthProfile?.accountBaseXp ?? 100))
            let beforeLevel = Int(floor(sqrt(Double(beforeXP) / Double(base)))) + 1
            let afterLevel = Int(floor(sqrt(Double(afterXP) / Double(base)))) + 1
            accountAward = GrowthAccountAward(
                amount: accountAmount,
                beforeXp: beforeXP,
                afterXp: afterXP,
                beforeLevel: beforeLevel,
                afterLevel: afterLevel,
                nextLevelXp: base * afterLevel * afterLevel
            )
        } else {
            accountAward = nil
        }
        let signedCoinAmount = isReversal ? -rule.coinReward : rule.coinReward
        let coinAward = rule.coinReward == 0 ? nil : GrowthCoinAward(
            amount: rule.coinReward,
            balanceAfter: max(0, userCoins + signedCoinAmount)
        )
        let itemAwards = rule.itemAwards.map { award in
            let currentQuantity = inventoryItems.first(where: { $0.id == award.itemId })?.quantity ?? 0
            return GrowthItemAward(
                itemId: award.itemId,
                name: award.item?.name ?? "Reward item",
                icon: award.item?.icon,
                color: award.item?.color,
                quantity: award.quantity,
                inventoryQuantityAfter: max(0, currentQuantity + (isReversal ? -award.quantity : award.quantity))
            )
        }
        guard !progressAwards.isEmpty || accountAward != nil || coinAward != nil || !itemAwards.isEmpty else { return nil }
        return GrowthAwardReceipt(
            sourceType: sourceType,
            sourceId: sourceId,
            title: title,
            reverted: isReversal,
            accountAward: accountAward,
            progressAwards: progressAwards,
            coinAward: coinAward,
            itemAwards: itemAwards
        )
    }

    private func growthLevelProgress(xp: Int, baseXP: Int) -> (level: Int, nextLevelXp: Int) {
        let safeBase = max(10, min(10_000, baseXP))
        let safeXP = max(0, xp)
        let level = Int(floor(sqrt(Double(safeXP) / Double(safeBase)))) + 1
        return (level, safeBase * level * level)
    }


}
