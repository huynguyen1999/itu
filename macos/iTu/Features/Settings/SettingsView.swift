import SwiftUI
import UniformTypeIdentifiers

enum SettingsSection: String, CaseIterable, Identifiable {
    case appearance
    case tasks
    case focus
    case matrix
    case growth
    case desktop

    var id: String { rawValue }

    var label: String {
        switch self {
        case .appearance: "Appearance"
        case .tasks: "Tasks"
        case .focus: "Focus"
        case .matrix: "Matrix"
        case .growth: "Growth"
        case .desktop: "Desktop & Sync"
        }
    }

    var iconName: String {
        switch self {
        case .appearance: "paintpalette"
        case .tasks: "checkmark.square.stack"
        case .focus: "timer"
        case .matrix: "square.grid.2x2"
        case .growth: "chart.line.uptrend.xyaxis"
        case .desktop: "laptopcomputer.and.iphone"
        }
    }
}

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var selectedSection: SettingsSection = .appearance

    var body: some View {
        HStack(spacing: 0) {
            // Sidebar Navigation
            VStack(alignment: .leading, spacing: 6) {
                Text("PREFERENCES")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
                    .padding(.horizontal, 12)
                    .padding(.top, 16)
                    .padding(.bottom, 6)

                ForEach(SettingsSection.allCases) { section in
                    Button {
                        selectedSection = section
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: section.iconName)
                                .font(.system(size: 13, weight: .medium))
                                .frame(width: 18)

                            Text(section.label)
                                .font(.system(size: 13, weight: selectedSection == section ? .semibold : .regular))

                            Spacer()
                        }
                        .foregroundStyle(selectedSection == section ? iTuTheme.teal : iTuTheme.inkDim)
                        .padding(.horizontal, 12)
                        .frame(height: 36)
                        .background(selectedSection == section ? iTuTheme.mintTint : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()
                    .accessibilityAddTraits(selectedSection == section ? .isSelected : [])
                }

                Spacer()
            }
            .padding(12)
            .frame(width: 200)
            .background(iTuTheme.surface)
            .overlay(alignment: .trailing) {
                Rectangle()
                    .fill(iTuTheme.border)
                    .frame(width: 1)
            }

            // Main Content Area
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Page Header
                    VStack(alignment: .leading, spacing: 4) {
                        iTuSectionLabel(title: "Preferences & System", color: iTuTheme.teal)
                        Text("Settings")
                            .font(.system(size: 26, weight: .bold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Configure appearance, tasks, focus timers, matrix rules, and growth progression.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }

                    // Section Heading
                    VStack(alignment: .leading, spacing: 2) {
                        iTuSectionLabel(title: "SETTINGS", color: iTuTheme.teal)
                        Text(selectedSection.label)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                    }

                    // Section Details Panel
                    switch selectedSection {
                    case .appearance:
                        AppearanceSettingsPanel()
                    case .tasks:
                        TaskDefaultsSettingsPanel()
                    case .focus:
                        FocusSettingsPanel()
                    case .matrix:
                        MatrixSettingsPanel()
                    case .growth:
                        GrowthSettingsPanel()
                    case .desktop:
                        DesktopSettingsPanel()
                    }
                }
                .padding(28)
            }
            .background(iTuTheme.canvas)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .tint(iTuTheme.teal)
    }
}

// MARK: - Subpanels

private struct AppearanceSettingsPanel: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 16) {
            SettingsCardView(
                iconName: "desktopcomputer",
                title: "Theme",
                description: "Switch the app between light and dark mode."
            ) {
                Picker("Theme Mode", selection: Binding(
                    get: { model.settingsStore.themeMode },
                    set: { model.settingsStore.themeMode = $0 }
                )) {
                    ForEach(AppThemeMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 320)
            }

            SettingsCardView(
                iconName: "bell",
                title: "Notifications",
                description: "Notification delivery and system permissions controls."
            ) {
                NotificationPermissionControl()
            }

            SettingsCardView(
                iconName: "cloud",
                title: "Sync",
                description: "Cloud sync status and conflict controls remain available from the primary rail."
            ) {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.icloud")
                        .foregroundStyle(iTuTheme.teal)
                    Text("Offline-first sync active. Changes sync continuously when connected.")
                        .font(.system(size: 13))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }
        }
    }
}

