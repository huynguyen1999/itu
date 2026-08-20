import SwiftUI
import iTuDomain

struct OptionalAppUpdateBanner: View {
    let policy: AppUpdatePolicy
    let onUpdate: () -> Void
    let onDismiss: () -> Void
    @State private var showingReleaseNotes = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.down.circle.fill")
                .foregroundStyle(iTuTheme.teal)
            VStack(alignment: .leading, spacing: 2) {
                Text("iTu \(policy.latestVersion) is available")
                    .font(.system(size: 13, weight: .semibold))
                Text(policy.release?.title ?? "Performance improvements and bug fixes.")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }
            Spacer()
            Button("What's New") { showingReleaseNotes = true }
                .buttonStyle(.plain)
                .foregroundStyle(iTuTheme.teal)
            Button("Update", action: onUpdate)
                .buttonStyle(iTuPrimaryButtonStyle(height: 28))
                .disabled(policy.update?.url == nil)
            Button("Later", action: onDismiss)
                .buttonStyle(.plain)
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(iTuTheme.surface)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(iTuTheme.border))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .sheet(isPresented: $showingReleaseNotes) {
            AppReleaseNotesView(policy: policy)
        }
    }
}

struct RequiredAppUpdateView: View {
    let policy: AppUpdatePolicy
    let onUpdate: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "arrow.down.app.fill")
                .font(.system(size: 42))
                .foregroundStyle(iTuTheme.teal)
            Text("iTu needs an update")
                .font(.system(size: 24, weight: .bold, design: .rounded))
            Text("This version is no longer compatible with the current iTu service.")
                .foregroundStyle(iTuTheme.inkDim)
                .multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 8) {
                LabeledContent("Installed", value: policy.installedVersion)
                LabeledContent("Required", value: "\(policy.minimumSupportedVersion) or newer")
                LabeledContent("Latest", value: policy.latestVersion)
            }
            .frame(maxWidth: 320)
            if let notes = policy.release?.notes, !notes.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    Text("What's new").font(.headline)
                    ForEach(notes, id: \.self) { Text("• \($0)") }
                }
                .frame(maxWidth: 320, alignment: .leading)
            }
            Button("Update iTu", action: onUpdate)
                .buttonStyle(iTuPrimaryButtonStyle(height: 36))
                .disabled(policy.update?.url == nil)
            if policy.update?.url == nil {
                Text("The update destination is not configured yet.")
                    .font(.caption)
                    .foregroundStyle(iTuTheme.amber)
            }
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(iTuTheme.canvas)
    }
}

struct AppReleaseNotesView: View {
    let policy: AppUpdatePolicy
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(policy.release?.title ?? "iTu \(policy.latestVersion)")
                .font(.title2.bold())
            Text("Version \(policy.latestVersion)")
                .foregroundStyle(.secondary)
            if let releasedAt = policy.release?.releasedAt {
                Text("Released \(releasedAt)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(policy.release?.notes ?? [], id: \.self) { Text("• \($0)") }
            Spacer()
            Button("Close") { dismiss() }
                .keyboardShortcut(.cancelAction)
        }
        .padding(28)
        .frame(width: 420, height: 300)
    }
}
