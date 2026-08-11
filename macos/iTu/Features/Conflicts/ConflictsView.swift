import SwiftUI

struct ConflictsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    iTuSectionLabel(title: "Offline sync")
                    Text("Conflicts")
                        .font(.system(size: 25, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                }
                Spacer()
                Text(model.conflicts.isEmpty ? "Up to date" : "\(model.conflicts.count) action required")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(model.conflicts.isEmpty ? iTuTheme.teal : iTuTheme.coral)
            }
            .padding(.horizontal, 24)
            .padding(.top, 28)
            .padding(.bottom, 18)
            .background(iTuTheme.surface)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(iTuTheme.border)
                    .frame(height: 1)
            }

            ScrollView {
                if model.conflicts.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.shield")
                            .font(.system(size: 27, weight: .light))
                            .foregroundStyle(iTuTheme.teal)
                            .frame(width: 56, height: 56)
                            .background(iTuTheme.mintTint)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        Text("Everything agrees")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Your local workspace and the server have no unresolved conflicts.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 68)
                    .iTuPanel(radius: 14)
                    .padding(24)
                    .frame(maxWidth: 720)
                    .frame(maxWidth: .infinity)
                } else {
                    LazyVStack(spacing: 14) {
                        ForEach(model.conflicts) { conflict in
                            conflictCard(conflict)
                        }
                    }
                    .padding(24)
                    .frame(maxWidth: 760)
                    .frame(maxWidth: .infinity)
                }
            }
            .background(iTuTheme.canvas)
        }
    }

    private func pendingCard(_ mutation: SyncMutation) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 10) {
                Image(systemName: mutation.lastErrorCode == nil ? "arrow.triangle.2.circlepath" : "exclamationmark.triangle.fill")
                    .foregroundStyle(mutation.lastErrorCode == nil ? iTuTheme.teal : iTuTheme.coral)
                    .frame(width: 34, height: 34)
                    .background(mutation.lastErrorCode == nil ? iTuTheme.mintTint : iTuTheme.coralTint)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(pendingMutationTitle(mutation))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Text(mutation.lastErrorCode == nil ? "Waiting to sync" : pendingMutationError(mutation))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
                Spacer()
            }

            HStack {
                Text("Local changes stay active until you choose an action.")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkFaint)
                Spacer()
                Button("Retry") {
                    Task { await model.retryPendingMutation(mutation) }
                }
                .buttonStyle(iTuSecondaryButtonStyle())
                Button("Keep local") {
                    Task { await model.retryPendingMutation(mutation, keepLocal: true) }
                }
                .buttonStyle(iTuSecondaryButtonStyle())
                Button("Use server") {
                    Task { await model.discardPendingMutation(mutation) }
                }
                .buttonStyle(iTuDangerButtonStyle())
            }
        }
        .padding(18)
        .iTuPanel(radius: 14)
        .contextMenu {
            Button("Retry") { Task { await model.retryPendingMutation(mutation) } }
            Button("Keep local") { Task { await model.retryPendingMutation(mutation, keepLocal: true) } }
            Divider()
            Button("Use server", role: .destructive) { Task { await model.discardPendingMutation(mutation) } }
        }
    }

    private func pendingMutationTitle(_ mutation: SyncMutation) -> String {
        let parts = mutation.kind.split(separator: ".", maxSplits: 1).map(String.init)
        let operation = parts.count > 1 ? parts[1] : "update"
        let action = operation == "create" ? "Create" : operation == "delete" ? "Delete" : "Update"
        let subject = mutation.payload["title"].flatMap { value in
            if case let .string(title) = value { return "“\(title)”" }
            return nil
        } ?? "\(parts.first ?? "item") \(mutation.entityId.prefix(8))"
        return "\(action) \(subject)"
    }

    private func pendingMutationError(_ mutation: SyncMutation) -> String {
        mutation.lastErrorCode?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Sync failed"
    }

    private func conflictCard(_ conflict: SyncConflict) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(iTuTheme.coral)
                    .frame(width: 34, height: 34)
                    .background(iTuTheme.coralTint)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(conflict.entityType.capitalized)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Text(conflict.reason.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
                Spacer()
            }

            if let fields = conflict.conflictingFields, !fields.isEmpty {
                Text("Both versions changed \(fields.joined(separator: ", ")).")
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            HStack {
                Text("The server version stays active until you resolve this change.")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkFaint)
                Spacer()
                Button("Keep mine") {
                    Task { await model.keepConflict(conflict) }
                }
                .buttonStyle(iTuSecondaryButtonStyle())
                Button("Keep server version") {
                    Task { await model.discardConflict(conflict) }
                }
                .buttonStyle(iTuPrimaryButtonStyle())
            }
        }
        .padding(18)
        .iTuPanel(radius: 14)
    }
}