private struct NotificationPermissionControl: View {
    @State private var manager = SystemNotificationManager.shared
    @State private var isRequesting = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: manager.isAuthorized ? "checkmark.circle.fill" : "bell.badge")
                    .foregroundStyle(manager.isAuthorized ? iTuTheme.mint : iTuTheme.amber)
                Text(manager.statusLabel)
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            HStack(spacing: 10) {
                if manager.authorizationStatus == .denied {
                    Button("Open System Settings") {
                        manager.openSystemSettings()
                    }
                    .buttonStyle(iTuSecondaryButtonStyle(height: 30))
                } else if !manager.isAuthorized {
                    Button(isRequesting ? "Requesting…" : "Enable Desktop Alerts") {
                        isRequesting = true
                        Task {
                            await manager.requestAuthorization()
                            isRequesting = false
                        }
                    }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 30))
                    .disabled(isRequesting)
                }
            }
        }
        .task {
            await manager.refreshStatus()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await manager.refreshStatus() }
        }
    }
}

private struct TaskDefaultsSettingsPanel: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let settings = model.settingsStore

        SettingsCardView(
            iconName: "checkmark.square",
            title: "Task defaults",
            description: "Pre-fill new tasks while keeping every task editable."
        ) {
            VStack(spacing: 0) {
                // Default Date
                HStack {
                    Image(systemName: "calendar.badge.clock")
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 20)
                    Text("Default date")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Picker("", selection: Binding(
                        get: { settings.taskDefaults.date },
                        set: { settings.taskDefaults.date = $0 }
                    )) {
                        ForEach(DefaultTaskDate.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    .frame(width: 200)
                }
                .padding(.vertical, 10)

                Divider()

                // Default Priority
                HStack {
                    Image(systemName: "flag")
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 20)
                    Text("Default priority")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Picker("", selection: Binding(
                        get: { settings.taskDefaults.priority },
                        set: { settings.taskDefaults.priority = $0 }
                    )) {
                        Text("No priority").tag(TaskPriority.none)
                        Text("Low").tag(TaskPriority.low)
                        Text("Medium").tag(TaskPriority.medium)
                        Text("High").tag(TaskPriority.high)
                    }
                    .frame(width: 160)
                }
                .padding(.vertical, 10)

                Divider()

                // Default List
                HStack {
                    Image(systemName: "tray")
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 20)
                    Text("Default list")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Picker("", selection: Binding(
                        get: { settings.taskDefaults.taskListId },
                        set: { settings.taskDefaults.taskListId = $0 }
                    )) {
                        Text("Inbox").tag("")
                        ForEach(model.taskLists) { list in
                            Text(list.name).tag(list.id)
                        }
                    }
                    .frame(width: 180)
                }
                .padding(.vertical, 10)

                Divider()

                // Footer Reset
                HStack {
                    Text("Saved on this device and applied to every new task.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                    Spacer()
                    Button("Reset defaults") {
                        settings.resetTaskDefaults()
                    }
                    .buttonStyle(iTuSecondaryButtonStyle(height: 32))
                }
                .padding(.top, 14)
            }
        }
    }
}

