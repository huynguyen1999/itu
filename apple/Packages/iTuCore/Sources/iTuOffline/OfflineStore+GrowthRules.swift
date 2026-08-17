import Foundation
import iTuDomain
public extension OfflineStore {
@discardableResult
    func updateGrowthEarningRules(_ rules: [GrowthEarningRuleDTO]) throws -> OfflineSnapshot {
        state.growthEarningRules = rules.reduce(into: [:]) { result, rule in
            result[rule.sourceId] = rule
        }
        reapplyPendingGrowthEarningRuleMutations()
        try persist()
        return state
    }

@discardableResult
    func updateGrowthTaskRewardDefaults(_ defaults: [GrowthTaskRewardDefaultDTO]) throws -> OfflineSnapshot {
        state.growthTaskRewardDefaults = defaults.reduce(into: [:]) { result, value in
            result[value.taskListId ?? "GLOBAL"] = value
        }
        reapplyPendingGrowthTaskRewardDefaultMutations()
        try persist()
        return state
    }

@discardableResult
    func upsertGrowthTaskRewardDefault(
        taskListID: String?,
        coinReward: Int,
        accountXp: Int,
        enabled: Bool,
        skillAwards: [String: Int],
        itemAwards: [String: Int]
    ) throws -> OfflineSnapshot {
        let key = taskListID ?? "GLOBAL"
        let existing = state.growthTaskRewardDefaults[key]
        let normalizedSkills = skillAwards
            .filter { $0.value > 0 }
            .sorted { $0.key < $1.key }
            .prefix(3)
            .map { GrowthEarningRuleSkillAwardDTO(skillId: $0.key, xpReward: $0.value, skill: nil) }
        let normalizedItems = itemAwards
            .filter { $0.value > 0 }
            .sorted { $0.key < $1.key }
            .map { GrowthEarningRuleItemDTO(itemId: $0.key, quantity: $0.value, item: nil) }
        let value = GrowthTaskRewardDefaultDTO(
            id: existing?.id ?? ULID.generate(),
            taskListId: taskListID,
            coinReward: max(0, coinReward),
            accountXp: max(0, accountXp),
            enabled: enabled,
            skillAwards: normalizedSkills,
            itemAwards: normalizedItems
        )
        state.growthTaskRewardDefaults[key] = value
        state.mutations.removeAll { $0.kind == "growthtaskrewarddefault.upsert" && $0.entityId == key }
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "growthtaskrewarddefault.upsert",
            entityId: key,
            baseVersion: nil,
            payload: growthTaskRewardDefaultPayload(value),
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

private func reapplyPendingGrowthTaskRewardDefaultMutations() {
        for mutation in state.mutations where mutation.kind == "growthtaskrewarddefault.upsert" {
            guard let value = growthTaskRewardDefault(from: mutation) else { continue }
            state.growthTaskRewardDefaults[value.taskListId ?? "GLOBAL"] = value
        }
    }

private func growthTaskRewardDefaultPayload(_ value: GrowthTaskRewardDefaultDTO) -> [String: JSONValue] {
        [
            "taskListId": value.taskListId.map(JSONValue.string) ?? .null,
            "coinReward": .number(Double(value.coinReward)),
            "accountXp": .number(Double(value.accountXp)),
            "enabled": .bool(value.enabled),
            "skillAwards": .array(value.skillAwards.map {
                .object(["skillId": .string($0.skillId), "xpReward": .number(Double($0.xpReward))])
            }),
            "itemAwards": .array(value.itemAwards.map {
                .object(["itemId": .string($0.itemId), "quantity": .number(Double($0.quantity))])
            })
        ]
    }

private func growthTaskRewardDefault(from mutation: SyncMutation) -> GrowthTaskRewardDefaultDTO? {
        func awards(_ key: String, idKey: String, amountKey: String) -> [(String, Int)] {
            guard case let .array(values)? = mutation.payload[key] else { return [] }
            return values.compactMap { value in
                guard case let .object(object) = value,
                      let id = object[idKey]?.stringValue,
                      let amount = object[amountKey]?.numberValue else { return nil }
                return (id, Int(amount))
            }
        }
        let taskListID = mutation.payload["taskListId"]?.stringValue
        let skills = awards("skillAwards", idKey: "skillId", amountKey: "xpReward")
            .map { GrowthEarningRuleSkillAwardDTO(skillId: $0.0, xpReward: $0.1, skill: nil) }
        let items = awards("itemAwards", idKey: "itemId", amountKey: "quantity")
            .map { GrowthEarningRuleItemDTO(itemId: $0.0, quantity: $0.1, item: nil) }
        return GrowthTaskRewardDefaultDTO(
            id: state.growthTaskRewardDefaults[taskListID ?? "GLOBAL"]?.id ?? mutation.entityId,
            taskListId: taskListID,
            coinReward: Int(mutation.payload["coinReward"]?.numberValue ?? 0),
            accountXp: Int(mutation.payload["accountXp"]?.numberValue ?? 0),
            enabled: mutation.payload["enabled"] == .bool(false) ? false : true,
            skillAwards: skills,
            itemAwards: items
        )
    }

@discardableResult
    func upsertTaskGrowthEarningRule(
        taskID: String,
        coinReward: Int,
        accountXp: Int? = nil,
        skillAwards: [String: Int],
        itemAwards: [String: Int]
    ) throws -> OfflineSnapshot {
        let existing = state.growthEarningRules[taskID]
        let normalizedSkills = skillAwards.filter { $0.value > 0 }.sorted { $0.key < $1.key }.prefix(3)
        let normalizedItems = itemAwards.filter { $0.value > 0 }
        let rule = GrowthEarningRuleDTO(
            id: existing?.id ?? "TASK:\(taskID)",
            sourceType: .task,
            sourceId: taskID,
            coinReward: max(0, coinReward),
            accountXp: max(0, accountXp ?? (normalizedSkills.map(\.value).max() ?? 0)),
            enabled: true,
            scalingMode: .fixed,
            maxRewardCap: nil,
            version: existing?.version ?? 1,
            skillAwards: normalizedSkills.map { skillID, amount in
                GrowthEarningRuleSkillAwardDTO(skillId: skillID, xpReward: amount, skill: nil)
            },
            itemAwards: normalizedItems.sorted { $0.key < $1.key }.map { itemID, quantity in
                let item = state.shopItems.first(where: { $0.id == itemID }).map {
                    GrowthAwardItemDTO(id: $0.id, name: $0.title, icon: $0.icon, color: nil)
                }
                return GrowthEarningRuleItemDTO(itemId: itemID, quantity: quantity, item: item)
            }
        )
        state.growthEarningRules[taskID] = rule
        state.mutations.removeAll {
            $0.kind == "growthearningrule.upsert" && $0.payload["sourceId"]?.stringValue == taskID
        }
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "growthearningrule.upsert",
            entityId: rule.id,
            baseVersion: existing?.version,
            payload: growthEarningRulePayload(rule),
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

private func reapplyPendingGrowthEarningRuleMutations() {
        for mutation in state.mutations where mutation.kind == "growthearningrule.upsert" {
            guard let rule = growthEarningRule(from: mutation) else { continue }
            state.growthEarningRules[rule.sourceId] = rule
        }
    }

private func growthEarningRulePayload(_ rule: GrowthEarningRuleDTO) -> [String: JSONValue] {
        [
            "sourceType": .string(rule.sourceType.rawValue),
            "sourceId": .string(rule.sourceId),
            "coinReward": .number(Double(rule.coinReward)),
            "accountXp": .number(Double(rule.accountXp)),
            "enabled": .bool(rule.enabled),
            "scalingMode": .string(rule.scalingMode.rawValue),
            "maxRewardCap": rule.maxRewardCap.map { .number(Double($0)) } ?? .null,
            "skillAwards": .array(rule.skillAwards.map {
                .object(["id": .string($0.skillId), "amount": .number(Double($0.xpReward))])
            }),
            "itemAwards": .array(rule.itemAwards.map {
                .object(["id": .string($0.itemId), "amount": .number(Double($0.quantity))])
            })
        ]
    }

private func growthEarningRule(from mutation: SyncMutation) -> GrowthEarningRuleDTO? {
        guard let sourceTypeValue = mutation.payload["sourceType"]?.stringValue,
              let sourceType = GrowthSourceType(rawValue: sourceTypeValue),
              sourceType == .task,
              let sourceID = mutation.payload["sourceId"]?.stringValue else { return nil }

        func awards(_ key: String) -> [(String, Int)] {
            guard case let .array(values)? = mutation.payload[key] else { return [] }
            return values.compactMap { value in
                guard case let .object(object) = value,
                      let id = object["id"]?.stringValue,
                      let amount = object["amount"]?.numberValue else { return nil }
                return (id, Int(amount))
            }
        }

        let existing = state.growthEarningRules[sourceID]
        let skills = awards("skillAwards").map {
            GrowthEarningRuleSkillAwardDTO(skillId: $0.0, xpReward: $0.1, skill: nil)
        }
        let items = awards("itemAwards").map { itemID, quantity in
            let item = state.shopItems.first(where: { $0.id == itemID }).map {
                GrowthAwardItemDTO(id: $0.id, name: $0.title, icon: $0.icon, color: nil)
            }
            return GrowthEarningRuleItemDTO(itemId: itemID, quantity: quantity, item: item)
        }
        return GrowthEarningRuleDTO(
            id: existing?.id ?? mutation.entityId,
            sourceType: .task,
            sourceId: sourceID,
            coinReward: Int(mutation.payload["coinReward"]?.numberValue ?? 0),
            accountXp: Int(mutation.payload["accountXp"]?.numberValue ?? Double(skills.map(\.xpReward).max() ?? 0)),
            enabled: mutation.payload["enabled"] == .bool(false) ? false : true,
            scalingMode: mutation.payload["scalingMode"]?.stringValue.flatMap(GrowthScalingMode.init(rawValue:)) ?? .fixed,
            maxRewardCap: mutation.payload["maxRewardCap"]?.numberValue.map(Int.init),
            version: existing?.version ?? mutation.baseVersion ?? 1,
            skillAwards: skills,
            itemAwards: items
        )
    }
}
