import SwiftUI
import iTuDomain

struct IOSOptionalAppUpdateBanner: View {
    @Environment(\.colorScheme) private var colorScheme
    let policy: AppUpdatePolicy
    let onUpdate: () -> Void
    let onDismiss: () -> Void
    @State private var showingReleaseNotes = false

    var body: some View {
        VStack(alignment: .leading, spacing: IOSSpacing.tight) {
            HStack(alignment: .top, spacing: IOSSpacing.tight) {
                Image(systemName: "arrow.down.circle.fill")
                    .foregroundStyle(IOSColor.teal(colorScheme))
                VStack(alignment: .leading, spacing: 2) {
                    Text("iTu \(policy.latestVersion) is available")
                        .font(IOSTypography.subheadline)
                        .fontWeight(.semibold)
                    Text(policy.release?.title ?? "Performance improvements and bug fixes.")
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }
                Spacer()
                Button("Later", action: onDismiss)
                    .font(IOSTypography.caption)
            }
            HStack(spacing: IOSSpacing.tight) {
                Button("What's New") { showingReleaseNotes = true }
                IOSPrimaryAction("Update", systemImage: "arrow.up.right", isDisabled: policy.update?.url == nil, action: onUpdate)
                    .frame(maxWidth: 120)
            }
        }
        .padding(IOSSpacing.compact)
        .iTuMobilePanel(cornerRadius: IOSCornerRadius.card)
        .sheet(isPresented: $showingReleaseNotes) {
            IOSAppReleaseNotesView(policy: policy)
        }
    }
}

struct IOSRequiredAppUpdateView: View {
    @Environment(\.colorScheme) private var colorScheme
    let policy: AppUpdatePolicy
    let onUpdate: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: IOSSpacing.section) {
                Image(systemName: "arrow.down.app.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(IOSColor.teal(colorScheme))
                Text("Update required")
                    .font(IOSTypography.title)
                    .foregroundStyle(IOSColor.ink(colorScheme))
                Text("This version is no longer compatible with the current iTu service.")
                    .font(IOSTypography.body)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
                IOSSection(title: "Version") {
                    LabeledContent("Installed", value: policy.installedVersion)
                    LabeledContent("Required", value: "\(policy.minimumSupportedVersion) or newer")
                    LabeledContent("Latest", value: policy.latestVersion)
                }
                if let notes = policy.release?.notes, !notes.isEmpty {
                    IOSSection(title: "What's new") {
                        ForEach(notes, id: \.self) { Text("• \($0)") }
                    }
                }
                IOSPrimaryAction("Update iTu", systemImage: "arrow.up.right", isDisabled: policy.update?.url == nil, action: onUpdate)
                if policy.update?.url == nil {
                    Text("Update iTu using your normal development installation method, then reopen the app.")
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }
            }
            .padding(IOSSpacing.normal)
        }
        .background(IOSColor.canvas(colorScheme))
    }
}

struct IOSAppReleaseNotesView: View {
    let policy: AppUpdatePolicy
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(policy.release?.title ?? "iTu \(policy.latestVersion)")
                        .font(IOSTypography.title)
                    Text("Version \(policy.latestVersion)")
                        .foregroundStyle(.secondary)
                    if let releasedAt = policy.release?.releasedAt {
                        Text("Released \(releasedAt)")
                            .font(IOSTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Section("What's new") {
                    ForEach(policy.release?.notes ?? [], id: \.self) { Text("• \($0)") }
                }
            }
            .navigationTitle("Release Notes")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