private struct FocusSettingsPanel: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let settings = model.settingsStore

        VStack(spacing: 16) {
            SettingsCardView(
                iconName: "timer",
                title: "Timer Defaults",
                description: "Set the timer length Focus uses before you choose a custom duration."
            ) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Default focus length (minutes)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)

                    HStack {
                        TextField("Minutes", value: Binding(
                            get: { settings.focusSettings.defaultWorkMinutes },
                            set: { settings.focusSettings.defaultWorkMinutes = max(1, min(180, $0)) }
                        ), formatter: NumberFormatter())
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 100)

                        Stepper("", value: Binding(
                            get: { settings.focusSettings.defaultWorkMinutes },
                            set: { settings.focusSettings.defaultWorkMinutes = max(1, min(180, $0)) }
                        ), in: 1...180)
                        .labelsHidden()
                    }

                    Toggle("Allow overtime", isOn: Binding(
                        get: { settings.focusSettings.overtimeEnabled },
                        set: { settings.focusSettings.overtimeEnabled = $0 }
                    ))
                    Toggle("Play finish sound", isOn: Binding(
                        get: { settings.focusSettings.finishSoundEnabled },
                        set: { settings.focusSettings.finishSoundEnabled = $0 }
                    ))
                    Toggle("Show desktop notification", isOn: Binding(
                        get: { settings.focusSettings.desktopNotificationEnabled },
                        set: { settings.focusSettings.desktopNotificationEnabled = $0 }
                    ))
                    Toggle("Compact audio controls", isOn: Binding(
                        get: { settings.focusSettings.compactAudio },
                        set: { settings.focusSettings.compactAudio = $0 }
                    ))
                }
            }

            SettingsCardView(
                iconName: "chart.line.uptrend.xyaxis",
                title: "Default Focus Growth",
                description: "Choose the XP, coins, and items awarded when a default focus session is completed."
            ) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 16) {
                        RewardBadge(icon: "sparkles", title: "+25 XP", color: iTuTheme.teal)
                        RewardBadge(icon: "dollarsign.circle.fill", title: "+10 Coins", color: iTuTheme.amber)
                    }
                    Text("Growth reward preset applied automatically upon timer completion.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }

            SettingsCardView(
                iconName: "menubar.rectangle",
                title: "Menu Bar",
                description: "Show the active focus title or a compact break progress indicator in the menu bar."
            ) {
                VStack(alignment: .leading, spacing: 10) {
                    Toggle("Show timer in the menu bar", isOn: Binding(
                        get: { settings.focusSettings.showMenuBarItem },
                        set: { settings.focusSettings.showMenuBarItem = $0 }
                    ))
                }
            }

            FocusPolicySettingsCard(settings: settings)
        }
    }
}

private struct FocusPolicySettingsCard: View {
    @Environment(AppModel.self) private var model
    @Bindable var settings: SettingsStore
    @State private var isImportingApplications = false

    var body: some View {
        SettingsCardView(
            iconName: "shield.lefthalf.filled",
            title: "Focus Policy",
            description: "Optionally restrict distracting applications and websites during a Focus Session."
        ) {
            VStack(alignment: .leading, spacing: 14) {
                FocusPolicyStatusView(enforcer: model.focusPolicyEnforcer)

                Toggle("Enable Focus Policy", isOn: $settings.focusSettings.focusPolicyEnabled)

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Blocked applications")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Spacer()
                        Button {
                            isImportingApplications = true
                        } label: {
                            Label("Choose app", systemImage: "plus")
                        }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 28))
                    }

