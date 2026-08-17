import SwiftUI
import iTuDomain
import iTuDesignCore

struct PlanView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var title = ""
    @FocusState private var titleFocused: Bool

    var body: some View {
        List {
            Section { SyncBanner() }
            Section("Capture") {
                HStack {
                    TextField("What needs your attention?", text: $title)
                        .accessibilityLabel("New Task title")
                        .focused($titleFocused).submitLabel(.done).onSubmit { addTask() }
                    Button { addTask() } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                    }
                    .accessibilityLabel("Add Task")
                    .buttonStyle(.plain)
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme))
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            Section("Shortcuts") {
                Button { model.requestNavigation(to: .calendar) } label: {
                    Label("Calendar", systemImage: "calendar")
                }
                Button { model.requestNavigation(to: .matrix) } label: {
                    Label("Eisenhower Matrix", systemImage: "square.grid.2x2")
                }
            }
            Section("All Tasks") {
                if model.tasks.isEmpty { Text("No tasks yet.").foregroundStyle(.secondary) }
                ForEach(model.tasks) { task in
                    HStack(spacing: 12) {
                        Button {
                            Task { await model.setTaskStatus(task, status: task.status.nextIOSWorkflowStatus) }
                        } label: {
                            Image(systemName: task.status.iosSystemImage)
                                .foregroundStyle(task.status == .completed ? iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme) : .secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Set status to \(task.status.nextIOSWorkflowStatus.displayName)")
                        NavigationLink { TaskDetailView(task: task) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(task.title).strikethrough(task.status == .completed)
                                HStack(spacing: 8) {
                                    Text(task.status.displayName)
                                    if let dueAt = task.dueAt, let dueDate = IOSProductCalendar.date(from: dueAt) {
                                        Label(dueDate.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                                    }
                                    if let estimatedMinutes = task.estimatedMinutes {
                                        Label("\(estimatedMinutes)m", systemImage: "clock")
                                    }
                                }
                                    .font(.caption)
                                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                            }
                        }
                    }
                    .accessibilityElement(children: .contain)
                }
            }
        }
        .navigationTitle("Plan")
        .preference(key: IOSNavigationDirtyPreferenceKey.self,
                    value: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [] : [.plan])
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { titleFocused = false }
            }
        }
    }

    private func addTask() {
        let value = title
        guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        title = ""; titleFocused = false
        Task { await model.createTask(title: value) }
    }
}
