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

            Divider()

            // Task Defaults Section
            VStack(alignment: .leading, spacing: 10) {
                Text("Task Defaults")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Default due time")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)
                    TextField("e.g. 18:00", text: Binding(
                        get: { model.settingsStore.taskDefaults.defaultDueTime },
                        set: { model.settingsStore.taskDefaults.defaultDueTime = $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Default priority")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)
                    Picker("", selection: Binding(
                        get: { model.settingsStore.taskDefaults.priority },
                        set: { model.settingsStore.taskDefaults.priority = $0 }
                    )) {
                        Text("No priority").tag(TaskPriority.none)
                        Text("Low").tag(TaskPriority.low)
                        Text("Medium").tag(TaskPriority.medium)
                        Text("High").tag(TaskPriority.high)
                    }
                    .pickerStyle(.menu)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Default estimate")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)
                    Picker("", selection: Binding(
                        get: { model.settingsStore.taskDefaults.defaultEstimatedMinutes ?? 0 },
                        set: { model.settingsStore.taskDefaults.defaultEstimatedMinutes = $0 == 0 ? nil : $0 }
                    )) {
                        Text("None").tag(0)
                        Text("15 min").tag(15)
                        Text("25 min").tag(25)
                        Text("30 min").tag(30)
                        Text("45 min").tag(45)
                        Text("60 min").tag(60)
                    }
                    .pickerStyle(.menu)
                }
            }
        }
        .padding(16)
        .frame(width: 290)
    }
}
