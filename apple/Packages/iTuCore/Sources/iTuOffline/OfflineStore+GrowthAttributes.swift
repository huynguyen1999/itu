import Foundation
import iTuDomain
public extension OfflineStore {
@discardableResult
    func updateGrowthAttributes(_ attributes: [GrowthSkillDTO]) throws -> OfflineSnapshot {
        state.attributes = attributes.filter(Self.isActiveAttribute).map(Self.attribute)
        try persist()
        return state
    }

@discardableResult
    func updateGrowthSkills(_ skills: [GrowthSkillDTO]) throws -> OfflineSnapshot {
        state.skills = skills.filter { $0.archivedAt == nil }.map(Self.skillNode)
        try persist()
        return state
    }

@discardableResult
    func updateGrowthAttributeMappings(_ mappings: [GrowthAttributeMappingDTO]) throws -> OfflineSnapshot {
        let grouped = Dictionary(grouping: mappings.filter(Self.isActiveMapping), by: \.skillId)
        state.growthAttributeMappings = grouped
        reapplyPendingGrowthAttributeMappingMutations()
        try persist()
        return state
    }

@discardableResult
    func upsertGrowthAttributeMappings(
        skillID: String,
        mappings: [GrowthAttributeMappingDraft]
    ) throws -> OfflineSnapshot {
        let validation = GrowthAttributeMappingRules.validate(mappings)
        guard validation.valid else { return state }
        let existing = state.growthAttributeMappings[skillID] ?? []
        let mapped = mappings.map { draft in
            GrowthAttributeMappingDTO(
                id: "\(skillID):\(draft.slot.rawValue.lowercased())",
                skillId: skillID,
                attributeId: draft.attributeId,
                slot: draft.slot,
                weight: draft.weight
            )
        }
        state.growthAttributeMappings[skillID] = mapped
        state.mutations.removeAll {
            $0.kind == "growthattributemapping.upsert" && $0.entityId == skillID
        }
        state.conflicts.removeAll {
            $0.entityType == "growthattributemapping" && $0.entityId == skillID
        }
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "growthattributemapping.upsert",
            entityId: skillID,
            baseVersion: nil,
            baseValues: existing.isEmpty ? nil : ["mappings": .array(existing.map(Self.mappingJSON))],
            payload: [
                "skillId": .string(skillID),
                "mappings": .array(mapped.map(Self.mappingJSON))
            ],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        )
        appendMutation(mutation)
        try persist()
        return state
    }

private func reapplyPendingGrowthAttributeMappingMutations() {
        for mutation in state.mutations where mutation.kind == "growthattributemapping.upsert" {
            guard let mappings = Self.growthAttributeMappings(from: mutation) else { continue }
            state.growthAttributeMappings[mutation.entityId] = mappings
        }
    }

private static func mappingJSON(_ mapping: GrowthAttributeMappingDTO) -> JSONValue {
        .object([
            "attributeId": .string(mapping.attributeId),
            "slot": .string(mapping.slot.rawValue),
            "weight": .number(Double(mapping.weight))
        ])
    }

static func growthAttributeMappings(from mutation: SyncMutation) -> [GrowthAttributeMappingDTO]? {
        guard case let .array(values)? = mutation.payload["mappings"] else { return nil }
        return values.compactMap { value in
            guard case let .object(object) = value,
                  let attributeID = object["attributeId"]?.stringValue,
                  let slotValue = object["slot"]?.stringValue,
                  let slot = GrowthAttributeMappingSlot(rawValue: slotValue),
                  let weight = object["weight"]?.numberValue else { return nil }
            return GrowthAttributeMappingDTO(
                id: "\(mutation.entityId):\(slot.rawValue.lowercased())",
                skillId: mutation.entityId,
                attributeId: attributeID,
                slot: slot,
                weight: Int(weight)
            )
        }
    }

static func decodeGrowthAttributeMappings(_ resource: JSONValue?) -> [GrowthAttributeMappingDTO]? {
        guard let resource else { return nil }
        let data = try? JSONEncoder().encode(resource)
        guard let data else { return nil }
        if let mappings = try? JSONDecoder().decode([GrowthAttributeMappingDTO].self, from: data) { return mappings }
        if let wrapper = try? JSONDecoder().decode([String: [GrowthAttributeMappingDTO]].self, from: data) {
            return wrapper["mappings"]
        }
        return nil
    }

private static func isActiveAttribute(_ dto: GrowthSkillDTO) -> Bool {
        guard dto.archivedAt == nil else { return false }
        let name = (dto.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let key = (dto.starterKey ?? dto.key ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard key != "attribute-general" && name != "general" else { return false }
        return dto.kind == nil || dto.kind == "ATTRIBUTE"
    }

private static func isActiveMapping(_ mapping: GrowthAttributeMappingDTO) -> Bool {
        mapping.skill?.archivedAt == nil && mapping.attribute?.archivedAt == nil &&
            mapping.attribute?.name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general"
    }

static func skillNode(_ dto: GrowthSkillDTO) -> SkillNode {
        SkillNode(
            id: dto.id ?? dto.key ?? UUID().uuidString,
            name: dto.name ?? dto.key ?? "Skill",
            description: dto.description ?? "Level \(dto.level ?? 1) Skill",
            level: dto.level ?? 1,
            maxLevel: dto.maxLevel ?? 5,
            icon: dto.icon ?? "sparkles",
            category: dto.category ?? "General",
            currentXP: dto.currentXp,
            nextLevelXP: dto.nextLevelXp,
            progressXP: dto.progressXp,
            requiredXP: dto.requiredXp,
            baseXp: dto.baseXp,
            archivedAt: dto.archivedAt
        )
    }

private static func attribute(_ dto: GrowthSkillDTO) -> UserAttribute {
        UserAttribute(
            id: dto.id ?? dto.key ?? UUID().uuidString,
            name: dto.name ?? dto.key ?? "Attribute",
            level: dto.level ?? 1,
            currentXP: dto.currentXp ?? 0,
            nextLevelXP: dto.nextLevelXp ?? max(1, dto.baseXp ?? 100),
            progressXP: dto.progressXp,
            requiredXP: dto.requiredXp,
            icon: dto.icon ?? "sparkles",
            color: (dto.color ?? "teal").lowercased()
        )
    }
}
