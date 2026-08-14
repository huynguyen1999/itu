import AppKit
import SwiftUI

/// Ellipsis button that presents the shared TickTick-style task action popover.
///
/// Pair it with `.taskActionMenu(for:onOpenDetails:)` on the row so a right-click
/// anywhere on the row opens the same menu. The button owns its own presentation
/// state; the right-click modifier owns a separate one, and opening either
/// dismisses the other because the presenting click lands outside the open popover.
struct TaskActionMenuButton: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let onOpenDetails: () -> Void

    @State private var isPresented = false

    var body: some View {
        Button {
            isPresented.toggle()
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(iTuTheme.inkFaint)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
        .help("Task Actions")
        .popover(isPresented: $isPresented, arrowEdge: .trailing) {
            TaskContextMenuPopoverView(
                task: task,
                onDismiss: { isPresented = false },
                onOpenDetail: onOpenDetails
            )
            .environment(model)
        }
    }
}

/// Adds right-click-anywhere support that presents the native task action context menu.
extension View {
    func taskActionMenu(
        for task: ProductivityTask,
        onOpenDetails: @escaping () -> Void
    ) -> some View {
        modifier(TaskActionMenuModifier(task: task, onOpenDetails: onOpenDetails))
    }
}

private struct TaskActionMenuModifier: ViewModifier {
    let task: ProductivityTask
    let onOpenDetails: () -> Void

    func body(content: Content) -> some View {
        content
            .contextMenu {
                TaskContextMenuContent(task: task, onOpenDetails: onOpenDetails)
            }
    }
}

private struct TaskContextMenuContent: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let onOpenDetails: () -> Void

    var body: some View {
        Button {
            onOpenDetails()
        } label: {
            Label("Open Details", systemImage: "arrow.turn.down.right")
        }

        Divider()

        Menu("Status") {
            Button("Planned") {
                Task { await model.setTaskStatus(task, status: .planned) }
            }
            Button("In Progress") {
                Task { await model.setTaskStatus(task, status: .inProgress) }
            }
            Button("Completed") {
                Task { await model.setTaskStatus(task, status: .completed) }
            }
            Button("Won't Do") {
                Task { await model.setTaskStatus(task, status: .canceled) }
            }
        }

        Menu("Due Date") {
            Button("Today") {
                setDueDate(defaultDueDate(offset: 0))
            }
            Button("Tomorrow") {
                setDueDate(defaultDueDate(offset: 1))
            }
            Button("Next Week") {
                setDueDate(defaultDueDate(offset: 7))
            }
            if task.dueAt != nil {
                Divider()
                Button("Clear Date") {
                    setDueDate(nil)
                }
            }
        }

        Menu("Priority") {
            Button("High") {
                setPriority(.high)
            }
            Button("Medium") {
                setPriority(.medium)
            }
            Button("Low") {
                setPriority(.low)
            }
            Button("None") {
                setPriority(.none)
            }
        }

        if !model.taskLists.isEmpty {
            Menu("Move to List") {
                Button("Inbox") {
                    Task { await model.moveTaskToList(task, listId: nil) }
                }
                ForEach(model.taskLists) { list in
                    Button(list.name) {
                        Task { await model.moveTaskToList(task, listId: list.id) }
                    }
                }
            }
        }

        Divider()

        if task.status != .completed && task.status != .canceled && task.status != .archived {
            Button {
                Task { await model.prepareFocus(for: task) }
            } label: {
                Label("Start Focus", systemImage: "play.fill")
            }
        }

        Button(role: .destructive) {
            Task { await model.softDeleteTask(task) }
        } label: {
            Label("Move to Trash", systemImage: "trash")
        }
    }

    private func setPriority(_ priority: TaskPriority) {
        let edits = TaskEdits(
            title: task.title,
            descriptionMarkdown: task.descriptionMarkdown,
            priority: priority,
            important: task.important,
            dueAt: task.dueAt,
            estimatedMinutes: task.estimatedMinutes
        )
        Task { await model.editTask(task, edits: edits) }
    }

    private func setDueDate(_ dueAt: String?) {
        let edits = TaskEdits(
            title: task.title,
            descriptionMarkdown: task.descriptionMarkdown,
            priority: task.priority,
            important: task.important,
            dueAt: dueAt,
            estimatedMinutes: task.estimatedMinutes,
            scheduledStartAt: task.scheduledStartAt,
            scheduledEndAt: task.scheduledEndAt
        )
        Task { await model.editTask(task, edits: edits) }
    }

    private func defaultDueDate(offset: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: offset, to: Date()) ?? Date()
        let dueDate = model.settingsStore.taskDefaults.dateByApplyingDefaultDueTime(to: date)
        return ISO8601DateFormatter().string(from: dueDate)
    }
}
