import SwiftUI
import iTuDomain

struct AboutSettingsPanel: View {
    @Environment(AppModel.self) private var model
    @State private var showingReleaseNotes = false

    var body: some View {
        SettingsCardView(
            iconName: "info.circle",
            title: "iTu",
            description: "Version and update information for this Mac installation."
        ) {
            VStack(alignment: .leading, spacing: 12) {
                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown")
                LabeledContent("Update status", value: statusTitle)
                if let lastCheckedAt = model.appUpdateLastCheckedAt {
                    LabeledContent("Last checked", value: lastCheckedAt.formatted(date: .abbreviated, time: .shortened))
                }
                HStack(spacing: 10) {
                    Button("Check for Updates") {
                        Task { await model.checkAppUpdateManually() }
                    }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                    .disabled(isChecking)

                    if model.appUpdatePolicy?.release != nil {
                        Button("View Release Notes") { showingReleaseNotes = true }
                            .buttonStyle(.plain)
                            .foregroundStyle(iTuTheme.teal)
                    }
                }
                if case .failed = model.appUpdateState {
                    Text("Unable to check for updates. The app will continue using cached update information.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.amber)
                }
            }
        }
        .sheet(isPresented: $showingReleaseNotes) {
            if let policy = model.appUpdatePolicy {
                AppReleaseNotesView(policy: policy)
            }
        }
    }

    private var isChecking: Bool {
        if case .checking = model.appUpdateState { return true }
        return false
    }

    private var statusTitle: String {
        switch model.appUpdateState {
        case .idle: "Not checked"
        case .checking: "Checking…"
        case .current: "You're up to date"
        case .optional: "Update available"
        case .required: "Update required"
        case .failed: "Unable to check"
        }
    }
}
