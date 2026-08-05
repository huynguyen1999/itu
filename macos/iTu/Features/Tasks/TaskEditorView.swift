import SwiftUI

struct TaskEditorView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let task: ProductivityTask

    @State private var title: String
    @State private var descriptionMarkdown: String
    @State private var priority: TaskPriority
    @State private var status: TaskStatus
    @State private var important: Bool
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var showsDatePickerPopover = false
    @State private var hasSchedule: Bool
    @State private var scheduledStartDate: Date
    @State private var scheduledEndDate: Date
    @State private var recurrenceRule: String
    @State private var estimatedMinutes: Int?
    @State private var taskListId: String?
    @State private var tagIds: [String]
    @State private var newSubtaskTitle: String = ""
    @State private var showsPlanningOptions = false

    init(task: ProductivityTask) {
        self.task = task
        _title = State(initialValue: task.title)
        _descriptionMarkdown = State(initialValue: task.descriptionMarkdown)
        _priority = State(initialValue: task.priority)
        _status = State(initialValue: task.status)
        _important = State(initialValue: task.important)
        let parsedDueDate = task.dueAt.flatMap { ISO8601DateFormatter().date(from: $0) }
        _hasDueDate = State(initialValue: parsedDueDate != nil)
        _dueDate = State(initialValue: parsedDueDate ?? Date())
        let parsedScheduleStart = task.scheduledStartAt.flatMap { ISO8601DateFormatter().date(from: $0) }
        let parsedScheduleEnd = task.scheduledEndAt.flatMap { ISO8601DateFormatter().date(from: $0) }
        _hasSchedule = State(initialValue: parsedScheduleStart != nil || parsedScheduleEnd != nil)
        _scheduledStartDate = State(initialValue: parsedScheduleStart ?? Date())
        _scheduledEndDate = State(initialValue: parsedScheduleEnd ?? parsedScheduleStart ?? Date())
        _recurrenceRule = State(initialValue: task.recurrenceRule ?? "")
        _estimatedMinutes = State(initialValue: task.estimatedMinutes)
        _taskListId = State(initialValue: task.taskListId ?? task.projectId)
        _tagIds = State(initialValue: [])
    }

    var subtasks: [ProductivityTask] {
        model.tasks.filter { $0.parentId == task.id && $0.deletedAt == nil }
    }

    var currentTaskListTitle: String {
        guard let taskListId else { return "Inbox" }
        return model.taskLists.first(where: { $0.id == taskListId })?.name ?? "Inbox"
    }

    var formattedDueDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: dueDate)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header Bar (Matches Web Header Layout)
            HStack(spacing: 12) {
                // Status Check Button
                Button {
                    cycleStatus()
                } label: {
                    ZStack {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(statusFillColor)
                            .overlay(
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .stroke(statusBorderColor, lineWidth: 1.5)
                            )

                        statusIcon
                    }
                    .frame(width: 22, height: 22)
                }
                .buttonStyle(.plain)
                .help("Cycle task status (\(status.displayName))")

                // Divider
                Rectangle()
                    .fill(iTuTheme.border)
                    .frame(width: 1, height: 18)

                // Set Due Date Popover Button
                Button {
                    showsDatePickerPopover.toggle()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "calendar")
                            .font(.system(size: 12))
                            .foregroundStyle(hasDueDate ? iTuTheme.teal : iTuTheme.inkDim)
                        Text(hasDueDate ? formattedDueDate : "Set Date")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(hasDueDate ? iTuTheme.teal : iTuTheme.inkDim)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(hasDueDate ? iTuTheme.mintTint : iTuTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(hasDueDate ? iTuTheme.teal.opacity(0.4) : iTuTheme.border, lineWidth: 1)
                    }
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showsDatePickerPopover, arrowEdge: .bottom) {
                    TaskDueDatePickerView(
                        date: $dueDate,
                        hasDate: $hasDueDate,
                        onDone: { showsDatePickerPopover = false }
                    )
                }

                Spacer()

                // Priority Flag Dropdown Menu
                Menu {
                    ForEach(TaskPriority.allCases, id: \.self) { p in
                        Button {
                            priority = p
                        } label: {
                            Label(priorityLabel(p), systemImage: "flag.fill")
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "flag.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(priorityColor(priority))
                    }
                    .frame(width: 30, height: 28)
                    .background(iTuTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(iTuTheme.border, lineWidth: 1)
                    }
                }
                .menuStyle(.borderlessButton)
                .help("Priority: \(priorityLabel(priority))")

                // Close Button
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 28, height: 28)
                        .background(iTuTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(iTuTheme.surface)
            .overlay(alignment: .bottom) {
                Rectangle().fill(iTuTheme.border).frame(height: 1)
            }

            // Scrollable Body Content
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    // Task Title Input
                    TextField("Task Title", text: $title)
                        .textFieldStyle(.plain)
                        .font(.system(size: 21, weight: .bold, design: .rounded))
                        .foregroundStyle(status == .completed ? iTuTheme.inkFaint : iTuTheme.ink)
                        .strikethrough(status == .completed)

                    // Notes / Description
                    VStack(alignment: .leading, spacing: 4) {
                        ZStack(alignment: .topLeading) {
                            if descriptionMarkdown.isEmpty {
                                Text("Add notes…")
                                    .font(.system(size: 13))
                                    .foregroundStyle(iTuTheme.inkFaint)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                    .allowsHitTesting(false)
                            }
                            TextEditor(text: $descriptionMarkdown)
                                .font(.system(size: 13))
                                .scrollContentBackground(.hidden)
                                .padding(8)
                                .frame(minHeight: 88)
                        }
                        .background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(iTuTheme.border, lineWidth: 1)
                        }
                    }

                    // Growth Rewards Section
                    GrowthEarningRuleEditorView(taskID: task.id)

                    // Subtasks Section
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            HStack(spacing: 6) {
                                Image(systemName: "list.bullet")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(iTuTheme.teal)
                                Text("Subtasks (\(subtasks.filter { $0.status == .completed }.count)/\(subtasks.count))")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(iTuTheme.inkDim)
                            }
                            Spacer()
                        }

                        // Subtask items list
                        if !subtasks.isEmpty {
                            VStack(spacing: 6) {
                                ForEach(subtasks) { subtask in
                                    HStack(spacing: 10) {
                                        Button {
                                            Task { await model.toggleCompletion(subtask) }
                                        } label: {
                                            Image(systemName: subtask.status == .completed ? "checkmark.square.fill" : "square")
                                                .font(.system(size: 14))
                                                .foregroundStyle(subtask.status == .completed ? iTuTheme.teal : iTuTheme.inkFaint)
                                        }
                                        .buttonStyle(.plain)

                                        Text(subtask.title)
                                            .font(.system(size: 13))
                                            .strikethrough(subtask.status == .completed)
                                            .foregroundStyle(subtask.status == .completed ? iTuTheme.inkFaint : iTuTheme.ink)

                                        Spacer()

                                        Button {
                                            Task { await model.deleteTask(subtask) }
                                        } label: {
                                            Image(systemName: "trash")
                                                .font(.system(size: 12))
                                                .foregroundStyle(iTuTheme.coral.opacity(0.8))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 7)
                                    .background(iTuTheme.surfaceMuted)
                                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    .overlay {
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .stroke(iTuTheme.borderSoft, lineWidth: 1)
                                    }
                                }
                            }
                        }

                        // Add new subtask input (dashed row matching Web layout)
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.turn.down.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(iTuTheme.inkFaint)
                            TextField("Add subtask and press Enter…", text: $newSubtaskTitle)
                                .textFieldStyle(.plain)
                                .font(.system(size: 12))
                                .onSubmit(addSubtask)

                            if !newSubtaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Button("Add") { addSubtask() }
                                    .buttonStyle(iTuPrimaryButtonStyle(height: 24))
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(iTuTheme.border, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        }
                    }

                    // Tags Section
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            ForEach(model.tags.filter { tagIds.contains($0.id) }) { tag in
                                HStack(spacing: 4) {
                                    Text("#\(tag.name)")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundStyle(iTuTheme.teal)
                                    Button {
                                        tagIds.removeAll { $0 == tag.id }
                                    } label: {
                                        Image(systemName: "xmark")
                                            .font(.system(size: 9, weight: .bold))
                                            .foregroundStyle(iTuTheme.teal)
                                    }
                                    .buttonStyle(.plain)
                                }
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .background(iTuTheme.mintTint)
                                .clipShape(Capsule())
                                .overlay {
                                    Capsule().stroke(iTuTheme.teal.opacity(0.3), lineWidth: 1)
                                }
                            }

                            // Add Tag Menu
                            Menu {
                                ForEach(model.tags) { tag in
                                    Button {
                                        if tagIds.contains(tag.id) {
                                            tagIds.removeAll { $0 == tag.id }
                                        } else {
                                            tagIds.append(tag.id)
                                        }
                                    } label: {
                                        HStack {
                                            Text("#\(tag.name)")
                                            if tagIds.contains(tag.id) {
                                                Image(systemName: "checkmark")
                                            }
                                        }
                                    }
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "plus")
                                        .font(.system(size: 10, weight: .bold))
                                    Text("Tag")
                                        .font(.system(size: 12, weight: .medium))
                                }
                                .foregroundStyle(iTuTheme.inkDim)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(iTuTheme.surfaceMuted)
                                .clipShape(Capsule())
                                .overlay {
                                    Capsule().stroke(iTuTheme.border, lineWidth: 1)
                                }
                            }
                            .menuStyle(.borderlessButton)
                        }
                    }

                    // More Planning Options Section
                    VStack(alignment: .leading, spacing: 12) {
                        DisclosureGroup(isExpanded: $showsPlanningOptions) {
                            VStack(alignment: .leading, spacing: 12) {
                                Toggle(isOn: $important) {
                                    Label("Mark as Important", systemImage: "star.fill")
                                        .foregroundStyle(iTuTheme.inkDim)
                                }
                                .tint(iTuTheme.amber)

                                Toggle(isOn: $hasSchedule) {
                                    Label("Schedule Time", systemImage: "calendar.badge.clock")
                                        .foregroundStyle(iTuTheme.inkDim)
                                }
                                .tint(iTuTheme.teal)

                                if hasSchedule {
                                    DatePicker("Starts", selection: $scheduledStartDate)
                                        .datePickerStyle(.field)
                                    DatePicker("Ends", selection: $scheduledEndDate, in: scheduledStartDate...)
                                        .datePickerStyle(.field)
                                }

                                HStack {
                                    Label("Recurrence", systemImage: "repeat")
                                        .foregroundStyle(iTuTheme.inkDim)
                                    Spacer()
                                    TextField("Optional RRULE, e.g. FREQ=WEEKLY", text: $recurrenceRule)
                                        .textFieldStyle(.roundedBorder)
                                        .frame(width: 220)
                                }

                                HStack {
                                    Label("Estimated Minutes", systemImage: "clock")
                                        .foregroundStyle(iTuTheme.inkDim)
                                    Spacer()
                                    TextField("Minutes", value: $estimatedMinutes, format: .number)
                                        .textFieldStyle(.plain)
                                        .multilineTextAlignment(.trailing)
                                        .padding(.horizontal, 10)
                                        .frame(width: 90, height: 28)
                                        .background(iTuTheme.surface)
                                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                        .overlay {
                                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                                .stroke(iTuTheme.border, lineWidth: 1)
                                        }
                                }
                            }
                            .padding(.top, 10)
                        } label: {
                            Label("More planning options", systemImage: "slider.horizontal.3")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(iTuTheme.ink)
                        }
                    }
                    .font(.system(size: 13))
                    .padding(14)
                    .iTuPanel(radius: 12)
                }
                .padding(20)
            }
            .background(iTuTheme.canvas)

            // Footer Bar (Matches Web Footer Layout)
            HStack {
                // List / Project Selector Menu
                Menu {
                    Button {
                        taskListId = nil
                    } label: {
                        Text("Inbox")
                    }
                    ForEach(model.taskLists.filter { !$0.isDefault }) { list in
                        Button {
                            taskListId = list.id
                        } label: {
                            Text(list.name)
                        }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Text(currentTaskListTitle)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(iTuTheme.inkFaint)
                    }
                }
                .menuStyle(.borderlessButton)

                Spacer()

                // Actions: Start Focus, Delete, Save
                HStack(spacing: 10) {
                    Button {
                        dismiss()
                        Task { await model.prepareFocus(for: task) }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "play.fill")
                                .font(.system(size: 10))
                                .foregroundStyle(iTuTheme.teal)
                            Text("Start Focus")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(iTuTheme.ink)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(iTuTheme.mintTint)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(iTuTheme.teal.opacity(0.35), lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(status == .completed || status == .canceled)

                    Button {
                        dismiss()
                        Task { await model.deleteTask(task) }
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.coral)
                            .frame(width: 30, height: 30)
                            .background(iTuTheme.coralTint.opacity(0.4))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .help("Delete task")

                    Button("Save") {
                        save()
                    }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 30))
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(iTuTheme.surface)
            .overlay(alignment: .top) {
                Rectangle().fill(iTuTheme.border).frame(height: 1)
            }
        }
        .foregroundStyle(iTuTheme.ink)
        .frame(
            minWidth: 520,
            idealWidth: 580,
            maxWidth: 640,
            minHeight: 520,
            idealHeight: 660,
            maxHeight: 780
        )
        .task {
            tagIds = model.tagIdsByTaskID[task.id] ?? []
            await model.refreshGrowthRule(for: task.id)
        }
    }

    private func cycleStatus() {
        switch status {
        case .inbox, .planned:
            status = .inProgress
        case .inProgress:
            status = .completed
        case .completed:
            status = .canceled
        case .canceled, .archived:
            status = .planned
        }
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch status {
        case .completed:
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white)
        case .inProgress:
            Image(systemName: "play.fill")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(iTuTheme.syncBlue)
        case .canceled:
            Image(systemName: "xmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(iTuTheme.inkDim)
        case .inbox, .planned, .archived:
            EmptyView()
        }
    }

    private var statusFillColor: Color {
        switch status {
        case .completed:
            iTuTheme.mint
        case .inProgress:
            iTuTheme.syncBlue.opacity(0.18)
        case .canceled:
            iTuTheme.surfaceMuted
        case .inbox, .planned, .archived:
            Color.clear
        }
    }

    private var statusBorderColor: Color {
        switch status {
        case .completed:
            iTuTheme.mint
        case .inProgress:
            iTuTheme.syncBlue
        case .canceled:
            iTuTheme.inkFaint
        case .inbox, .planned, .archived:
            iTuTheme.border
        }
    }

    private func addSubtask() {
        let subTitle = newSubtaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !subTitle.isEmpty else { return }
        newSubtaskTitle = ""
        Task {
            await model.createTask(title: subTitle, parentId: task.id)
        }
    }

    private func save() {
        let dueAt = hasDueDate ? ISO8601DateFormatter().string(from: dueDate) : nil
        let scheduledStartAt = hasSchedule ? ISO8601DateFormatter().string(from: scheduledStartDate) : nil
        let scheduledEndAt = hasSchedule ? ISO8601DateFormatter().string(from: scheduledEndDate) : nil
        let edits = TaskEdits(
            title: title,
            descriptionMarkdown: descriptionMarkdown,
            priority: priority,
            important: important,
            dueAt: dueAt,
            estimatedMinutes: estimatedMinutes,
            scheduledStartAt: scheduledStartAt,
            scheduledEndAt: scheduledEndAt,
            recurrenceRule: recurrenceRule.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : recurrenceRule,
            taskListId: taskListId,
            changesTaskListId: taskListId != (task.taskListId ?? task.projectId),
            sectionId: task.sectionId,
            tagIds: tagIds
        )
        dismiss()
        Task {
            if status != task.status {
                await model.setTaskStatus(task, status: status)
            }
            await model.editTask(task, edits: edits)
        }
    }

    private func priorityLabel(_ value: TaskPriority) -> String {
        switch value {
        case .none: "None"
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        }
    }

    private func priorityColor(_ value: TaskPriority) -> Color {
        switch value {
        case .high: iTuTheme.coral
        case .medium: iTuTheme.amber
        case .low: iTuTheme.syncBlue
        case .none: iTuTheme.inkFaint
        }
    }
}

