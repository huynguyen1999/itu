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
            FocusSettingsOverlay(timer: model.focusTimer)
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

    @State private var showsAdvanced = false
    @State private var notificationManager = SystemNotificationManager.shared

    var body: some View {
        FeatureSettingsPopoverShell(title: "Focus settings") {
            if showsAdvanced {
                advancedContent
            } else {
                mainContent
            }
        }
        .task { await notificationManager.refreshStatus() }
    }

    private var settings: FocusSettings {
        model.settingsStore.focusSettings
    }

    private func focusBinding<Value>(_ keyPath: WritableKeyPath<FocusSettings, Value>) -> Binding<Value> {
        Binding(
            get: { model.settingsStore.focusSettings[keyPath: keyPath] },
            set: { newValue in
                model.settingsStore.focusSettings[keyPath: keyPath] = newValue
                timer.configure(settings: model.settingsStore.focusSettings)
            }
        )
    }

    private func toggleBinding(_ keyPath: WritableKeyPath<FocusSettings, Bool>) -> Binding<Bool> {
        Binding(
            get: { model.settingsStore.focusSettings[keyPath: keyPath] },
            set: { newValue in
                model.settingsStore.focusSettings[keyPath: keyPath] = newValue
                timer.configure(settings: model.settingsStore.focusSettings)
                if keyPath == \FocusSettings.desktopNotificationEnabled,
                   newValue,
                   notificationManager.authorizationStatus == .notDetermined {
                    Task { await notificationManager.requestAuthorization() }
                }
            }
        )
    }

    @ViewBuilder
    private var mainContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            FeatureSettingsSection(title: "Timer") {
                FeatureSettingsRow(label: "Default focus length") {
                    Stepper("\(settings.defaultWorkMinutes) min", value: focusBinding(\.defaultWorkMinutes), in: 1...240)
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.ink)
                }
                FeatureSettingsRow(label: "Short break") {
                    Stepper("\(settings.shortBreakMinutes) min", value: focusBinding(\.shortBreakMinutes), in: 1...60)
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.ink)
                }
                FeatureSettingsRow(label: "Long break") {
                    Stepper("\(settings.longBreakMinutes) min", value: focusBinding(\.longBreakMinutes), in: 1...120)
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.ink)
                }
                FeatureSettingsRow(label: "Long break every") {
                    Stepper("\(settings.cyclesBeforeLongBreak)", value: focusBinding(\.cyclesBeforeLongBreak), in: 1...20)
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.ink)
                    Text("sessions")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }

            FeatureSettingsSection(title: "Automation") {
                FeatureSettingsRow(label: "Auto-start breaks") {
                    Toggle("", isOn: focusBinding(\.autoStartBreaks))
                        .labelsHidden()
                        .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))
                }
                FeatureSettingsRow(label: "Auto-start focus") {
                    Toggle("", isOn: focusBinding(\.autoStartWork))
                        .labelsHidden()
                        .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))
                }
                FeatureSettingsRow(label: "Count overtime") {
                    Toggle("", isOn: focusBinding(\.overtimeEnabled))
                        .labelsHidden()
                        .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))
                }
            }

            FeatureSettingsSection(title: "Alerts") {
                FeatureSettingsRow(label: "Completion sound") {
                    Toggle("", isOn: focusBinding(\.finishSoundEnabled))
                        .labelsHidden()
                        .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))
                }
                FeatureSettingsRow(label: "Desktop notification") {
                    Toggle("", isOn: toggleBinding(\.desktopNotificationEnabled))
                        .labelsHidden()
                        .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(notificationManager.statusLabel)
                        .font(.system(size: 11))
                        .foregroundStyle(notificationManager.authorizationStatus == .denied ? iTuTheme.coral : iTuTheme.inkDim)
                    Spacer()
                    if notificationManager.authorizationStatus == .notDetermined {
                        Button("Enable") {
                            Task { await notificationManager.requestAuthorization() }
                        }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 24))
                    } else if notificationManager.authorizationStatus == .denied {
                        Button("Open Settings") {
                            notificationManager.openSystemSettings()
                        }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 24))
                    }
                }
            }

            Divider()

            Button {
                showsAdvanced = true
            } label: {
                HStack {
                    Text("Advanced settings…")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(iTuTheme.teal)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
            }
            .buttonStyle(.plain)
            .pointingHandCursor()
        }
    }

    @ViewBuilder
    private var advancedContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Button {
                showsAdvanced = false
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 11, weight: .semibold))
                    Text("Main settings")
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundStyle(iTuTheme.teal)
            }
            .buttonStyle(.plain)
            .pointingHandCursor()

            FeatureSettingsSection(title: "Audio") {
                FeatureSettingsRow(label: "Compact audio controls") {
                    Toggle("", isOn: focusBinding(\.compactAudio))
                        .labelsHidden()
                        .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))
                }
            }

            FeatureSettingsSection(title: "Menu Bar") {
                FeatureSettingsRow(label: "Show timer in menu bar") {
                    Toggle("", isOn: focusBinding(\.showMenuBarItem))
                        .labelsHidden()
                        .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))
                }
                FeatureSettingsRow(label: "Display style") {
                    Picker("", selection: focusBinding(\.menuBarDisplayMode)) {
                        ForEach(MenuBarDisplayMode.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .frame(width: 150)
                }
            }

            FeatureSettingsSection(title: "Focus Policy") {
                FeatureSettingsRow(label: "Enable Focus Policy") {
                    Toggle("", isOn: focusBinding(\.focusPolicyEnabled))
                        .labelsHidden()
                        .toggleStyle(SwitchToggleStyle(tint: iTuTheme.teal))
                }
            }
        }
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
