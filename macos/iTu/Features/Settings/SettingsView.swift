import SwiftUI
import KeyboardShortcuts
import ServiceManagement

enum SettingsSection: String, CaseIterable, Identifiable {
    case appearance
    case desktop
    case ai
    case companion

    var id: String { rawValue }

    var label: String {
        switch self {
        case .appearance: "Appearance & System"
        case .desktop: "Desktop & Sync"
        case .ai: "AI / Gemini"
        case .companion: "Companion"
        }
    }

    var iconName: String {
        switch self {
        case .appearance: "paintpalette"
        case .desktop: "laptopcomputer.and.iphone"
        case .ai: "key.fill"
        case .companion: "sidebar.squares.trailing"
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
                    case .desktop:
                        DesktopSettingsPanel()
                    case .ai:
                        AiSettingsPanel()
                    case .companion:
                        CompanionSettingsPanel()
                    }
                }
                .padding(28)
            }
            .iTuPinnedHeader { pageHeader }
            .background(iTuTheme.canvas)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .tint(iTuTheme.teal)
    }

    private var pageHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            iTuSectionLabel(title: "Preferences & System", color: iTuTheme.teal)
            Text("Settings")
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)
            Text("Configure appearance, Gemini credentials, desktop sync, and Companion window behavior.")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 18)
    }
}

private struct AiSettingsPanel: View {
    @Environment(AppModel.self) private var model
    @State private var credentials: [AiCredential] = []
    @State private var newApiKey = ""
    @State private var replacements: [String: String] = [:]
    @State private var isLoading = false
    @State private var isAdding = false
    @State private var busyCredentialID: String?
    @State private var errorMessage: String?
    @State private var credentialToRemove: AiCredential?

    var body: some View {
        VStack(spacing: 16) {
            SettingsCardView(
                iconName: "key.fill",
                title: "Gemini API keys",
                description: "Add up to five keys. They are validated before storage and encrypted by the server."
            ) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        SecureField("Paste a Gemini API key", text: $newApiKey)
                            .textFieldStyle(.roundedBorder)
                            .onSubmit { addCredential() }

                        Button(isAdding ? "Adding…" : "Add key (\(credentials.count)/5)") {
                            addCredential()
                        }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                        .disabled(credentials.count >= 5 || newApiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isAdding)
                    }

                    Text("Enabled healthy keys rotate automatically. Test Connection checks one key without changing rotation usage.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)

                    if credentials.count >= 5 {
                        Text("You have reached the five-key limit.")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(iTuTheme.amber)
                    }
                }
            }