                    if settings.focusSettings.blockedApplications.isEmpty {
                        Text("No applications selected.")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                    } else {
                        ForEach(settings.focusSettings.blockedApplications) { application in
                            HStack(spacing: 8) {
                                Image(systemName: "app.dashed")
                                    .foregroundStyle(iTuTheme.teal)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(application.displayName)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(iTuTheme.ink)
                                    Text(application.bundleIdentifier)
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundStyle(iTuTheme.inkFaint)
                                }
                                Spacer()
                                Button {
                                    settings.focusSettings.blockedApplications.removeAll { $0.id == application.id }
                                } label: {
                                    Image(systemName: "minus.circle")
                                }
                                .buttonStyle(.plain)
                                .foregroundStyle(iTuTheme.coral)
                                .help("Remove selected application")
                            }
                        }
                    }
                }

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Website patterns")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Spacer()
                        Button {
                            settings.focusSettings.blockedWebsitePatterns.append("")
                        } label: {
                            Label("Add pattern", systemImage: "plus")
                        }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 28))
                    }
                    Text("Plain text matches a URL case-insensitively; a leading * matches the exact URL.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)

                    ForEach(settings.focusSettings.blockedWebsitePatterns.indices, id: \.self) { index in
                        HStack(spacing: 8) {
                            TextField("example.com", text: Binding(
                                get: { settings.focusSettings.blockedWebsitePatterns[index] },
                                set: { settings.focusSettings.blockedWebsitePatterns[index] = $0 }
                            ))
                            .textFieldStyle(.roundedBorder)
                            Button {
                                settings.focusSettings.blockedWebsitePatterns.remove(at: index)
                            } label: {
                                Image(systemName: "minus.circle")
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(iTuTheme.coral)
                            .help("Remove pattern")
                        }
                    }
                }

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Browsers")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    ForEach(SupportedBrowser.allCases) { browser in
                        Toggle(browser.displayName, isOn: Binding(
                            get: { settings.focusSettings.enabledBrowsers.contains(browser) },
                            set: { enabled in
                                if enabled {
                                    if !settings.focusSettings.enabledBrowsers.contains(browser) {
                                        settings.focusSettings.enabledBrowsers.append(browser)
                                    }
                                } else {
                                    settings.focusSettings.enabledBrowsers.removeAll { $0 == browser }
                                }
                            }
                        ))
                    }
                }
            }
        }
        .fileImporter(
            isPresented: $isImportingApplications,
            allowedContentTypes: [.application],
            allowsMultipleSelection: true
        ) { result in
            guard case .success(let urls) = result else { return }
            for url in urls {
                let isSecurityScoped = url.startAccessingSecurityScopedResource()
                defer {
                    if isSecurityScoped { url.stopAccessingSecurityScopedResource() }
                }
                guard let bundle = Bundle(url: url), let bundleIdentifier = bundle.bundleIdentifier else { continue }
                guard bundleIdentifier != "com.itu.macos" else { continue }
                let application = BlockedApplication(
                    bundleIdentifier: bundleIdentifier,
                    displayName: bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
                        ?? bundle.object(forInfoDictionaryKey: "CFBundleName") as? String
                        ?? url.deletingPathExtension().lastPathComponent
                )
                if !settings.focusSettings.blockedApplications.contains(where: { $0.bundleIdentifier == bundleIdentifier }) {
                    settings.focusSettings.blockedApplications.append(application)
                }
            }
        }
    }
}

private struct FocusPolicyStatusView: View {
    let enforcer: FocusPolicyEnforcer

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: iconName)
                .foregroundStyle(iconColor)
            Text(text)
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
            Spacer()
            if showsOpenSettingsButton {
                Button("Open System Settings") {
                    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") {
                        NSWorkspace.shared.open(url)
                    }
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 26))
            }
        }
        .padding(10)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var iconName: String {
        switch enforcer.status {
        case .disabled: "shield.slash"
        case .inactive: "shield.lefthalf.filled"
        case .active: "checkmark.shield.fill"
        case .permissionRequired: "exclamationmark.shield.fill"
        case .enforcementFailed: "xmark.shield.fill"
        }
    }

    private var iconColor: Color {
        switch enforcer.status {
        case .active: iTuTheme.teal
        case .permissionRequired, .enforcementFailed: iTuTheme.coral
        case .disabled, .inactive: iTuTheme.inkDim
        }
    }

    private var text: String {
        switch enforcer.status {
        case .disabled:
            return "Policy disabled"
        case .inactive:
            return "Policy will start with the next work session"
        case .active:
            if let name = enforcer.lastBlockedApplicationName {
                return "\(name) was blocked"
            }
            return "Policy active"
        case .permissionRequired(let browserName):
            return "Browser automation permission required for \(browserName)"
        case .enforcementFailed(let message):
            return message
        }
    }

    private var showsOpenSettingsButton: Bool {
        switch enforcer.status {
        case .disabled: false
        case .inactive, .active, .permissionRequired, .enforcementFailed: true
        }
    }
}

