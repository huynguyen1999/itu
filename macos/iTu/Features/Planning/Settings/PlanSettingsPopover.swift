import SwiftUI

struct PlanSettingsPopover: View {
    let viewKey: PlanningViewKey
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    init(viewKey: PlanningViewKey) {
        self.viewKey = viewKey
    }

    public var body: some View {
        let currentSettings = model.settingsStore.planningSettings(for: viewKey)

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Plan View Preferences (\(viewKey.rawValue.capitalized))")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button {
                    model.settingsStore.resetPlanningSettings(for: viewKey)
                } label: {
                    Text("Reset")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(iTuTheme.teal)
                }
                .buttonStyle(.plain)
            }

            Divider()

            // Grouping
            VStack(alignment: .leading, spacing: 6) {
                Text("Group by")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { currentSettings.groupMode },
                    set: { newGroup in
                        var updated = currentSettings
                        updated.groupMode = newGroup
                        model.settingsStore.updatePlanningSettings(for: viewKey, settings: updated)
                    }
                )) {
                    ForEach(PlanningGroupMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue.capitalized).tag(mode)
                    }
                }
                .pickerStyle(.menu)
            }

            // Sorting
            VStack(alignment: .leading, spacing: 6) {
                Text("Sort by")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { currentSettings.sortMode },
                    set: { newSort in
                        var updated = currentSettings
                        updated.sortMode = newSort
                        model.settingsStore.updatePlanningSettings(for: viewKey, settings: updated)
                    }
                )) {
                    ForEach(PlanningSortMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.menu)
            }

            Divider()

            // Toggles
            Toggle("Hide completed tasks", isOn: Binding(
                get: { currentSettings.hideCompleted },
                set: { val in
                    var updated = currentSettings
                    updated.hideCompleted = val
                    model.settingsStore.updatePlanningSettings(for: viewKey, settings: updated)
                }
            ))

            Toggle("Hide task details", isOn: Binding(
                get: { currentSettings.hideDetails },
                set: { val in
                    var updated = currentSettings
                    updated.hideDetails = val
                    model.settingsStore.updatePlanningSettings(for: viewKey, settings: updated)
                }
            ))
        }
        .padding(16)
        .frame(width: 280)
    }
}
