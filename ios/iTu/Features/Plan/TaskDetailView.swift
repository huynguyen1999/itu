import SwiftUI
import iTuDomain

struct TaskDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
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
    @FocusState private var focusedField: Field?

    private enum Field: Hashable { case estimatedMinutes }
    private enum PendingAction: Equatable { case back, status(TaskStatus) }

    init(task: ProductivityTask) {
        let due = IOSProductCalendar.date(from: task.dueAt ?? "")
        let sStart = IOSProductCalendar.date(from: task.scheduledStartAt ?? "")
        let sEnd = IOSProductCalendar.date(from: task.scheduledEndAt ?? "")
        self.task = task
        _title = State(initialValue: task.title)
        _descriptionMarkdown = State(initialValue: task.descriptionMarkdown)
        _dueDate = State(initialValue: due ?? Date()); _hasDueDate = State(initialValue: due != nil)
        _scheduledStartDate = State(initialValue: sStart ?? Date()); _hasScheduledStartDate = State(initialValue: sStart != nil)
        _scheduledEndDate = State(initialValue: sEnd ?? Date()); _hasScheduledEndDate = State(initialValue: sEnd != nil)
        _estimatedMinutes = State(initialValue: task.estimatedMinutes.map(String.init) ?? "")
        _priority = State(initialValue: task.priority); _important = State(initialValue: task.important)
        _savedTitle = State(initialValue: task.title); _savedDescriptionMarkdown = State(initialValue: task.descriptionMarkdown)
        _savedDueDate = State(initialValue: due ?? Date()); _savedHasDueDate = State(initialValue: due != nil)
        _savedScheduledStartDate = State(initialValue: sStart ?? Date()); _savedHasScheduledStartDate = State(initialValue: sStart != nil)
        _savedScheduledEndDate = State(initialValue: sEnd ?? Date()); _savedHasScheduledEndDate = State(initialValue: sEnd != nil)
        _savedEstimatedMinutes = State(initialValue: task.estimatedMinutes.map(String.init) ?? "")
        _savedPriority = State(initialValue: task.priority); _savedImportant = State(initialValue: task.important)
        _reminderDate = State(initialValue: task.reminders?.first.flatMap { IOSProductCalendar.date(from: $0.remindAt) } ?? Date().addingTimeInterval(3600))
    }

    var body: some View {
        Form {
            Section { SyncBanner() }
            Section("Status") {
                Label(currentTask.status.displayName, systemImage: currentTask.status.iosSystemImage)
                    .font(.headline)
                Button {
                    advanceStatusOrConfirm()
                } label: {
                    Label(
                        isChangingStatus ? "Updating…" : "Move to \(currentTask.status.nextIOSWorkflowStatus.displayName)",
                        systemImage: currentTask.status.nextIOSWorkflowStatus.iosSystemImage
                    )
                }
                .disabled(isChangingStatus)
                Text("Tap through Planned, In Progress, and Completed as work moves forward.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Section("Task") {
                TextField("Title", text: $title)
                TextField("Description", text: $descriptionMarkdown, axis: .vertical).lineLimit(3...8)
                Picker("Priority", selection: $priority) {
                    ForEach(TaskPriority.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                }
                Toggle("Important", isOn: $important)
            }
            Section("Schedule") {
                Toggle("Set due date", isOn: $hasDueDate)
                if hasDueDate {
                    DatePicker("Due date", selection: $dueDate, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.calendar, iTuCalendarSupport.calendar())
                        .environment(\.timeZone, IOSProductCalendar.timezone)
                }
                Toggle("Set scheduled start", isOn: $hasScheduledStartDate)
                if hasScheduledStartDate {
                    DatePicker("Scheduled start", selection: $scheduledStartDate, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.calendar, iTuCalendarSupport.calendar())
                        .environment(\.timeZone, IOSProductCalendar.timezone)
                }
                Toggle("Set scheduled end", isOn: $hasScheduledEndDate)
                if hasScheduledEndDate {
                    DatePicker("Scheduled end", selection: $scheduledEndDate, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.calendar, iTuCalendarSupport.calendar())
                        .environment(\.timeZone, IOSProductCalendar.timezone)
                }
                if let msg = scheduleValidationMessage { Text(msg).font(.footnote).foregroundStyle(.red) }
                Text("Times use Ho Chi Minh time.").font(.footnote).foregroundStyle(.secondary)
                TextField("Estimated minutes", text: $estimatedMinutes)
                    .keyboardType(.numberPad).focused($focusedField, equals: .estimatedMinutes)
                    .submitLabel(.done).onSubmit { focusedField = nil }
                if let msg = estimatedMinutesValidationMessage { Text(msg).font(.footnote).foregroundStyle(.red) }
            }
            Section("Actions") {
                Button(isSaving ? "Saving…" : "Save task") { save() }
                    .disabled(isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                              || scheduleValidationMessage != nil || estimatedMinutesValidationMessage != nil)
            }
            Section("Details") {
                if let list = model.taskLists.first(where: { $0.id == currentTask.taskListId }) {
                    Label(list.name, systemImage: list.icon ?? "folder")
                }
                if let createdAt = currentTask.createdAt, let date = IOSProductCalendar.date(from: createdAt) {
                    Label("Created \(date.formatted(date: .abbreviated, time: .shortened))", systemImage: "calendar.badge.plus")
                }
                if let updatedAt = currentTask.updatedAt, let date = IOSProductCalendar.date(from: updatedAt) {
                    Label("Updated \(date.formatted(date: .abbreviated, time: .shortened))", systemImage: "clock.arrow.circlepath")
                }
            }
            Section("Reminder") {
                if let reminder = activeReminder {
                    Label("Scheduled \(reminderDateLabel(reminder))", systemImage: "bell")
                        .foregroundStyle(.secondary)
                } else {
                    DatePicker("Remind me", selection: $reminderDate, in: Date()..., displayedComponents: [.date, .hourAndMinute])
                        .environment(\.calendar, iTuCalendarSupport.calendar())
                        .environment(\.timeZone, IOSProductCalendar.timezone)
                    Button(isCreatingReminder ? "Saving…" : "Add reminder") { createReminder() }
                        .disabled(isCreatingReminder || !model.isOnline)
                    Text(model.isOnline ? "iTu will schedule the reminder locally after the server accepts it." : "Connect to create a reminder.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let reminderMessage { Text(reminderMessage).font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Task detail").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true).interactiveDismissDisabled(isDirty)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) { Button("Back") { backOrConfirm() } }
            ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focusedField = nil } }
        }
        .confirmationDialog("Unsaved changes", isPresented: $showingChangesDialog) {
            if pendingAction == .back   { Button("Save changes") { save { dismiss() } } }
            if case let .status(status) = pendingAction {
                Button("Save and move to \(status.displayName)") { save { setLiveTaskStatus(status) } }
            }
            Button("Discard changes", role: .destructive) {
                let a = pendingAction; pendingAction = nil
                if a == .back { dismiss() }
                if case let .status(status) = a { setLiveTaskStatus(status) }
            }
            Button("Cancel", role: .cancel) { pendingAction = nil }
        } message: { Text("Save or discard your changes before continuing.") }
        .preference(key: IOSNavigationDirtyPreferenceKey.self, value: isDirty ? [.plan] : [])
    }

    private var currentTask: ProductivityTask { model.tasks.first(where: { $0.id == task.id }) ?? task }

    private var activeReminder: TaskReminderModel? {
        currentTask.reminders?.first { $0.status == "SCHEDULED" || $0.status == "SNOOZED" }
    }

    private var isDirty: Bool {
        title != savedTitle || descriptionMarkdown != savedDescriptionMarkdown ||
        hasDueDate != savedHasDueDate || (hasDueDate && dueDate != savedDueDate) ||
        hasScheduledStartDate != savedHasScheduledStartDate || (hasScheduledStartDate && scheduledStartDate != savedScheduledStartDate) ||
        hasScheduledEndDate != savedHasScheduledEndDate || (hasScheduledEndDate && scheduledEndDate != savedScheduledEndDate) ||
        estimatedMinutes != savedEstimatedMinutes || priority != savedPriority || important != savedImportant
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
            descriptionMarkdown: descriptionMarkdown, priority: priority, important: important,
            dueAt: hasDueDate ? IOSProductCalendar.timestamp(from: dueDate) : nil,
            estimatedMinutes: Int(estimatedMinutes.trimmingCharacters(in: .whitespacesAndNewlines)),
            scheduledStartAt: hasScheduledStartDate ? IOSProductCalendar.timestamp(from: scheduledStartDate) : nil,
            scheduledEndAt: hasScheduledEndDate ? IOSProductCalendar.timestamp(from: scheduledEndDate) : nil)
        isSaving = true
        Task {
            guard await model.editTask(task, edits: edits) else { isSaving = false; return }
            savedTitle = title; savedDescriptionMarkdown = descriptionMarkdown
            savedDueDate = dueDate; savedHasDueDate = hasDueDate
            savedScheduledStartDate = scheduledStartDate; savedHasScheduledStartDate = hasScheduledStartDate
            savedScheduledEndDate = scheduledEndDate; savedHasScheduledEndDate = hasScheduledEndDate
            savedEstimatedMinutes = estimatedMinutes; savedPriority = priority; savedImportant = important
            isSaving = false; pendingAction = nil; completion?()
        }
    }

    private func backOrConfirm() {
        guard isDirty else { dismiss(); return }
        pendingAction = .back; showingChangesDialog = true
    }

    private func advanceStatusOrConfirm() {
        guard !isChangingStatus else { return }
        let status = currentTask.status.nextIOSWorkflowStatus
        guard !isDirty else { pendingAction = .status(status); showingChangesDialog = true; return }
        setLiveTaskStatus(status)
    }

    private func setLiveTaskStatus(_ status: TaskStatus) {
        let t = currentTask
        isChangingStatus = true
        Task { await model.setTaskStatus(t, status: status); isChangingStatus = false }
    }

    private func reminderDateLabel(_ reminder: TaskReminderModel) -> String {
        guard let date = IOSProductCalendar.date(from: reminder.remindAt) else { return reminder.remindAt }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private func createReminder() {
        guard activeReminder == nil, reminderDate > Date(), !isCreatingReminder else { return }
        isCreatingReminder = true
        reminderMessage = nil
        Task {
            let created = await model.createTaskReminder(taskID: task.id, remindAt: IOSProductCalendar.timestamp(from: reminderDate))
            if created {
                reminderMessage = "Reminder saved."
            }
            isCreatingReminder = false
        }
    }
}

extension TaskStatus {
    var nextIOSWorkflowStatus: TaskStatus {
        switch self {
        case .inbox: .planned
        case .planned: .inProgress
        case .inProgress: .completed
        default: .planned
        }
    }

    var iosSystemImage: String {
        switch self {
        case .inbox: "tray"
        case .planned: "circle"
        case .inProgress: "play.circle.fill"
        case .completed: "checkmark.circle.fill"
        case .canceled: "xmark.circle"
        case .archived: "archivebox"
        }
    }
}
