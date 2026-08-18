import SwiftUI
import iTuDomain
import iTuDesignCore

public typealias Phase6TaskDetailView = TaskDetailView

extension TaskStatus {
    var nextIOSWorkflowStatus: TaskStatus {
        switch self {
        case .inbox: return .planned
        case .planned: return .inProgress
        case .inProgress: return .completed
        case .completed: return .planned
        case .archived, .canceled: return .planned
        }
    }
}

public struct TaskDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    let task: ProductivityTask

    @State private var title: String
    @State private var descriptionMarkdown: String
    @State private var dueDate: Date
    @State private var hasDueDate: Bool
    @State private var scheduledStartDate: Date
    @State private var hasScheduledStartDate: Bool
    @State private var scheduledEndDate: Date
    @State private var hasScheduledEndDate: Bool
    @State private var estimatedMinutes: String
    @State private var priority: TaskPriority
    @State private var important: Bool

    @State private var savedTitle: String
    @State private var savedDescriptionMarkdown: String
    @State private var savedDueDate: Date
    @State private var savedHasDueDate: Bool
    @State private var savedScheduledStartDate: Date
    @State private var savedHasScheduledStartDate: Bool
    @State private var savedScheduledEndDate: Date
    @State private var savedHasScheduledEndDate: Bool
    @State private var savedEstimatedMinutes: String
    @State private var savedPriority: TaskPriority
    @State private var savedImportant: Bool

    @State private var isSaving = false
    @State private var isChangingStatus = false
    @State private var reminderDate: Date
    @State private var isCreatingReminder = false
    @State private var reminderMessage: String?
    @State private var pendingAction: PendingAction?
    @State private var showingChangesDialog = false
    @State private var showingDeleteConfirmation = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case title, description, estimatedMinutes
    }
    private enum PendingAction: Equatable {
        case back, status(TaskStatus)
    }

    public init(task: ProductivityTask) {
        let due = IOSProductCalendar.date(from: task.dueAt ?? "")
        let sStart = IOSProductCalendar.date(from: task.scheduledStartAt ?? "")
        let sEnd = IOSProductCalendar.date(from: task.scheduledEndAt ?? "")
        let initialDue = due ?? Date()
        let initialStart = sStart ?? Date()
        let initialEnd = sEnd ?? Date()
        self.task = task

        _title = State(initialValue: task.title)
        _descriptionMarkdown = State(initialValue: task.descriptionMarkdown)
        _dueDate = State(initialValue: initialDue)
        _hasDueDate = State(initialValue: due != nil)
        _scheduledStartDate = State(initialValue: initialStart)
        _hasScheduledStartDate = State(initialValue: sStart != nil)
        _scheduledEndDate = State(initialValue: initialEnd)
        _hasScheduledEndDate = State(initialValue: sEnd != nil)
        _estimatedMinutes = State(initialValue: task.estimatedMinutes.map(String.init) ?? "")
        _priority = State(initialValue: task.priority)
        _important = State(initialValue: task.important)

        _savedTitle = State(initialValue: task.title)
        _savedDescriptionMarkdown = State(initialValue: task.descriptionMarkdown)
        _savedDueDate = State(initialValue: initialDue)
        _savedHasDueDate = State(initialValue: due != nil)
        _savedScheduledStartDate = State(initialValue: initialStart)
        _savedHasScheduledStartDate = State(initialValue: sStart != nil)
        _savedScheduledEndDate = State(initialValue: initialEnd)
        _savedHasScheduledEndDate = State(initialValue: sEnd != nil)
        _savedEstimatedMinutes = State(initialValue: task.estimatedMinutes.map(String.init) ?? "")
        _savedPriority = State(initialValue: task.priority)
        _savedImportant = State(initialValue: task.important)

        _reminderDate = State(initialValue: due ?? Date().addingTimeInterval(3600))
    }

    public var body: some View {
        IOSPage {
            // Status Header Card
            statusHeaderCard

            // Inline Sync Issue Banner
            IOSSyncIssueBanner()

            // Title & Notes Card (Reading-first)
            contentCard

            // When / Scheduling Card
            whenCard

            // Plan / Priority Card
            planCard

            // Reminders Card
            remindersCard

            // Activity & Focus Trigger
            activityCard
        }
        .navigationTitle("Task Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: backOrConfirm) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Plan")
                    }
                    .foregroundStyle(IOSColor.teal(colorScheme))
                }
            }
            ToolbarItem(placement: .primaryAction) {
                if isDirty {
                    Button(isSaving ? "Saving…" : "Save") {
                        save()
                    }
                    .font(IOSTypography.headline)
                    .foregroundStyle(IOSColor.teal(colorScheme))
                    .disabled(isSaving || scheduleValidationMessage != nil || estimatedMinutesValidationMessage != nil)
                } else {
                    Menu {
                        Button(role: .destructive) {
                            showingDeleteConfirmation = true
                        } label: {
                            Label("Move to Trash", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundStyle(IOSColor.teal(colorScheme))
                    }
                }
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
            }
        }
        .confirmationDialog("Unsaved Changes", isPresented: $showingChangesDialog) {
            Button("Save Changes") {
                save { handlePendingAction() }
            }
            Button("Discard Changes", role: .destructive) {
                discardChanges()
                handlePendingAction()
            }
            Button("Cancel", role: .cancel) { pendingAction = nil }
        } message: {
            Text("Save or discard your changes before continuing.")
        }
        .confirmationDialog("Delete Task", isPresented: $showingDeleteConfirmation) {
            Button("Delete Task", role: .destructive) {
                Task {
                    await model.setTaskStatus(currentTask, status: .archived)
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This task will be moved to Trash.")
        }
        .preference(key: IOSNavigationDirtyPreferenceKey.self, value: isDirty ? [.plan] : [])
    }

    // MARK: - Status Header Card

    private var statusHeaderCard: some View {
        IOSCard {
            HStack(spacing: IOSSpacing.compact) {
                Button {
                    let next = currentTask.status == .completed ? TaskStatus.planned : TaskStatus.completed
                    setLiveTaskStatus(next)
                } label: {
                    Image(systemName: currentTask.status == .completed ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundStyle(
                            currentTask.status == .completed
                                ? IOSColor.teal(colorScheme)
                                : IOSColor.inkFaint(colorScheme)
                        )
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 2) {
                    Text(currentTask.status.displayName)
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                    Text(statusSubtitle)
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }

                Spacer()

                Button {
                    advanceStatusOrConfirm()
                } label: {
                    HStack(spacing: 4) {
                        Text(currentTask.status.nextIOSWorkflowStatus.displayName)
                        Image(systemName: "arrow.right")
                    }
                    .font(IOSTypography.captionBold)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(IOSColor.teal(colorScheme).opacity(0.12), in: Capsule())
                    .foregroundStyle(IOSColor.teal(colorScheme))
                }
                .buttonStyle(.plain)
                .disabled(isChangingStatus)
            }
        }
    }

    private var statusSubtitle: String {
        switch currentTask.status {
        case .inbox:      return "Captured in Inbox"
        case .planned:    return "Scheduled for work"
        case .inProgress: return "Currently active"
        case .completed:  return "Finished"
        case .canceled:   return "Canceled"
        case .archived:   return "Archived in Trash"
        }
    }

    // MARK: - Content Card

    private var contentCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("TASK CONTENT")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                TextField("Title", text: $title, axis: .vertical)
                    .font(IOSTypography.title)
                    .foregroundStyle(IOSColor.ink(colorScheme))
                    .focused($focusedField, equals: .title)
                    .lineLimit(1...3)

                Divider()

                ZStack(alignment: .topLeading) {
                    if descriptionMarkdown.isEmpty {
                        Text("Add notes or markdown description…")
                            .font(IOSTypography.body)
                            .foregroundStyle(IOSColor.inkFaint(colorScheme))
                            .padding(.top, 8)
                    }
                    TextEditor(text: $descriptionMarkdown)
                        .font(IOSTypography.body)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                        .frame(minHeight: 80)
                        .focused($focusedField, equals: .description)
                }
            }
        }
    }

    // MARK: - When Card

    private var whenCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("WHEN")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                // Due Date
                Toggle(isOn: $hasDueDate) {
                    Label("Due Date", systemImage: "calendar.badge.clock")
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                }
                .tint(IOSColor.teal(colorScheme))

                if hasDueDate {
                    DatePicker("", selection: $dueDate, displayedComponents: [.date, .hourAndMinute])
                        .datePickerStyle(.compact)
                        .environment(\.calendar, iTuCalendarSupport.calendar())
                        .environment(\.timeZone, IOSProductCalendar.timezone)
                        .padding(.leading, 28)
                }

                Divider()

                // Scheduled Start Date
                Toggle(isOn: $hasScheduledStartDate) {
                    Label("Scheduled Start", systemImage: "play.circle")
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                }
                .tint(IOSColor.teal(colorScheme))

                if hasScheduledStartDate {
                    DatePicker("", selection: $scheduledStartDate, displayedComponents: [.date, .hourAndMinute])
                        .datePickerStyle(.compact)
                        .environment(\.calendar, iTuCalendarSupport.calendar())
                        .environment(\.timeZone, IOSProductCalendar.timezone)
                        .padding(.leading, 28)
                }

                // Scheduled End Date
                if hasScheduledStartDate {
                    Divider()
                    Toggle(isOn: $hasScheduledEndDate) {
                        Label("Scheduled End", systemImage: "stop.circle")
                            .font(IOSTypography.headline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                    }
                    .tint(IOSColor.teal(colorScheme))

                    if hasScheduledEndDate {
                        DatePicker("", selection: $scheduledEndDate, displayedComponents: [.date, .hourAndMinute])
                            .datePickerStyle(.compact)
                            .environment(\.calendar, iTuCalendarSupport.calendar())
                            .environment(\.timeZone, IOSProductCalendar.timezone)
                            .padding(.leading, 28)
                    }
                }

                if let validation = scheduleValidationMessage {
                    Text(validation)
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.coral(colorScheme))
                        .padding(.top, 4)
                }
            }
        }
    }

    // MARK: - Plan Card

    private var planCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("PLAN")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                // Priority
                HStack {
                    Label("Priority", systemImage: "flag.fill")
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                    Spacer()
                    Picker("Priority", selection: $priority) {
                        Text("Low").tag(TaskPriority.low)
                        Text("Medium").tag(TaskPriority.medium)
                        Text("High").tag(TaskPriority.high)
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 200)
                }

                Divider()

                // Important Flag
                Toggle(isOn: $important) {
                    Label("High Impact / Important", systemImage: "star.fill")
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                }
                .tint(IOSColor.amber(colorScheme))

                Divider()

                // Estimated Time
                HStack {
                    Label("Estimate", systemImage: "hourglass")
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                    Spacer()
                    TextField("Minutes", text: $estimatedMinutes)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .font(IOSTypography.subheadline)
                        .frame(maxWidth: 80)
                        .focused($focusedField, equals: .estimatedMinutes)
                    Text("min")
                        .font(IOSTypography.subheadline)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }

                if let validation = estimatedMinutesValidationMessage {
                    Text(validation)
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.coral(colorScheme))
                }
            }
        }
    }

    // MARK: - Reminders Card

    private var remindersCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("REMINDER")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                if let reminder = activeReminder {
                    HStack {
                        Image(systemName: "bell.fill")
                            .font(.caption)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                        Text(reminderDateLabel(reminder))
                            .font(IOSTypography.subheadline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                        Spacer()
                        Button("Delete") {
                            Task {
                                try? await model.apiClient.dismissTaskReminder(id: reminder.id)
                                _ = await model.refreshNotifications()
                            }
                        }
                        .font(IOSTypography.captionBold)
                        .foregroundStyle(IOSColor.coral(colorScheme))
                    }
                } else {
                    HStack {
                        DatePicker("Remind at", selection: $reminderDate, displayedComponents: [.date, .hourAndMinute])
                            .environment(\.calendar, iTuCalendarSupport.calendar())
                            .environment(\.timeZone, IOSProductCalendar.timezone)
                        Button("Add") { createReminder() }
                            .font(IOSTypography.captionBold)
                            .buttonStyle(.bordered)
                            .tint(IOSColor.teal(colorScheme))
                            .disabled(reminderDate <= Date() || isCreatingReminder)
                    }
                }

                if let msg = reminderMessage {
                    Text(msg)
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }
            }
        }
    }

    // MARK: - Activity Card

    private var activityCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("ACTIVITY")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                HStack {
                    Text("Created")
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                    Spacer()
                    if let createdAt = currentTask.createdAt, let date = IOSProductCalendar.date(from: createdAt) {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                    }
                }

                Button {
                    model.requestNavigation(to: .focus)
                } label: {
                    HStack {
                        Image(systemName: "timer")
                        Text("Start Focus Session on Task")
                    }
                    .font(IOSTypography.subheadline)
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(IOSColor.mintTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))
                    .foregroundStyle(IOSColor.teal(colorScheme))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Helpers & Actions

    private var currentTask: ProductivityTask {
        model.tasks.first(where: { $0.id == task.id }) ?? task
    }

    private var activeReminder: TaskReminderModel? {
        currentTask.reminders?.first { $0.status == "SCHEDULED" || $0.status == "SNOOZED" }
    }

    private var isDirty: Bool {
        if title != savedTitle { return true }
        if descriptionMarkdown != savedDescriptionMarkdown { return true }
        if hasDueDate != savedHasDueDate { return true }
        if hasDueDate && abs(dueDate.timeIntervalSince(savedDueDate)) > 1 { return true }
        if hasScheduledStartDate != savedHasScheduledStartDate { return true }
        if hasScheduledStartDate && abs(scheduledStartDate.timeIntervalSince(savedScheduledStartDate)) > 1 { return true }
        if hasScheduledEndDate != savedHasScheduledEndDate { return true }
        if hasScheduledEndDate && abs(scheduledEndDate.timeIntervalSince(savedScheduledEndDate)) > 1 { return true }
        if estimatedMinutes != savedEstimatedMinutes { return true }
        if priority != savedPriority { return true }
        if important != savedImportant { return true }
        return false
    }

    private var scheduleValidationMessage: String? {
        IOSProductCalendar.taskScheduleValidation(
            start: hasScheduledStartDate ? scheduledStartDate : nil,
            end: hasScheduledEndDate ? scheduledEndDate : nil)
    }

    private var estimatedMinutesValidationMessage: String? {
        let v = estimatedMinutes.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !v.isEmpty else { return nil }
        guard let m = Int(v), m >= 0 else { return "Enter zero or more whole minutes." }
        return nil
    }

    private func save(_ completion: (() -> Void)? = nil) {
        guard scheduleValidationMessage == nil, estimatedMinutesValidationMessage == nil else { return }
        let edits = TaskEdits(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            descriptionMarkdown: descriptionMarkdown,
            priority: priority,
            important: important,
            dueAt: hasDueDate ? IOSProductCalendar.timestamp(from: dueDate) : nil,
            estimatedMinutes: Int(estimatedMinutes.trimmingCharacters(in: .whitespacesAndNewlines)),
            scheduledStartAt: hasScheduledStartDate ? IOSProductCalendar.timestamp(from: scheduledStartDate) : nil,
            scheduledEndAt: hasScheduledEndDate ? IOSProductCalendar.timestamp(from: scheduledEndDate) : nil
        )
        isSaving = true
        Task {
            guard await model.editTask(task, edits: edits) else {
                isSaving = false
                return
            }
            savedTitle = title
            savedDescriptionMarkdown = descriptionMarkdown
            savedDueDate = dueDate
            savedHasDueDate = hasDueDate
            savedScheduledStartDate = scheduledStartDate
            savedHasScheduledStartDate = hasScheduledStartDate
            savedScheduledEndDate = scheduledEndDate
            savedHasScheduledEndDate = hasScheduledEndDate
            savedEstimatedMinutes = estimatedMinutes
            savedPriority = priority
            savedImportant = important
            isSaving = false
            pendingAction = nil
            completion?()
        }
    }

    private func backOrConfirm() {
        guard isDirty else { dismiss(); return }
        pendingAction = .back
        showingChangesDialog = true
    }

    private func advanceStatusOrConfirm() {
        guard !isChangingStatus else { return }
        let status = currentTask.status.nextIOSWorkflowStatus
        guard !isDirty else {
            pendingAction = .status(status)
            showingChangesDialog = true
            return
        }
        setLiveTaskStatus(status)
    }

    private func setLiveTaskStatus(_ status: TaskStatus) {
        isChangingStatus = true
        Task {
            _ = await model.setTaskStatus(currentTask, status: status)
            isChangingStatus = false
        }
    }

    private func handlePendingAction() {
        guard let action = pendingAction else { return }
        pendingAction = nil
        switch action {
        case .back:
            dismiss()
        case .status(let next):
            setLiveTaskStatus(next)
        }
    }

    private func discardChanges() {
        title = savedTitle
        descriptionMarkdown = savedDescriptionMarkdown
        dueDate = savedDueDate
        hasDueDate = savedHasDueDate
        scheduledStartDate = savedScheduledStartDate
        hasScheduledStartDate = savedHasScheduledStartDate
        scheduledEndDate = savedScheduledEndDate
        hasScheduledEndDate = savedHasScheduledEndDate
        estimatedMinutes = savedEstimatedMinutes
        priority = savedPriority
        important = savedImportant
    }

    private func createReminder() {
        isCreatingReminder = true
        reminderMessage = nil
        Task {
            let success = await model.createTaskReminder(
                taskID: currentTask.id,
                remindAt: IOSProductCalendar.timestamp(from: reminderDate)
            )
            isCreatingReminder = false
            if success {
                reminderMessage = "Reminder scheduled."
            } else {
                reminderMessage = "Could not schedule reminder."
            }
        }
    }

    private func reminderDateLabel(_ reminder: TaskReminderModel) -> String {
        guard let date = IOSProductCalendar.date(from: reminder.remindAt) else { return reminder.remindAt }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