            if isLoading {
                ProgressView("Loading Gemini credentials…")
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if credentials.isEmpty {
                Text("No Gemini keys configured. Add a key above to use AI features.")
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(iTuTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                VStack(spacing: 0) {
                    ForEach(credentials) { credential in
                        AiCredentialRow(
                            credential: credential,
                            replacement: Binding(
                                get: { replacements[credential.id] ?? "" },
                                set: { replacements[credential.id] = $0 }
                            ),
                            isBusy: busyCredentialID != nil,
                            onToggle: { toggle(credential) },
                            onTest: { test(credential) },
                            onReplace: { replace(credential) },
                            onRemove: { credentialToRemove = credential }
                        )

                        if credential.id != credentials.last?.id {
                            Divider()
                        }
                    }
                }
                .padding(16)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.coral)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task { await loadCredentials() }
        .confirmationDialog(
            "Remove this Gemini key?",
            isPresented: Binding(
                get: { credentialToRemove != nil },
                set: { if !$0 { credentialToRemove = nil } }
            ),
            presenting: credentialToRemove
        ) { credential in
            Button("Remove \(credential.keyHint)", role: .destructive) {
                remove(credential)
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("Removed keys will not be selected for new AI requests.")
        }
    }

    private func loadCredentials() async {
        isLoading = true
        do {
            credentials = try await model.apiClient.fetchAiCredentials()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func addCredential() {
        let value = newApiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, credentials.count < 5, !isAdding else { return }
        isAdding = true
        errorMessage = nil
        Task {
            do {
                _ = try await model.apiClient.addAiCredential(apiKey: value)
                newApiKey = ""
                await loadCredentials()
            } catch {
                errorMessage = error.localizedDescription
            }
            isAdding = false
        }
    }

    private func toggle(_ credential: AiCredential) {
        busyCredentialID = credential.id
        errorMessage = nil
        Task {
            do {
                _ = try await model.apiClient.updateAiCredential(id: credential.id, enabled: !credential.enabled)
                await loadCredentials()
            } catch {
                errorMessage = error.localizedDescription
            }
            busyCredentialID = nil
        }
    }

    private func test(_ credential: AiCredential) {
        busyCredentialID = credential.id
        errorMessage = nil
        Task {
            do {
                _ = try await model.apiClient.testAiCredential(id: credential.id)
                await loadCredentials()
            } catch {
                errorMessage = error.localizedDescription
            }
            busyCredentialID = nil
        }
    }

    private func replace(_ credential: AiCredential) {
        let value = replacements[credential.id]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !value.isEmpty else { return }
        busyCredentialID = credential.id
        errorMessage = nil
        Task {
            do {
                _ = try await model.apiClient.updateAiCredential(id: credential.id, apiKey: value)
                replacements[credential.id] = ""
                await loadCredentials()
            } catch {
                errorMessage = error.localizedDescription
            }
            busyCredentialID = nil
        }
    }

    private func remove(_ credential: AiCredential) {
        credentialToRemove = nil
        busyCredentialID = credential.id
        errorMessage = nil
        Task {
            do {
                try await model.apiClient.removeAiCredential(id: credential.id)
                await loadCredentials()
            } catch {
                errorMessage = error.localizedDescription
            }
            busyCredentialID = nil
        }
    }
}

private struct AiCredentialRow: View {
    let credential: AiCredential
    @Binding var replacement: String
    let isBusy: Bool
    let onToggle: () -> Void
    let onTest: () -> Void
    let onReplace: () -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: credential.usable ? "checkmark.circle.fill" : "exclamationmark.circle")
                    .foregroundStyle(statusColor)

                Text(credential.keyHint)
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(iTuTheme.ink)

                Text(credential.status)
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(statusColor)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(statusColor.opacity(0.12))
                    .clipShape(Capsule())

                Spacer()

                Button(credential.enabled ? "Disable" : "Enable", action: onToggle)
                    .buttonStyle(iTuSecondaryButtonStyle(height: 28))
                    .disabled(isBusy)
            }

            if let lastError = credential.lastError {
                Text(lastError)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.coral)
            }

            if let cooldownUntil = credential.cooldownUntil {
                Text("Cooldown until \(formattedDate(cooldownUntil))")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            HStack(spacing: 8) {
                SecureField("Replace key", text: $replacement)
                    .textFieldStyle(.roundedBorder)
                Button("Replace", action: onReplace)
                    .buttonStyle(iTuSecondaryButtonStyle(height: 28))
                    .disabled(isBusy || replacement.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("Test Connection", action: onTest)
                    .buttonStyle(iTuSecondaryButtonStyle(height: 28))
                    .disabled(isBusy)
                Button("Remove", role: .destructive, action: onRemove)
                    .buttonStyle(iTuDangerButtonStyle())
                    .disabled(isBusy)
            }
        }
        .padding(.vertical, 12)
    }

    private var statusColor: Color {
        switch credential.status {
        case "HEALTHY": return iTuTheme.mint
        case "RATE_LIMITED": return iTuTheme.amber
        case "QUOTA_EXHAUSTED": return iTuTheme.gold
        case "INVALID_KEY": return iTuTheme.coral
        default: return iTuTheme.inkDim
        }
    }

    private func formattedDate(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        return date.formatted(date: .abbreviated, time: .shortened)
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

            UsageSettingsPanel()
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

private struct UsageSettingsPanel: View {
    @Environment(AppModel.self) private var model
    @State private var showDeleteConfirmation = false
    @State private var loginItemError: String?
    @State private var deleteFrom = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var deleteTo = Date()
    @State private var deleteRange = false

    var body: some View {
        @Bindable var settingsStore = model.settingsStore
        SettingsCardView(
            iconName: "chart.bar.xaxis",
            title: "Foreground Usage",
            description: "Optionally record time spent in the frontmost app. Tracking is off until you enable it."
        ) {
            VStack(alignment: .leading, spacing: 12) {
                Toggle("Track foreground application usage", isOn: $settingsStore.usagePreferences.enabled)
                    .font(.system(size: 13, weight: .medium))
                if settingsStore.usagePreferences.enabled {
                    Toggle("Track Website Usage in Microsoft Edge", isOn: $settingsStore.usagePreferences.websiteTrackingEnabled)
                    Toggle("Pause tracking", isOn: $settingsStore.usagePreferences.paused)
                    Stepper(value: $settingsStore.usagePreferences.retentionDays, in: 7...365) {
                        HStack {
                            Text("Keep local usage data")
                            Spacer()
                            Text("\(settingsStore.usagePreferences.retentionDays) days")
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                    }
                    Toggle("Launch at Login", isOn: Binding(
                        get: { settingsStore.usagePreferences.launchAtLogin },
                        set: { value in
                            let previous = settingsStore.usagePreferences.launchAtLogin
                            do {
                                if value { try SMAppService.mainApp.register() }
                                else { try SMAppService.mainApp.unregister() }
                                settingsStore.usagePreferences.launchAtLogin = value
                            } catch {
                                settingsStore.usagePreferences.launchAtLogin = previous
                                loginItemError = error.localizedDescription
                            }
                        }
                    ))
                    Button("Delete locally stored usage") { showDeleteConfirmation = true }
                        .buttonStyle(iTuDangerButtonStyle())
                    Toggle("Delete a date range", isOn: $deleteRange)
                    if deleteRange {
                        HStack {
                            DatePicker("From", selection: $deleteFrom, displayedComponents: .date)
                            DatePicker("To", selection: $deleteTo, displayedComponents: .date)
                            Button("Delete Range") { showDeleteConfirmation = true }
                                .buttonStyle(iTuDangerButtonStyle())
                                .disabled(deleteFrom > deleteTo)
                        }
                    }
                    if let error = model.usageError ?? loginItemError {
                        Text(error).font(.system(size: 12)).foregroundStyle(iTuTheme.coral)
                    }
                } else {
                    Button("Delete locally stored usage") { showDeleteConfirmation = true }
                        .buttonStyle(iTuDangerButtonStyle())
                }
            }
        }
        .alert("Delete usage data?", isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                Task { await model.deleteUsage(from: deleteRange ? dateKey(deleteFrom) : nil, to: deleteRange ? dateKey(deleteTo) : nil) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes usage data stored on this Mac and from your account.")
        }
    }

    private func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
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

private struct CompanionSettingsPanel: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var settingsStore = model.settingsStore

        VStack(spacing: 16) {
            SettingsCardView(
                iconName: "sidebar.squares.trailing",
                title: "Companion Window",
                description: "Set up customizable global shortcut triggers and floating behaviors."
            ) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 20) {
                        Text("Keyboard shortcut")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                            .frame(width: 150, alignment: .leading)

                        KeyboardShortcuts.Recorder(for: .companionWindow)
                    }

                    Divider()

                    Toggle("Show companion shortcut", isOn: $settingsStore.showCompanionShortcut)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)

                    Toggle("Keep companion above other windows", isOn: $settingsStore.companionKeepAbove)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)

                    Toggle("Remember companion position", isOn: $settingsStore.companionRememberPosition)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                }
            }

            SettingsCardView(
                iconName: "hand.point.up.left",
                title: "Actions",
                description: "Manually summon the companion window or reset its coordinates."
            ) {
                HStack(spacing: 12) {
                    Button("Open companion") {
                        if let appDelegate = NSApp.delegate as? AppDelegate {
                            appDelegate.companionWindowController?.showOrFocus()
                        }
                    }
                    .buttonStyle(iTuSecondaryButtonStyle(height: 30))
                    .pointingHandCursor()

                    Button("Reset position") {
                        if let appDelegate = NSApp.delegate as? AppDelegate {
                            appDelegate.companionWindowController?.resetPosition()
                        }
                    }
                    .buttonStyle(iTuGhostButtonStyle(height: 30))
                    .pointingHandCursor()
                }
            }
        }
    }
}
