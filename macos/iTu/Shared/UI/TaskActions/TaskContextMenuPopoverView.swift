import SwiftUI

// MARK: - Custom Floating Task Context Menu Popover (Matching Web TaskContextMenu.tsx 100%)

struct TaskContextMenuPopoverView: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let onDismiss: () -> Void
    let onOpenDetail: () -> Void

    @State private var showsDatePickerPopover = false
    @State private var customDueDate: Date = Date()
    @State private var customHasDate = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // STATUS Section
            VStack(alignment: .leading, spacing: 6) {
                Text("STATUS")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)

                HStack(spacing: 5) {
                    statusPill("Plan", icon: "circle", isSelected: task.status == .planned || task.status == .inbox, activeBg: iTuTheme.mintTint, activeColor: iTuTheme.teal) {
                        setStatus(.planned)
                    }
                    statusPill("Active", icon: "play.circle", isSelected: task.status == .inProgress, activeBg: Color(hex: 0xDBEAFE), activeColor: Color(hex: 0x2563EB)) {
                        setStatus(.inProgress)
                    }
                    statusPill("Done", icon: "checkmark.circle", isSelected: task.status == .completed, activeBg: Color(hex: 0xD1FAE5), activeColor: Color(hex: 0x059669)) {
                        setStatus(.completed)
                    }
                    statusPill("Cancel", icon: "xmark.circle", isSelected: task.status == .canceled, activeBg: Color(hex: 0xF3F4F6), activeColor: Color(hex: 0x6B7280)) {
                        setStatus(.canceled)
                    }
                }
            }

            // DATE Section
            VStack(alignment: .leading, spacing: 6) {
                Text("DATE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)

                HStack(spacing: 5) {
                    dateIconButton(icon: "sun.max.fill", color: Color(hex: 0xD97706), bg: Color(hex: 0xFEF3C7), help: "Today") {
                        setDueDate(todayDate())
                    }
                    dateIconButton(icon: "sunrise.fill", color: Color(hex: 0xEA580C), bg: Color(hex: 0xFFEDD5), help: "Tomorrow") {
                        setDueDate(tomorrowDate())
                    }
                    dateIconButton(icon: "calendar.badge.clock", color: Color(hex: 0x2563EB), bg: Color(hex: 0xDBEAFE), help: "Next Week") {
                        setDueDate(nextWeekDate())
                    }
                    dateIconButton(
                        icon: "calendar",
                        color: task.dueAt != nil ? iTuTheme.teal : iTuTheme.inkDim,
                        bg: task.dueAt != nil ? iTuTheme.mintTint : iTuTheme.surfaceMuted,
                        help: "Custom Date"
                    ) {
                        customDueDate = initialCustomDate
                        customHasDate = task.dueAt != nil
                        showsDatePickerPopover.toggle()
                    }
                    .popover(isPresented: $showsDatePickerPopover, arrowEdge: .bottom) {
                        TaskDueDatePickerView(
                            date: $customDueDate,
                            hasDate: $customHasDate,
                            onDone: {
                                setDueDate(customHasDate ? ISO8601DateFormatter().string(from: customDueDate) : nil)
                                showsDatePickerPopover = false
                            }
                        )
                    }

                    dateIconButton(
                        icon: "xmark.circle",
                        color: iTuTheme.inkFaint,
                        bg: iTuTheme.surfaceMuted,
                        help: "Clear Date",
                        isDisabled: task.dueAt == nil
                    ) {
                        setDueDate(nil)
                    }
                }
            }

            // PRIORITY Section
            VStack(alignment: .leading, spacing: 6) {
                Text("PRIORITY")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)

                HStack(spacing: 5) {
                    priorityPill("High", icon: "flag.fill", isSelected: task.priority == .high, color: Color(hex: 0xF43F5E), bg: Color(hex: 0xFFE4E6)) {
                        setPriority(.high)
                    }
                    priorityPill("Med", icon: "flag.fill", isSelected: task.priority == .medium, color: Color(hex: 0xF59E0B), bg: Color(hex: 0xFEF3C7)) {
                        setPriority(.medium)
                    }
                    priorityPill("Low", icon: "flag.fill", isSelected: task.priority == .low, color: Color(hex: 0x3B82F6), bg: Color(hex: 0xDBEAFE)) {
                        setPriority(.low)
                    }
                    priorityPill("None", icon: "flag", isSelected: task.priority == .none, color: iTuTheme.teal, bg: iTuTheme.mintTint) {
                        setPriority(.none)
                    }
                }
            }

            // LIST Section (Move to List)
            VStack(alignment: .leading, spacing: 6) {
                Text("LIST")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)

                if model.taskLists.isEmpty {
                    Text("No task lists available.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 5) {
                            listPill("Inbox", icon: "tray", isSelected: task.taskListId == nil) {
                                moveToList(nil)
                            }
                            ForEach(model.taskLists) { list in
                                listPill(list.name, icon: list.icon ?? "list.bullet", isSelected: task.taskListId == list.id) {
                                    moveToList(list.id)
                                }
                            }
                        }
                    }
                }
            }

            Rectangle()
                .fill(iTuTheme.border)
                .frame(height: 1)

            // ACTIONS List
            VStack(alignment: .leading, spacing: 2) {
                Button {
                    onDismiss()
                    Task { await model.prepareFocus(for: task) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.teal)
                        Text("Start Focus")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.ink)
                        Spacer()
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(task.status == .completed || task.status == .canceled || task.status == .archived)
                .pointingHandCursor()

                Button {
                    onDismiss()
                    onOpenDetail()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.turn.down.right")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("Open Details")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.ink)
                        Spacer()
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointingHandCursor()

                Button {
                    Task { await model.softDeleteTask(task) }
                    onDismiss()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "trash")
                            .font(.system(size: 12))
                            .foregroundStyle(Color(hex: 0xE11D48))
                        Text("Move to Trash")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color(hex: 0xE11D48))
                        Spacer()
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
            }
        }
        .padding(14)
        .frame(width: 320)
        .background(iTuTheme.surface)
    }

    private var initialCustomDate: Date {
        if let dueAt = task.dueAt, let date = parseISO8601Date(dueAt) {
            return date
        }
        return Date()
    }

    private func parseISO8601Date(_ dateStr: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: dateStr) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: dateStr)
    }

    private func setStatus(_ status: TaskStatus) {
        Task { await model.setTaskStatus(task, status: status) }
        onDismiss()
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
        onDismiss()
    }

    private func setDueDate(_ dueAt: String?) {
        let edits = TaskEdits(
            title: task.title,
            descriptionMarkdown: task.descriptionMarkdown,
            priority: task.priority,
            important: task.important,
            dueAt: dueAt,
            estimatedMinutes: task.estimatedMinutes
        )
        Task { await model.editTask(task, edits: edits) }
        onDismiss()
    }

    private func moveToList(_ listId: String?) {
        Task { await model.moveTaskToList(task, listId: listId) }
        onDismiss()
    }

    private func setReminder(_ remindAt: String) async {
        await model.createTaskReminder(taskId: task.id, remindAt: remindAt)
        onDismiss()
    }

    private func todayDate() -> String {
        var comp = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        comp.hour = 18
        return ISO8601DateFormatter().string(from: Calendar.current.date(from: comp) ?? Date())
    }

    private func tomorrowDate() -> String {
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        var comp = Calendar.current.dateComponents([.year, .month, .day], from: tomorrow)
        comp.hour = 9
        return ISO8601DateFormatter().string(from: Calendar.current.date(from: comp) ?? tomorrow)
    }

    private func nextWeekDate() -> String {
        let nextWeek = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
        var comp = Calendar.current.dateComponents([.year, .month, .day], from: nextWeek)
        comp.hour = 9
        return ISO8601DateFormatter().string(from: Calendar.current.date(from: comp) ?? nextWeek)
    }

    @ViewBuilder
    private func statusPill(_ label: String, icon: String, isSelected: Bool, activeBg: Color, activeColor: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? activeColor : iTuTheme.inkDim)
            .padding(.horizontal, 5)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(isSelected ? activeBg : iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(isSelected ? activeColor.opacity(0.4) : iTuTheme.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }

    @ViewBuilder
    private func dateIconButton(icon: String, color: Color, bg: Color, help: String, isDisabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(isDisabled ? iTuTheme.inkFaint.opacity(0.4) : color)
                .frame(maxWidth: .infinity, minHeight: 32)
                .background(isDisabled ? iTuTheme.surfaceMuted.opacity(0.5) : bg)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .pointingHandCursor()
        .help(help)
    }

    @ViewBuilder
    private func priorityPill(_ label: String, icon: String, isSelected: Bool, color: Color, bg: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? color : iTuTheme.inkDim)
            .padding(.horizontal, 5)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(isSelected ? bg : iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(isSelected ? color.opacity(0.4) : iTuTheme.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }

    @ViewBuilder
    private func listPill(_ label: String, icon: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(isSelected ? iTuTheme.mintTint : iTuTheme.surfaceMuted)
            .clipShape(Capsule())
            .overlay {
                Capsule()
                    .stroke(isSelected ? iTuTheme.teal.opacity(0.4) : iTuTheme.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }
}