struct TaskDueDatePickerView: View {
    @Binding var date: Date
    @Binding var hasDate: Bool
    let onDone: () -> Void

    @State private var displayedMonth: Date
    @State private var showsTimePicker = false

    private var calendar: Calendar {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        return calendar
    }

    private var monthTitle: String {
        dateFormatter.string(from: displayedMonth)
    }

    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter
    }

    private var timeFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter
    }

    private var weekdaySymbols: [String] {
        let symbols = calendar.veryShortStandaloneWeekdaySymbols
        let offset = calendar.firstWeekday - 1
        return Array(symbols.dropFirst(offset)) + Array(symbols.prefix(offset))
    }

    private var monthStart: Date {
        calendar.date(from: calendar.dateComponents([.year, .month], from: displayedMonth))!
    }

    private var gridStart: Date {
        let weekday = calendar.component(.weekday, from: monthStart)
        let leadingDays = (weekday - calendar.firstWeekday + 7) % 7
        return calendar.date(byAdding: .day, value: -leadingDays, to: monthStart)!
    }

    init(date: Binding<Date>, hasDate: Binding<Bool>, onDone: @escaping () -> Void) {
        _date = date
        _hasDate = hasDate
        self.onDone = onDone

        var calendar = Calendar.current
        calendar.firstWeekday = 2
        let month = calendar.date(from: calendar.dateComponents([.year, .month], from: date.wrappedValue))!
        _displayedMonth = State(initialValue: month)
    }

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Text(monthTitle)
                    .font(.system(size: 14, weight: .semibold))
                Spacer()
                Button("Previous month", systemImage: "chevron.left") { moveMonth(by: -1) }
                Button("Today", systemImage: "circle") { displayedMonth = monthStart(for: Date()) }
                Button("Next month", systemImage: "chevron.right") { moveMonth(by: 1) }
            }
            .labelStyle(.iconOnly)
            .buttonStyle(.plain)
            .foregroundStyle(.white.opacity(0.9))

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 5) {
                ForEach(weekdaySymbols.indices, id: \.self) { index in
                    Text(weekdaySymbols[index])
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.white.opacity(0.45))
                        .frame(height: 16)
                }

                ForEach(0..<42, id: \.self) { index in
                    let day = calendar.date(byAdding: .day, value: index, to: gridStart)!
                    dayButton(for: day)
                }
            }

            Divider().overlay(Color.white.opacity(0.12))

            Button {
                showsTimePicker.toggle()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "clock")
                    Text("Time")
                    Spacer()
                    if hasDate { Text(timeFormatter.string(from: date)) }
                    Image(systemName: showsTimePicker ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                }
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.8))
            }
            .buttonStyle(.plain)

            if showsTimePicker {
                DatePicker("Time", selection: $date, displayedComponents: .hourAndMinute)
                    .labelsHidden()
                    .datePickerStyle(.field)
                    .tint(.white)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }

            HStack(spacing: 10) {
                if hasDate {
                    Button("Remove") {
                        hasDate = false
                        onDone()
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.white.opacity(0.65))
                }
                Spacer()
                Button("Done") {
                    hasDate = true
                    onDone()
                }
                .buttonStyle(iTuPrimaryButtonStyle(height: 28))
            }
        }
        .padding(12)
        .frame(width: 270)
        .background(Color(hex: 0x242424))
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private func dayButton(for day: Date) -> some View {
        let isSelected = hasDate && calendar.isDate(date, inSameDayAs: day)
        let isCurrentMonth = calendar.isDate(day, equalTo: displayedMonth, toGranularity: .month)

        Button {
            date = calendar.date(
                bySettingHour: calendar.component(.hour, from: date),
                minute: calendar.component(.minute, from: date),
                second: 0,
                of: day
            ) ?? day
            hasDate = true
        } label: {
            Text(calendar.component(.day, from: day), format: .number)
                .font(.system(size: 11, weight: isSelected ? .semibold : .regular))
                .foregroundStyle(isSelected ? .white : .white.opacity(isCurrentMonth ? 0.92 : 0.35))
                .frame(width: 28, height: 28)
                .background(isSelected ? Color(hex: 0x3B82F6) : .clear)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(dateFormatter.string(from: day))
    }

    private func moveMonth(by value: Int) {
        displayedMonth = calendar.date(byAdding: .month, value: value, to: displayedMonth) ?? displayedMonth
    }

    private func monthStart(for value: Date) -> Date {
        calendar.date(from: calendar.dateComponents([.year, .month], from: value))!
    }
}