private struct MatrixSettingsPanel: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let settings = model.settingsStore

        VStack(spacing: 16) {
            SettingsCardView(
                iconName: "square.grid.2x2",
                title: "Eisenhower Matrix Conditions",
                description: "Choose how tasks are placed and which completed or dismissed tasks are shown."
            ) {
                VStack(alignment: .leading, spacing: 16) {
                    // Urgent due days
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Urgent when due within")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)

                        HStack(spacing: 8) {
                            TextField("Days", value: Binding(
                                get: { settings.matrixSettings.urgentDueWithinDays },
                                set: { settings.matrixSettings.urgentDueWithinDays = max(0, min(365, $0)) }
                            ), formatter: NumberFormatter())
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 80)

                            Text("days")
                                .font(.system(size: 13))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                    }

                    Divider()

                    // Urgent priority triggers
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Urgent priority triggers")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)

                        HStack(spacing: 8) {
                            ForEach([TaskPriority.high, .medium, .low, .none], id: \.self) { priority in
                                PriorityPillButton(
                                    title: priorityTitle(priority),
                                    isSelected: settings.matrixSettings.urgentPriorities.contains(priority)
                                ) {
                                    togglePriority(\.urgentPriorities, priority: priority)
                                }
                            }
                        }
                    }

                    Divider()

                    // Important priority triggers
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Important priority triggers")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)

                        HStack(spacing: 8) {
                            ForEach([TaskPriority.high, .medium, .low, .none], id: \.self) { priority in
                                PriorityPillButton(
                                    title: priorityTitle(priority),
                                    isSelected: settings.matrixSettings.importantPriorities.contains(priority)
                                ) {
                                    togglePriority(\.importantPriorities, priority: priority)
                                }
                            }
                        }
                    }

                }
            }

            SettingsCardView(
                iconName: "arrow.counterclockwise",
                title: "Defaults",
                description: "Restore the standard Matrix classification rules."
            ) {
                Button("Restore defaults") {
                    settings.resetMatrixSettings()
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 32))
            }
        }
    }

    private func priorityTitle(_ priority: TaskPriority) -> String {
        switch priority {
        case .high: "high"
        case .medium: "medium"
        case .low: "low"
        case .none: "none"
        }
    }

    private func togglePriority(_ keyPath: WritableKeyPath<MatrixSettings, [TaskPriority]>, priority: TaskPriority) {
        var current = model.settingsStore.matrixSettings[keyPath: keyPath]
        if current.contains(priority) {
            current.removeAll { $0 == priority }
        } else {
            current.append(priority)
        }
        if current.isEmpty { current = [.high] }
        model.settingsStore.matrixSettings[keyPath: keyPath] = current
    }
}

private struct GrowthSettingsPanel: View {
    @Environment(AppModel.self) private var model
    @State private var showResetDialog = false
    @State private var accountBaseXp = 100
    @State private var rewardPreset: GrowthRewardPreset = .standard
    @State private var saveMessage: String?

    var body: some View {
        VStack(spacing: 16) {
            SettingsCardView(
                iconName: "sparkles",
                title: "Growth & Progression",
                description: "Manage the account XP curve and reward preset used by Growth."
            ) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Account base XP")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(iTuTheme.ink)
                            Text("The base value used to calculate level requirements.")
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        Spacer()
                        TextField("XP", value: Binding(
                            get: { accountBaseXp },
                            set: { accountBaseXp = max(10, min(10_000, $0)) }
                        ), formatter: NumberFormatter())
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 80)
                    }

