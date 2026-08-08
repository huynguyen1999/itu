import SwiftUI

struct TaskSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        let settings = model.settingsStore

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Task Defaults")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Reset") {
                    settings.resetTaskDefaults()
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(iTuTheme.teal)
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Default date")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { settings.taskDefaults.date },
                    set: { settings.taskDefaults.date = $0 }
                )) {
                    ForEach(DefaultTaskDate.allCases) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.menu)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Default due time")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                TextField("e.g. 18:00", text: Binding(
                    get: { settings.taskDefaults.defaultDueTime },
                    set: { settings.taskDefaults.defaultDueTime = $0 }
                ))
                .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Default priority")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { settings.taskDefaults.priority },
                    set: { settings.taskDefaults.priority = $0 }
                )) {
                    Text("No priority").tag(TaskPriority.none)
                    Text("Low").tag(TaskPriority.low)
                    Text("Medium").tag(TaskPriority.medium)
                    Text("High").tag(TaskPriority.high)
                }
                .pickerStyle(.menu)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Default list")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { settings.taskDefaults.taskListId },
                    set: { settings.taskDefaults.taskListId = $0 }
                )) {
                    Text("Inbox").tag("")
                    ForEach(model.taskLists) { list in
                        Text(list.name).tag(list.id)
                    }
                }
                .pickerStyle(.menu)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Default estimate (minutes)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { settings.taskDefaults.defaultEstimatedMinutes ?? 0 },
                    set: { settings.taskDefaults.defaultEstimatedMinutes = $0 == 0 ? nil : $0 }
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
        .padding(16)
        .frame(width: 270)
    }
}
