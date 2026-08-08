import SwiftUI

struct PlanSettingsPopover: View {
    let viewKey: PlanningViewKey
    @Environment(AppModel.self) private var model

    init(viewKey: PlanningViewKey) {
        self.viewKey = viewKey
    }

    public var body: some View {
        let currentSettings = model.settingsStore.planningSettings(for: viewKey)

        FeatureSettingsPopoverShell(title: "Plan view settings (\(viewKey.rawValue.capitalized))") {
            FeatureSettingsSection(title: "Display & Sorting") {
                FeatureSettingsRow(label: "Group by") {
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

                FeatureSettingsRow(label: "Sort by") {
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

            FeatureSettingsSection(title: "Task Defaults") {
                FeatureSettingsRow(label: "Default due time") {
                    TextField("e.g. 18:00", text: Binding(
                        get: { model.settingsStore.taskDefaults.defaultDueTime },
                        set: { model.settingsStore.taskDefaults.defaultDueTime = $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 80)
                }

                FeatureSettingsRow(label: "Default priority") {
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

                FeatureSettingsRow(label: "Default estimate") {
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

            Button {
                model.settingsStore.resetPlanningSettings(for: viewKey)
            } label: {
                Text("Restore default view settings")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(iTuTheme.teal)
            }
            .buttonStyle(.plain)
        }
    }
}
