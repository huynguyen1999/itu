import SwiftUI

struct UpcomingView: View {
    @Environment(AppModel.self) private var model

    @State private var newTaskTitle = ""

    var body: some View {
        let upcomingTasks = model.tasks(for: .upcoming)
        let groupedByDay = groupTasksByUpcomingDays(upcomingTasks)

        return ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Days Sections
                ForEach(groupedByDay, id: \.dateLabel) { dayGroup in
                    daySection(dayGroup)
                }
            }
            .padding(24)
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .iTuPinnedHeader {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    iTuSectionLabel(title: "PLANNING", color: iTuTheme.teal)
                    Text("Next 7 Days")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Tasks scheduled for today and the upcoming week.")
                        .font(.system(size: 13))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                quickCaptureHeader
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 18)
        }
        .background(
            LinearGradient(
                colors: [iTuTheme.canvas, iTuTheme.mintTint.opacity(0.3)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }

    private func openTaskEditor(_ task: ProductivityTask) {
        model.presentedOverlay = .taskEditor(taskID: task.id)
    }

    private var quickCaptureHeader: some View {
        HStack(spacing: 12) {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(iTuTheme.teal)

            TextField("Add task for today...", text: $newTaskTitle)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .foregroundStyle(iTuTheme.ink)
                .onSubmit(addTaskForToday)

            Button("Add") {
                addTaskForToday()
            }
            .buttonStyle(iTuPrimaryButtonStyle(height: 32))
            .disabled(newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .iTuPanel(radius: 12)
    }

    private func daySection(_ group: UpcomingDayGroup) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(group.dateLabel)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(group.isToday ? iTuTheme.teal : iTuTheme.ink)

                Text(group.subTitle)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)

                Spacer()

                Text("\(group.tasks.count)")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(iTuTheme.borderSoft)
                    .clipShape(Capsule())
            }

            if group.tasks.isEmpty {
                HStack {
                    Text("No tasks scheduled")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkFaint)
                    Spacer()
                }
                .padding(14)
                .iTuPanel(radius: 10)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(group.tasks.enumerated()), id: \.element.id) { index, task in
                        UpcomingTaskRow(task: task, onEdit: { openTaskEditor(task) })

                        if index < group.tasks.count - 1 {
                            Rectangle()
                                .fill(iTuTheme.borderSoft)
                                .frame(height: 1)
                                .padding(.leading, 44)
                        }
                    }
                }
                .iTuPanel(radius: 12)
            }
        }
    }

    private func addTaskForToday() {
        let title = newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        newTaskTitle = ""
        var comp = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        comp.hour = 18
        let todayAt18 = ISO8601DateFormatter().string(from: Calendar.current.date(from: comp) ?? Date())
        Task {
            await model.createTask(title: title, dueAt: todayAt18)
        }
    }

    private struct UpcomingDayGroup {
        let dateLabel: String
        let subTitle: String
        let isToday: Bool
        let tasks: [ProductivityTask]
    }

    private func groupTasksByUpcomingDays(_ tasks: [ProductivityTask]) -> [UpcomingDayGroup] {
        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: Date())
        let formatter = DateFormatter()

        return (0..<7).map { dayOffset in
            let date = calendar.date(byAdding: .day, value: dayOffset, to: startOfToday) ?? Date()
            let isToday = dayOffset == 0
            let isTomorrow = dayOffset == 1

            let label: String
            let subTitle: String

            if isToday {
                label = "Today"
                formatter.dateFormat = "EEE, MMM d"
                subTitle = formatter.string(from: date)
            } else if isTomorrow {
                label = "Tomorrow"
                formatter.dateFormat = "EEE, MMM d"
                subTitle = formatter.string(from: date)
            } else {
                formatter.dateFormat = "EEEE"
                label = formatter.string(from: date)
                formatter.dateFormat = "MMM d"
                subTitle = formatter.string(from: date)
            }

            let dayTasks = tasks.filter { task in
                guard let dueAt = task.dueAt,
                      let taskDate = parseISO(dueAt) else { return false }
                return calendar.isDate(taskDate, inSameDayAs: date)
            }

            return UpcomingDayGroup(
                dateLabel: label,
                subTitle: subTitle,
                isToday: isToday,
                tasks: dayTasks
            )
        }
    }

    private func parseISO(_ str: String) -> Date? {
        let fmt = ISO8601DateFormatter()
        if let d = fmt.date(from: str) { return d }
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fmt.date(from: str)
    }
}

private struct UpcomingTaskRow: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let onEdit: () -> Void
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 12) {
            Button {
                Task { await model.cycleTaskStatus(task) }
            } label: {
                if task.status == .completed {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(iTuTheme.mint)
                } else if task.status == .inProgress {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(iTuTheme.teal)
                } else {
                    Circle()
                        .stroke(iTuTheme.inkFaint, lineWidth: 1.5)
                        .frame(width: 20, height: 20)
                }
            }
            .buttonStyle(.plain)
            .pointingHandCursor()

            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .font(.system(size: 14, weight: .medium))
                    .strikethrough(task.status == .completed)
                    .foregroundStyle(task.status == .completed ? iTuTheme.inkFaint : iTuTheme.ink)

                if !task.descriptionMarkdown.isEmpty {
                    Text(task.descriptionMarkdown)
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                        .lineLimit(1)
                }
            }

            Spacer()

            if task.priority != .none {
                Image(systemName: "flag.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(priorityColor(task.priority))
            }

            TaskActionMenuButton(task: task, onOpenDetails: onEdit)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(isHovered ? iTuTheme.mintTint.opacity(0.4) : Color.clear)
        .onHover { isHovered = $0 }
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
        .taskActionMenu(for: task, onOpenDetails: onEdit)
        .pointingHandCursor()
    }

    private func priorityColor(_ priority: TaskPriority) -> Color {
        switch priority {
        case .high: iTuTheme.coral
        case .medium: iTuTheme.amber
        case .low, .none: iTuTheme.teal
        }
    }
}