                    Divider()

                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Reward preset")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(iTuTheme.ink)
                            Text("Controls how generous XP and coin rewards are.")
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        Spacer()
                        Picker("Reward preset", selection: $rewardPreset) {
                            ForEach(GrowthRewardPreset.allCases) { preset in
                                Text(preset.title).tag(preset)
                            }
                        }
                        .frame(width: 160)
                    }

                    HStack {
                        if let saveMessage {
                            Label(saveMessage, systemImage: "checkmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.teal)
                        } else if model.growthProfile == nil {
                            Label("Profile unavailable while offline.", systemImage: "wifi.slash")
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        Spacer()
                        Button("Save Growth Settings") {
                            Task {
                                await model.updateGrowthProfile(accountBaseXp: accountBaseXp, rewardPreset: rewardPreset)
                                saveMessage = model.errorMessage == nil ? "Saved" : nil
                            }
                        }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                        .disabled(model.growthProfile == nil || !(10...10_000).contains(accountBaseXp))
                    }

                    HStack(spacing: 20) {
                        StatBox(title: "Level", value: model.growthLevel.map { "Level \($0)" } ?? "Unavailable")
                        StatBox(title: "User Coins", value: "\(model.userCoins)")
                        StatBox(title: "Skills Active", value: "\(model.skills.filter { $0.level > 0 }.count)/\(model.skills.count)")
                    }

                    GrowthRewardPresetEditor()
                }
            }

            SettingsCardView(
                iconName: "exclamationmark.triangle",
                title: "Reset Growth Progression",
                description: "Preview and confirm a server-backed reset while preserving ledger history."
            ) {
                Button("Reset progression...") {
                    showResetDialog = true
                }
                .buttonStyle(iTuDangerButtonStyle())
                .disabled(model.skills.isEmpty)
            }
        }
        .onAppear {
            accountBaseXp = model.growthProfile?.accountBaseXp ?? 100
            rewardPreset = model.growthProfile?.rewardPreset ?? .standard
        }
        .sheet(isPresented: $showResetDialog) {
            GrowthResetSheet()
        }
    }
}

private struct GrowthRewardPresetEditor: View {
    @Environment(AppModel.self) private var model

    @State private var selectedPreset: GrowthRewardPreset = .standard
    @State private var draft: [String: GrowthRewardRuleDTO] = [:]
    @State private var isSaving = false
    @State private var statusMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()

            VStack(alignment: .leading, spacing: 3) {
                Text("Reward preset rules")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Text("Save default XP and coin values, then apply them to existing earning rules.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            Picker("Preset", selection: $selectedPreset) {
                ForEach(GrowthRewardPreset.allCases) { preset in
                    Text(preset.title).tag(preset)
                }
            }
            .onChange(of: selectedPreset) { _, _ in loadDraft() }

            if model.growthRewardPresets.isEmpty {
                Label("Reward rules are unavailable while offline.", systemImage: "wifi.slash")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            } else {
                ForEach(GrowthSourceType.allCases) { source in
                    ruleRow(source)
                }

                HStack {
                    if let statusMessage {
                        Text(statusMessage)
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.teal)
                    }
                    Spacer()
                    Button("Save Preset") { savePreset() }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 32))
                        .disabled(isSaving || draft.count != GrowthSourceType.allCases.count)
                    Button("Apply to Existing") {
                        Task { await model.applyGrowthPreset(selectedPreset) }
                    }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                    .disabled(isSaving || draft.count != GrowthSourceType.allCases.count)
                }
            }
        }
        .onAppear {
            selectedPreset = model.growthProfile?.rewardPreset ?? .standard
            loadDraft()
        }
        .onChange(of: model.growthRewardPresets) { _, _ in loadDraft() }
    }

    @ViewBuilder
    private func ruleRow(_ source: GrowthSourceType) -> some View {
        if draft[source.rawValue] != nil {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(source.title)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Text(source == .reviewDeck ? "Can scale per reviewed card." : "Earned once when completed.")
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    Spacer()
                    numericField("Coins", value: binding(for: source, keyPath: \.coinReward))
                    numericField("Account XP", value: binding(for: source, keyPath: \.accountXp))
                    numericField("Skill XP", value: binding(for: source, keyPath: \.xpRewardPerSkill))
                    Picker("Mode", selection: binding(for: source, keyPath: \.scalingMode)) {
                        ForEach(GrowthScalingMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .frame(width: 100)
                    numericField(
                        "Cap",
                        value: Binding(
                            get: { draft[source.rawValue]?.maxRewardCap ?? 0 },
                            set: { value in updateRule(source) { $0.maxRewardCap = value <= 0 ? nil : max(1, value) } }
                        )
                    )
                }
            }
            .padding(10)
            .background(iTuTheme.canvas.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        } else {
            ProgressView("Loading \(source.title)…")
                .font(.system(size: 11))
        }
    }

    private func numericField(_ label: String, value: Binding<Int>) -> some View {
        TextField(label, value: value, formatter: NumberFormatter())
            .textFieldStyle(.roundedBorder)
            .frame(width: 76)
            .help(label)
    }

    private func binding<Value>(for source: GrowthSourceType, keyPath: WritableKeyPath<GrowthRewardRuleDTO, Value>) -> Binding<Value> {
        Binding(
            get: { draft[source.rawValue]?[keyPath: keyPath] ?? GrowthRewardRuleDTO(coinReward: 0, xpRewardPerSkill: 0, scalingMode: .fixed, maxRewardCap: nil)[keyPath: keyPath] },
            set: { value in updateRule(source) { $0[keyPath: keyPath] = value } }
        )
    }

    private func updateRule(_ source: GrowthSourceType, _ update: (inout GrowthRewardRuleDTO) -> Void) {
        guard var rule = draft[source.rawValue] else { return }
        update(&rule)
        draft[source.rawValue] = rule
    }

    private func loadDraft() {
        draft = model.growthRewardPresets[selectedPreset.rawValue] ?? [:]
        statusMessage = nil
    }

    private func savePreset() {
        isSaving = true
        statusMessage = nil
        Task {
            await model.updateGrowthRewardPreset(preset: selectedPreset, rules: draft)
            isSaving = false
            statusMessage = model.errorMessage == nil ? "Saved" : nil
        }
    }
}

