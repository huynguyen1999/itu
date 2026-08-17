// import FamilyControls
import SwiftUI
import UIKit
import iTuDomain
import iTuNetworking

enum Phase6EndpointValidation {
    static func url(_ value: String) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              url.host != nil,
              url.user == nil,
              url.password == nil else { return nil }
        return url
    }
}

struct Phase6SettingsView: View {
    @ObservedObject var model: AppModel
    @ObservedObject private var focusBlocking: IOSFocusBlockingService
    @State private var endpoint = APIConfiguration.baseURL.absoluteString
    @State private var savedEndpoint = APIConfiguration.baseURL.absoluteString
    @State private var endpointMessage: String?
    @State private var usage = UsagePreferences()
    @State private var savedUsage = UsagePreferences()
    @State private var isSavingUsage = false
    @State private var showFocusPicker = false
    @State private var focusSelection: IOSFocusActivitySelection

    init(model: AppModel) {
        self.model = model
        _focusBlocking = ObservedObject(wrappedValue: model.focusBlocking)
        _focusSelection = State(initialValue: model.focusBlocking.selection)
    }

    private var usageDirty: Bool { usage != savedUsage }
    private var endpointDirty: Bool { endpoint != savedEndpoint }
    private var isDirty: Bool { usageDirty || endpointDirty }

    var body: some View {
        Form {
            Section("User Account") {
                LabeledContent("Signed in as", value: model.user?.accountLabel ?? "No User Account")
                LabeledContent("Account ID", value: model.user?.id ?? "—")
                LabeledContent("Platform", value: "iOS")
                Text("Local data, pending changes, and credentials remain separated by User Account.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Connection") {
                TextField("API endpoint URL", text: $endpoint)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Text("Use an HTTPS endpoint reachable from this device. HTTP is suitable only for local development.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                HStack {
                    Button("Discard") { endpoint = savedEndpoint }
                        .disabled(!endpointDirty)
                    Spacer()
                    Button("Save endpoint") { saveEndpoint() }
                        .disabled(!endpointDirty)
                }
                if let endpointMessage {
                    Text(endpointMessage).font(.footnote).foregroundStyle(.secondary)
                }
            }

            Section("Sync and device") {
                LabeledContent("Status", value: model.syncPhase.title)
                LabeledContent("Pending changes", value: model.pendingCount.formatted())
                LabeledContent("Connectivity", value: model.isOnline ? "Online" : "Offline")
                if let lastSyncTime = model.lastSyncTime {
                    LabeledContent("Last sync", value: lastSyncTime)
                }
                Button("Sync now") { Task { await model.retrySync() } }
                    .disabled(!model.isOnline || model.syncPhase == .syncing)
            }

            Section("Usage preferences") {
                Toggle("Application usage tracking", isOn: $usage.enabled)
                Toggle("Website usage tracking", isOn: $usage.websiteTrackingEnabled)
                    .disabled(!usage.enabled)
                Stepper("Retention: \(usage.retentionDays) days", value: $usage.retentionDays, in: 1...730)
                Stepper("Idle threshold: \(usage.idleThresholdSeconds) seconds", value: $usage.idleThresholdSeconds, in: 60...3_600, step: 60)
                TextField("Excluded bundle IDs (comma separated)", text: Binding(
                    get: { usage.excludedBundleIds.joined(separator: ", ") },
                    set: { usage.excludedBundleIds = $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } }
                ))
                HStack {
                    Button("Discard") { usage = savedUsage }
                        .disabled(!usageDirty || isSavingUsage)
                    Spacer()
                    Button(isSavingUsage ? "Saving…" : "Save usage settings") { saveUsage() }
                        .disabled(!usageDirty || isSavingUsage)
                }
                Text("These settings are server-backed and are not applied offline until the server accepts them.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Permissions") {
                LabeledContent("HealthKit", value: model.healthAuthorizationState.title)
                if model.healthAuthorizationState.canRequest {
                    Button("Allow HealthKit access") { Task { await model.requestHealthAccess() } }
                }
                LabeledContent("Screen Time", value: "Disabled for personal development")
                Text("Screen Time / Family Controls is disabled for personal development team builds.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                LabeledContent("Notifications", value: model.notificationAuthorizationState.title)
                if model.notificationAuthorizationState.canRequest {
                    Button("Allow notifications") { Task { await model.requestNotificationAccess() } }
                } else if model.notificationAuthorizationState == .denied {
                    Text("Notifications are denied. Enable them in iOS Settings.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Link("Open iOS notification settings", destination: URL(string: UIApplication.openSettingsURLString)!)
                Text("iOS schedules task and Focus completion notifications from synced iTu state. Notification history and reminder actions remain online-backed.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Focus blocking") {
                LabeledContent("Status", value: "Disabled")
                Text("Focus blocking via Screen Time / Family Controls is disabled for personal team builds.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
        /*
        .familyActivityPicker(isPresented: $showFocusPicker, selection: $focusSelection)
        .onChange(of: focusSelection) { selection in
            focusBlocking.setSelection(selection)
        }
        */
        .task {
            if !isDirty {
                usage = model.usagePreferences ?? UsagePreferences()
                savedUsage = usage
                endpoint = APIConfiguration.baseURL.absoluteString
                savedEndpoint = endpoint
            }
            await model.refreshNotificationAuthorization()
        }
        .alert("Endpoint", isPresented: Binding(get: { endpointMessage != nil }, set: { if !$0 { endpointMessage = nil } })) {
            Button("OK", role: .cancel) { endpointMessage = nil }
        } message: {
            Text(endpointMessage ?? "")
        }
        .preference(key: IOSNavigationDirtyPreferenceKey.self, value: isDirty ? [.settings] : [])
    }

    private func saveEndpoint() {
        guard let url = Phase6EndpointValidation.url(endpoint) else {
            endpointMessage = "Enter a valid HTTP(S) API endpoint URL without embedded credentials."
            return
        }
        do {
            try APIConfiguration.saveBaseURL(url.absoluteString)
            endpoint = APIConfiguration.baseURL.absoluteString
            savedEndpoint = endpoint
            endpointMessage = "API endpoint saved."
        } catch {
            endpointMessage = error.localizedDescription
        }
    }

    private func saveUsage() {
        isSavingUsage = true
        Task {
            if await model.updateUsagePreferences(usage) {
                savedUsage = usage
            } else {
                usage = savedUsage
            }
            isSavingUsage = false
        }
    }

}
