import Foundation
import iTuDomain
public extension OfflineStore {
@discardableResult
    func updateGrowthProfile(_ profile: GrowthProfileDTO) throws -> OfflineSnapshot {
        state.growthProfile = profile
        for mutation in state.mutations where mutation.kind == "growthprofile.update" {
            if let accountBaseXp = mutation.payload["accountBaseXp"]?.numberValue {
                state.growthProfile?.accountBaseXp = Int(accountBaseXp)
            }
            if let rewardPreset = mutation.payload["rewardPreset"]?.stringValue,
               let preset = GrowthRewardPreset(rawValue: rewardPreset) {
                state.growthProfile?.rewardPreset = preset
            }
        }
        try persist()
        return state
    }

@discardableResult
    func updateGrowthProfile(accountBaseXp: Int, rewardPreset: GrowthRewardPreset) throws -> OfflineSnapshot {
        guard var profile = state.growthProfile else { return state }
        let previousBaseXp = profile.accountBaseXp
        let previousPreset = profile.rewardPreset
        profile.accountBaseXp = max(10, min(10_000, accountBaseXp))
        profile.rewardPreset = rewardPreset
        state.growthProfile = profile
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "growthprofile.update",
            entityId: profile.id,
            baseVersion: nil,
            baseValues: [
                "accountBaseXp": .number(Double(previousBaseXp)),
                "rewardPreset": .string(previousPreset.rawValue)
            ],
            payload: [
                "accountBaseXp": .number(Double(profile.accountBaseXp)),
                "rewardPreset": .string(profile.rewardPreset.rawValue)
            ],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

@discardableResult
    func updateGrowthRewardPresetSettings(_ settings: [String: [String: GrowthRewardRuleDTO]]) throws -> OfflineSnapshot {
        state.growthRewardPresets = settings
        reapplyPendingGrowthRewardPresetMutations()
        try persist()
        return state
    }

@discardableResult
    func updateGrowthRewardPreset(
        preset: GrowthRewardPreset,
        rules: [String: GrowthRewardRuleDTO]
    ) throws -> OfflineSnapshot {
        var presetRules = state.growthRewardPresets[preset.rawValue] ?? [:]
        for (sourceType, rule) in rules {
            presetRules[sourceType] = rule
        }
        state.growthRewardPresets[preset.rawValue] = presetRules
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "growthrewardpreset.update",
            entityId: preset.rawValue,
            payload: [
                "preset": .string(preset.rawValue),
                "rules": .array(rules.sorted { $0.key < $1.key }.map { sourceType, rule in
                    .object([
                        "sourceType": .string(sourceType),
                        "coinReward": .number(Double(max(0, rule.coinReward))),
                        "accountXp": .number(Double(max(0, rule.accountXp))),
                        "xpRewardPerSkill": .number(Double(max(0, rule.xpRewardPerSkill))),
                        "scalingMode": .string(rule.scalingMode.rawValue),
                        "maxRewardCap": rule.maxRewardCap.map { .number(Double(max(1, $0))) } ?? .null
                    ])
                })
            ],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

@discardableResult
    func applyGrowthPreset(_ preset: GrowthRewardPreset) throws -> OfflineSnapshot {
        state.growthProfile?.rewardPreset = preset
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "growthpreset.apply",
            entityId: preset.rawValue,
            payload: ["preset": .string(preset.rawValue)],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

internal func reapplyPendingGrowthRewardPresetMutations() {
        for mutation in state.mutations {
            if mutation.kind == "growthpreset.apply",
               let preset = mutation.payload["preset"]?.stringValue,
               let parsed = GrowthRewardPreset(rawValue: preset) {
                state.growthProfile?.rewardPreset = parsed
            }
            guard mutation.kind == "growthrewardpreset.update",
                  let preset = mutation.payload["preset"]?.stringValue,
                  let rules = mutation.payload["rules"],
                  case let .array(values) = rules else { continue }
            for value in values {
                guard case let .object(object) = value,
                      let sourceType = object["sourceType"]?.stringValue,
                      let coinReward = object["coinReward"]?.numberValue,
                      let xpRewardPerSkill = object["xpRewardPerSkill"]?.numberValue,
                      let scalingMode = object["scalingMode"]?.stringValue,
                      let parsedMode = GrowthScalingMode(rawValue: scalingMode) else { continue }
                let maxRewardCap: Int?
                if let cap = object["maxRewardCap"]?.numberValue { maxRewardCap = Int(cap) } else { maxRewardCap = nil }
                state.growthRewardPresets[preset, default: [:]][sourceType] = GrowthRewardRuleDTO(
                    coinReward: Int(coinReward),
                    accountXp: Int(object["accountXp"]?.numberValue ?? xpRewardPerSkill),
                    xpRewardPerSkill: Int(xpRewardPerSkill),
                    scalingMode: parsedMode,
                    maxRewardCap: maxRewardCap
                )
            }
        }
    }
}