private struct GrowthResetSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var scope: GrowthResetScope = .skill
    @State private var selectedSkillID = ""
    @State private var keepEarningRules = true
    @State private var keepShopRewards = true
    @State private var confirmation = ""

    private var isConfirmed: Bool {
        confirmation.uppercased() == "RESET"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Reset Growth Progression", systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.coral)
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(iTuGhostButtonStyle())
            }

            Text("Resetting appends compensating adjustments so the ledger remains complete.")
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)

            Picker("Reset scope", selection: $scope) {
                ForEach(GrowthResetScope.allCases) { option in
                    Text(option.title).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: scope) { _, _ in refreshPreview() }

            if scope == .skill {
                Picker("Skill", selection: $selectedSkillID) {
                    ForEach(model.skills) { skill in
                        Text("\(skill.name) (Level \(skill.level))").tag(skill.id)
                    }
                }
                .onChange(of: selectedSkillID) { _, _ in refreshPreview() }
            }

            if scope == .full {
                Toggle("Preserve custom earning rules", isOn: $keepEarningRules)
                Toggle("Preserve shop reward items", isOn: $keepShopRewards)
            }

            if model.growthResetLoading {
                ProgressView("Loading reset impact…")
            } else if let error = model.growthResetError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.coral)
            } else if let preview = model.growthResetPreview {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Reset impact", systemImage: "shield.lefthalf.filled")
                        .font(.system(size: 12, weight: .bold))
                    ForEach(preview.affectedSkills) { skill in
                        Text("• \(skill.name): Level \(skill.currentLevel) (\(skill.xpToReset) XP) → Level \(skill.newLevel)")
                            .font(.system(size: 12))
                    }
                    if let coins = preview.coinBalanceToReset {
                        Text("• Coins reset: \(coins)")
                            .font(.system(size: 12))
                    }
                }
                .padding(12)
                .background(iTuTheme.coralTint.opacity(0.35))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            TextField("Type RESET to confirm", text: $confirmation)
                .textFieldStyle(.roundedBorder)
                .textCase(.uppercase)

            HStack {
                Spacer()
                Button("Preview Impact") { refreshPreview() }
                    .buttonStyle(iTuSecondaryButtonStyle(height: 32))
                Button("Confirm Reset", role: .destructive) {
                    Task {
                        await model.executeGrowthReset(
                            scope: scope,
                            skillId: scope == .skill ? selectedSkillID : nil,
                            keepEarningRules: keepEarningRules,
                            keepShopRewards: keepShopRewards
                        )
                        if model.growthResetError == nil { dismiss() }
                    }
                }
                .buttonStyle(iTuDangerButtonStyle())
                .disabled(!isConfirmed || model.growthResetPreview == nil || model.growthResetLoading)
            }
        }
        .padding(24)
        .frame(width: 520, height: 470)
        .onAppear {
            selectedSkillID = model.skills.first?.id ?? ""
            refreshPreview()
        }
    }

    private func refreshPreview() {
        guard scope != .skill || !selectedSkillID.isEmpty else { return }
        Task {
            await model.previewGrowthReset(scope: scope, skillId: scope == .skill ? selectedSkillID : nil)
        }
    }
}

