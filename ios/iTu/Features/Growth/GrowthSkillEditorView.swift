import SwiftUI
import iTuDomain
import iTuDesignCore

public struct GrowthSkillEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    let skill: SkillNode
    let onSave: (String, String, String) -> Void

    @State private var name: String
    @State private var descriptionText: String
    @State private var selectedIcon: String
    @State private var iconSearch = ""

    public init(skill: SkillNode, onSave: @escaping (String, String, String) -> Void) {
        self.skill = skill
        self.onSave = onSave
        _name = State(initialValue: skill.name)
        _descriptionText = State(initialValue: skill.description)
        _selectedIcon = State(initialValue: skill.icon)
    }

    private var filteredIcons: [GrowthIconDescriptor] {
        let q = iconSearch.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return GrowthIconDescriptor.presets }
        return GrowthIconDescriptor.presets.filter {
            $0.label.localizedCaseInsensitiveContains(q) || $0.id.localizedCaseInsensitiveContains(q)
        }
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section("Skill Identity") {
                    TextField("Skill Name", text: $name)
                    TextField("Description", text: $descriptionText, axis: .vertical)
                        .lineLimit(2...5)
                }

                Section("Icon") {
                    HStack {
                        Image(systemName: GrowthIconDescriptor.resolve(selectedIcon).systemImage)
                            .font(.title2)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                            .frame(width: 44, height: 44)
                            .background(IOSColor.mintTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))
                        Text(GrowthIconDescriptor.resolve(selectedIcon).label)
                            .font(IOSTypography.subheadline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                    }

                    TextField("Search icons...", text: $iconSearch)

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
                        ForEach(filteredIcons.prefix(30)) { icon in
                            Button {
                                selectedIcon = icon.systemImage
                            } label: {
                                Image(systemName: icon.systemImage)
                                    .font(.title3)
                                    .frame(width: 40, height: 40)
                                    .background(
                                        selectedIcon == icon.systemImage
                                            ? IOSColor.teal(colorScheme).opacity(0.2)
                                            : IOSColor.surfaceMuted(colorScheme),
                                        in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous)
                                    )
                                    .foregroundStyle(
                                        selectedIcon == icon.systemImage
                                            ? IOSColor.teal(colorScheme)
                                            : IOSColor.ink(colorScheme)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("Edit Skill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !trimmed.isEmpty else { return }
                        onSave(trimmed, descriptionText, selectedIcon)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
