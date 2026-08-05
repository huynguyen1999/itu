import SwiftUI

/// Hosts the app-level floating panel above the main window. One shared
/// presentation for the task editor, focus settings, and habit editors:
/// dimmed scrim, Escape or outside-click dismissal, TickTick-style panel.
struct AppOverlayHost: View {
    @Environment(AppModel.self) private var model
    let overlay: AppOverlay

    var body: some View {
        ZStack {
            Color.black.opacity(0.12)
                .ignoresSafeArea()
                .onTapGesture { model.presentedOverlay = nil }

            content
                .background(iTuTheme.canvas)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .shadow(radius: 24)
        }
        .onExitCommand { model.presentedOverlay = nil }
    }

    @ViewBuilder
    private var content: some View {
        switch overlay {
        case .taskEditor(let taskID):
            if let task = Self.resolvedTask(taskID: taskID, in: model.tasks) {
                TaskEditorView(task: task, onClose: close)
                    .frame(width: 620, height: 700)
            }
        case .focusSettings:
            FocusSettingsOverlay(timer: model.focusTimer, onClose: close)
        case .focusSoundManagement:
            FocusSoundManagementSheet(model: model, onClose: close)
        case .focusSessionEditor(let session):
            FocusRecordEditorOverlay(session: session, onClose: close)
        case .habitCreate:
            HabitEditorSheet(habit: nil, timeBlocks: model.habitTimeBlocks, onClose: close) { newHabit in
                Task { await model.saveHabit(newHabit) }
            }
        case .habitEdit(let habit):
            HabitEditorSheet(habit: habit, timeBlocks: model.habitTimeBlocks, onClose: close) { updated in
                Task { await model.saveHabit(updated) }
            }
        case .habitDetail(let habit):
            HabitDetailSheet(
                habit: habit,
                stats: model.habitStatsByID[habit.id] ?? habit.stats,
                onClose: close,
                onEdit: { model.presentedOverlay = .habitEdit(habit) }
            )
            .task { await model.refreshHabitStats(for: habit) }
        case .habitGroups:
            HabitGroupsSheet(
                timeBlocks: model.habitTimeBlocks,
                onClose: close,
                onCreate: { name in Task { await model.createHabitTimeBlock(name: name) } }
            )
        }
    }

    private func close() {
        model.presentedOverlay = nil
    }

    /// Resolves the live task for the editor; nil when the ID is missing or the
    /// task was deleted.
    static func resolvedTask(taskID: String?, in tasks: [ProductivityTask]) -> ProductivityTask? {
        guard let taskID else { return nil }
        return tasks.first { $0.id == taskID && $0.deletedAt == nil }
    }
}

// MARK: - Focus Settings

struct FocusSettingsOverlay: View {
    @Environment(AppModel.self) private var model
    let timer: FocusTimer
    let onClose: () -> Void