private struct DesktopSettingsPanel: View {
    @Environment(AppModel.self) private var model
    @State private var apiURL = APIConfiguration.baseURL.absoluteString
    @State private var validationMessage: String?

    var body: some View {
        VStack(spacing: 16) {
            // Connection
            SettingsCardView(
                iconName: "network",
                title: "Connection",
                description: "Backend API server URL endpoint."
            ) {
                VStack(alignment: .leading, spacing: 10) {
                    TextField("API URL", text: $apiURL)
                        .textFieldStyle(.roundedBorder)

                    HStack {
                        Text("Changes apply to the next network request.")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                        Spacer()
                        Button("Save URL") {
                            saveAPIURL()
                        }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                    }
                }
            }

            // Account
            SettingsCardView(
                iconName: "person.crop.circle",
                title: "Account",
                description: "User authentication status."
            ) {
                VStack(alignment: .leading, spacing: 10) {
                    if let user = model.user {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Signed in as")
                                    .font(.system(size: 12))
                                    .foregroundStyle(iTuTheme.inkDim)
                                Text(user.accountLabel)
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(iTuTheme.ink)
                            }
                            Spacer()
                            Button("Sign Out") {
                                Task { await model.logout() }
                            }
                            .buttonStyle(iTuSecondaryButtonStyle(height: 32))
                        }
                    } else {
                        Text("Not signed in.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                }
            }

            // Offline Data
            SettingsCardView(
                iconName: "arrow.triangle.2.circlepath",
                title: "Offline Data & Sync",
                description: "Local storage queue and synchronization status."
            ) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Pending mutations")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Spacer()
                        Text("\(model.pendingCount)")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(iTuTheme.mintTint)
                            .foregroundStyle(iTuTheme.teal)
                            .clipShape(Capsule())
                    }

                    HStack {
                        Text("Conflicts needing attention")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Spacer()
                        Text("\(model.conflicts.count)")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(model.conflicts.isEmpty ? iTuTheme.borderSoft : iTuTheme.coralTint)
                            .foregroundStyle(model.conflicts.isEmpty ? iTuTheme.inkDim : iTuTheme.coral)
                            .clipShape(Capsule())
                    }

                    Text("Task changes are written to this Mac before iTu attempts to contact the server.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(.top, 4)
                }
            }
        }
        .alert("Connection Settings", isPresented: Binding(
            get: { validationMessage != nil },
            set: { if !$0 { validationMessage = nil } }
        )) {
            Button("OK") { validationMessage = nil }
        } message: {
            Text(validationMessage ?? "")
        }
    }

    private func saveAPIURL() {
        do {
            try APIConfiguration.saveBaseURL(apiURL)
            apiURL = APIConfiguration.baseURL.absoluteString
            validationMessage = "Saved API URL successfully."
        } catch {
            validationMessage = error.localizedDescription
        }
    }
}

// MARK: - Reusable UI Components

private struct SettingsCardView<Content: View>: View {
    let iconName: String
    let title: String
    let description: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: iconName)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(iTuTheme.teal)
                    .frame(width: 36, height: 36)
                    .background(iTuTheme.mintTint)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                Spacer()
            }

            content()
        }
        .padding(20)
        .iTuPanel(radius: 16)
    }
}

private struct PriorityPillButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .bold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? iTuTheme.mintTint : iTuTheme.surface)
                .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(isSelected ? iTuTheme.teal : iTuTheme.border, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }
}

private struct RewardBadge: View {
    let icon: String
    let title: String
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
            Text(title)
                .font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.12))
        .clipShape(Capsule())
    }
}

private struct StatBox: View {
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkFaint)
            Text(value)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(iTuTheme.ink)
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(iTuTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
