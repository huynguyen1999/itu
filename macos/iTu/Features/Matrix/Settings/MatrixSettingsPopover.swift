import SwiftUI

struct MatrixSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        let settings = model.settingsStore

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Eisenhower Matrix Settings")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Reset") {
                    settings.resetMatrixSettings()
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(iTuTheme.teal)
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Urgent when due within")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                HStack(spacing: 8) {
                    TextField("Days", value: Binding(
                        get: { settings.matrixSettings.urgentDueWithinDays },
                        set: { settings.matrixSettings.urgentDueWithinDays = max(0, min(365, $0)) }
                    ), formatter: NumberFormatter())
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 60)

                    Text("days")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Urgent priorities")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                HStack(spacing: 6) {
                    ForEach([TaskPriority.high, .medium, .low, .none], id: \.self) { priority in
                        Button(priority == .none ? "None" : priority.rawValue.capitalized) {
                            togglePriority(\.urgentPriorities, priority: priority)
                        }
                        .buttonStyle(.plain)
                        .font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(settings.matrixSettings.urgentPriorities.contains(priority) ? iTuTheme.teal : Color.black.opacity(0.06))
                        .foregroundStyle(settings.matrixSettings.urgentPriorities.contains(priority) ? .white : iTuTheme.ink)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Important priorities")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                HStack(spacing: 6) {
                    ForEach([TaskPriority.high, .medium, .low, .none], id: \.self) { priority in
                        Button(priority == .none ? "None" : priority.rawValue.capitalized) {
                            togglePriority(\.importantPriorities, priority: priority)
                        }
                        .buttonStyle(.plain)
                        .font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(settings.matrixSettings.importantPriorities.contains(priority) ? iTuTheme.teal : Color.black.opacity(0.06))
                        .foregroundStyle(settings.matrixSettings.importantPriorities.contains(priority) ? .white : iTuTheme.ink)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }
            }

            Divider()

            Toggle("Manual overrides win over auto rules", isOn: Binding(
                get: { settings.matrixSettings.manualOverrideWins },
                set: { settings.matrixSettings.manualOverrideWins = $0 }
            ))
            .font(.system(size: 12))

            Toggle("Show completed tasks", isOn: Binding(
                get: { settings.matrixSettings.showCompleted },
                set: { settings.matrixSettings.showCompleted = $0 }
            ))
            .font(.system(size: 12))

            Toggle("Show won't do / canceled tasks", isOn: Binding(
                get: { settings.matrixSettings.showWontDo },
                set: { settings.matrixSettings.showWontDo = $0 }
            ))
            .font(.system(size: 12))

            VStack(alignment: .leading, spacing: 6) {
                Text("Sort quadrant tasks")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { settings.matrixSettings.sortOption },
                    set: { settings.matrixSettings.sortOption = $0 }
                )) {
                    Text("Manual order").tag(MatrixSortOption.manual)
                    Text("Due date").tag(MatrixSortOption.dueDate)
                    Text("Priority").tag(MatrixSortOption.priority)
                    Text("Title").tag(MatrixSortOption.title)
                }
                .pickerStyle(.menu)
            }
        }
        .padding(16)
        .frame(width: 290)
    }

    private func togglePriority(_ keyPath: WritableKeyPath<MatrixSettings, [TaskPriority]>, priority: TaskPriority) {
        var current = model.settingsStore.matrixSettings[keyPath: keyPath]
        if current.contains(priority) {
            current.removeAll { $0 == priority }
        } else {
            current.append(priority)
        }
        if current.isEmpty { current = [.high] }
        model.settingsStore.matrixSettings[keyPath: keyPath] = current
    }
}