    @State private var notificationManager = SystemNotificationManager.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("Focus Studio Settings")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Done") { onClose() }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 28))
            }

            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Pomodoro Duration")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Stepper("\(timer.selectedMinutes) min", value: Binding(
                        get: { timer.selectedMinutes },
                        set: { timer.setDuration(minutes: $0) }
                    ), in: 5...120, step: 5)
                    .foregroundStyle(iTuTheme.ink)
                }

                Toggle(isOn: Binding(
                    get: { model.settingsStore.focusSettings.overtimeEnabled },
                    set: {
                        model.settingsStore.focusSettings.overtimeEnabled = $0
                        timer.configure(settings: model.settingsStore.focusSettings)
                    }
                )) {
                    Text("Allow overtime")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                }
                .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))

                Toggle(isOn: Binding(
                    get: { model.settingsStore.focusSettings.finishSoundEnabled },
                    set: {
                        model.settingsStore.focusSettings.finishSoundEnabled = $0
                        timer.configure(settings: model.settingsStore.focusSettings)
                    }
                )) {
                    Text("Finish sound")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                }
                .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))

                Toggle(isOn: Binding(
                    get: { model.settingsStore.focusSettings.desktopNotificationEnabled },
                    set: {
                        model.settingsStore.focusSettings.desktopNotificationEnabled = $0
                        timer.configure(settings: model.settingsStore.focusSettings)
                        if $0 && notificationManager.authorizationStatus == .notDetermined {
                            Task { await notificationManager.requestAuthorization() }
                        }
                    }
                )) {
                    Text("Desktop notification")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                }
                .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(notificationManager.statusLabel)
                        .font(.system(size: 11))
                        .foregroundStyle(notificationManager.authorizationStatus == .denied ? iTuTheme.coral : iTuTheme.inkDim)
                    Spacer()
                    if notificationManager.authorizationStatus == .notDetermined {
                        Button("Enable") {
                            Task { await notificationManager.requestAuthorization() }
                        }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 26))
                    } else if notificationManager.authorizationStatus == .denied {
                        Button("Open Settings") {
                            notificationManager.openSystemSettings()
                        }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 26))
                    }
                }

                Toggle(isOn: Binding(
                    get: { timer.compactAudio },
                    set: {
                        model.settingsStore.focusSettings.compactAudio = $0
                        timer.configure(settings: model.settingsStore.focusSettings)
                    }
                )) {
                    Text("Compact audio controls")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                }
                .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))

                Divider()

                HStack {
                    Text("Short Break Duration")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Text("5 min")
                        .font(.system(size: 13))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                HStack {
                    Text("Long Break Duration")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Text("15 min")
                        .font(.system(size: 13))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }
            .padding(16)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            )

            Spacer()
        }
        .padding(20)
        .frame(width: 420, height: 400)
        .task { await notificationManager.refreshStatus() }
    }
}

// MARK: - Focus Record Editor

struct FocusRecordEditorOverlay: View {
    @Environment(AppModel.self) private var model
    let session: FocusSession
    let onClose: () -> Void

    @State private var editStartedAt: Date
    @State private var editCompletedAt: Date
    @State private var editTaskId: String

    init(session: FocusSession, onClose: @escaping () -> Void) {
        self.session = session
        self.onClose = onClose
        _editStartedAt = State(initialValue: FocusTimer.parseDate(session.adjustedStartedAt ?? session.startedAt) ?? Date())
        _editCompletedAt = State(initialValue: FocusTimer.parseDate(
            session.adjustedCompletedAt ?? session.completedAt ?? session.startedAt
        ) ?? Date())
        _editTaskId = State(initialValue: session.taskId ?? "")
    }

    var body: some View {
        let isInvalid = editCompletedAt <= editStartedAt
        return VStack(alignment: .leading, spacing: 16) {
            Text("Edit Focus Record")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(iTuTheme.ink)
            DatePicker("Start", selection: $editStartedAt)
                .foregroundStyle(iTuTheme.ink)
            DatePicker("End", selection: $editCompletedAt)
                .foregroundStyle(iTuTheme.ink)
            Picker("Task", selection: $editTaskId) {
                Text("No task").tag("")
                ForEach(model.tasks.filter {
                    $0.deletedAt == nil && $0.status != .canceled && $0.status != .archived
                }) { task in
                    Text(task.title).tag(task.id)
                }
            }
            .foregroundStyle(iTuTheme.ink)

            if isInvalid {
                Text("End time must be after start time.")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.coral)
            }
            HStack {
                Spacer()
                Button("Cancel") { onClose() }
                    .buttonStyle(iTuGhostButtonStyle())
                Button("Save") {
                    Task {
                        await model.adjustFocusRecord(
                            session,
                            startedAt: editStartedAt,
                            completedAt: editCompletedAt,
                            taskId: editTaskId.isEmpty ? nil : editTaskId
                        )
                        onClose()
                    }
                }
                .buttonStyle(iTuPrimaryButtonStyle())
                .disabled(isInvalid || model.focusTimer.isMutating)
            }
        }
        .padding(20)
        .frame(width: 420)
    }
}
