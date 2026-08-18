import SwiftUI
import iTuDomain
import iTuDesignCore

public struct GrowthAttributeMappingEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    let skill: SkillNode
    let attributes: [UserAttribute]
    let onSave: ([GrowthAttributeMappingDraft]) -> Void

    @State private var draft: [GrowthAttributeMappingDraft]

    public init(
        skill: SkillNode,
        attributes: [UserAttribute],
        mappings: [GrowthAttributeMappingDTO],
        onSave: @escaping ([GrowthAttributeMappingDraft]) -> Void
    ) {
        self.skill = skill
        self.attributes = attributes.filter {
            $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general"
        }
        self.onSave = onSave

        let initial = mappings
            .sorted { $0.slot.rawValue < $1.slot.rawValue }
            .map { GrowthAttributeMappingDraft(attributeId: $0.attributeId, slot: $0.slot, weight: $0.weight) }

        _draft = State(initialValue: initial.isEmpty ? GrowthAttributeMappingRules.primaryOnly : initial)
    }

    private var validation: GrowthAttributeMappingValidation {
        GrowthAttributeMappingRules.validate(draft)
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Skill XP gained from activities will be routed to your selected attributes. Historical XP remains intact.")
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }

                ForEach(Array(draft.enumerated()), id: \.offset) { index, mapping in
                    Section(mapping.slot == .primary ? "Primary Attribute (Required)" : "Secondary Attribute (Optional)") {
                        Picker("Attribute", selection: Binding(
                            get: { draft[index].attributeId },
                            set: { draft[index].attributeId = $0 }
                        )) {
                            Text("Select an Attribute").tag("")
                            ForEach(attributes) { attr in
                                Text(attr.name).tag(attr.id)
                            }
                        }

                        HStack {
                            Text("Weight")
                            Spacer()
                            Text("\(draft[index].weight)%")
                                .font(IOSTypography.headline)
                                .foregroundStyle(IOSColor.teal(colorScheme))
                        }

                        if mapping.slot == .secondary {
                            Slider(
                                value: Binding(
                                    get: { Double(draft[index].weight) },
                                    set: { newWeight in
                                        let w = Int(newWeight)
                                        draft[index].weight = w
                                        if let primaryIndex = draft.firstIndex(where: { $0.slot == .primary }) {
                                            draft[primaryIndex].weight = 100 - w
                                        }
                                    }
                                ),
                                in: 10...30,
                                step: 5
                            )
                            .tint(IOSColor.teal(colorScheme))

                            Button("Remove Secondary", role: .destructive) {
                                draft.removeAll { $0.slot == .secondary }
                                if let primaryIndex = draft.firstIndex(where: { $0.slot == .primary }) {
                                    draft[primaryIndex].weight = 100
                                }
                            }
                        }
                    }
                }

                if draft.count < 2 {
                    Section {
                        Button {
                            if let primaryIndex = draft.firstIndex(where: { $0.slot == .primary }) {
                                draft[primaryIndex].weight = 70
                            }
                            draft.append(GrowthAttributeMappingDraft(attributeId: "", slot: .secondary, weight: 30))
                        } label: {
                            Label("Add Secondary Attribute (30%)", systemImage: "plus")
                        }
                    }
                }

                if !validation.valid {
                    Section {
                        Text(validation.errors.joined(separator: " "))
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.coral(colorScheme))
                    }
                }
            }
            .navigationTitle("Map \(skill.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(draft)
                        dismiss()
                    }
                    .disabled(!validation.valid)
                }
            }
        }
    }
}
