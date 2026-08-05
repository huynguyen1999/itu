import SwiftUI

struct GrowthAttributeMappingEditorView: View {
    @Environment(\.dismiss) private var dismiss

    let skill: SkillNode
    let attributes: [UserAttribute]
    let mappings: [GrowthAttributeMappingDTO]
    let pendingMutation: SyncMutation?
    let onSave: ([GrowthAttributeMappingDraft]) -> Void
    let onRetry: (SyncMutation) -> Void

    @State private var draft: [GrowthAttributeMappingDraft]
    @State private var notice: String?

    init(
        skill: SkillNode,
        attributes: [UserAttribute],
        mappings: [GrowthAttributeMappingDTO],
        pendingMutation: SyncMutation?,
        onSave: @escaping ([GrowthAttributeMappingDraft]) -> Void,
        onRetry: @escaping (SyncMutation) -> Void
    ) {
        self.skill = skill
        self.attributes = attributes.filter {
            $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general"
        }
        self.mappings = mappings
        self.pendingMutation = pendingMutation
        self.onSave = onSave
        self.onRetry = onRetry
        let initial = mappings
            .sorted { $0.slot.rawValue < $1.slot.rawValue }
            .map { GrowthAttributeMappingDraft(attributeId: $0.attributeId, slot: $0.slot, weight: $0.weight) }
        _draft = State(initialValue: initial.isEmpty ? GrowthAttributeMappingRules.primaryOnly : initial)
    }

    private var validation: GrowthAttributeMappingValidation {
        GrowthAttributeMappingRules.validate(draft)
    }

    private var syncMessage: String? {
        guard let pendingMutation else { return nil }
        if let error = pendingMutation.lastErrorCode {
            return "Attribute mapping sync failed (\(error.lowercased().replacingOccurrences(of: "_", with: " "))). Retry sync."
        }
        return "Attribute mapping queued offline; it will sync when you reconnect."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Map \(skill.name)")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                    Text("Route Skill XP into active attributes. History stays unchanged.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(iTuGhostButtonStyle(height: 44))
            }

            ForEach(Array(draft.enumerated()), id: \.offset) { index, mapping in
                mappingRow(index: index, mapping: mapping)
            }

            if draft.count < 2 {
                Button {
                    if let primaryIndex = draft.firstIndex(where: { $0.slot == .primary }) {
                        draft[primaryIndex].weight = 70
                    }
                    draft.append(GrowthAttributeMappingDraft(attributeId: "", slot: .secondary, weight: 30))
                    notice = nil
                } label: {
                    Label("Add secondary", systemImage: "plus")
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 44))
            }

            Text(validation.valid
                 ? "One primary is required. Optional secondary is limited to 30%; weights must total 100%."
                 : validation.errors.joined(separator: " "))
                .font(.system(size: 12))
                .foregroundStyle(validation.valid ? iTuTheme.inkDim : iTuTheme.coral)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(validation.valid ? [] : .isStaticText)

            if let syncMessage {
                HStack(alignment: .center, spacing: 10) {
                    Label(syncMessage, systemImage: pendingMutation?.lastErrorCode == nil ? "arrow.triangle.2.circlepath" : "exclamationmark.triangle")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(pendingMutation?.lastErrorCode == nil ? iTuTheme.inkDim : iTuTheme.coral)
                    if pendingMutation?.lastErrorCode != nil, let pendingMutation {
                        Button("Retry sync") { onRetry(pendingMutation) }
                            .buttonStyle(iTuSecondaryButtonStyle(height: 44))
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(syncMessage)
            }
            if let notice {
                Text(notice)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(iTuTheme.teal)
                    .accessibilityAddTraits(.isStaticText)
            }

            Spacer()
            HStack {
                Spacer()
                Button("Save mapping") {
                    guard validation.valid else { return }
                    onSave(draft)
                    notice = "Attribute mapping queued. It will apply after the server confirms."
                }
                .buttonStyle(iTuPrimaryButtonStyle(height: 44))
                .disabled(!validation.valid)
            }
        }
        .padding(24)
        .frame(minWidth: 560, idealWidth: 600, minHeight: 440, idealHeight: 500)
    }

    private func mappingRow(index: Int, mapping: GrowthAttributeMappingDraft) -> some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text(mapping.slot.title + " attribute")
                    .font(.system(size: 12, weight: .semibold))
                Picker(mapping.slot.title + " attribute", selection: Binding(
                    get: { draft[index].attributeId },
                    set: { draft[index].attributeId = $0; notice = nil }
                )) {
                    Text("Choose an attribute").tag("")
                    ForEach(attributes) { attribute in
                        Text(attribute.name).tag(attribute.id)
                    }
                }
                .labelsHidden()
                .frame(minWidth: 260, minHeight: 44)
                .accessibilityLabel(mapping.slot.title + " attribute")
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Weight")
                    .font(.system(size: 12, weight: .semibold))
                Stepper(value: Binding(
                    get: { draft[index].weight },
                    set: { draft[index].weight = $0; notice = nil }
                ), in: mapping.slot == .primary ? 70...100 : 1...30) {
                    Text("\(mapping.weight)%")
                        .frame(minWidth: 58, alignment: .leading)
                }
                .frame(minHeight: 44)
                .accessibilityLabel(mapping.slot.title + " weight percentage")
            }
            if mapping.slot == .secondary {
                Button("Remove") {
                    draft.remove(at: index)
                    notice = nil
                }
                .buttonStyle(iTuGhostButtonStyle(height: 44))
            }
        }
        .padding(12)
        .iTuPanel(radius: 10)
    }
}
