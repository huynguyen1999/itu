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
        }
        .padding(16)
        .frame(width: 260)
    }
}
