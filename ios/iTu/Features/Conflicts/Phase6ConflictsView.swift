import SwiftUI
import iTuDomain
import iTuOffline

struct Phase6ConflictsView: View {
    @ObservedObject var model: AppModel
    @State private var action: Action?

    init(model: AppModel) {
        self.model = model
    }

    private enum Action: Identifiable {
        case retry(SyncMutation)
        case keepMine(SyncMutation)
        case useServer(SyncMutation)
        case keepConflict(SyncConflict)
        case useServerConflict(SyncConflict)

        var id: String {
            switch self {
            case let .retry(mutation): "retry-\(mutation.id)"
            case let .keepMine(mutation): "keep-mine-\(mutation.id)"
            case let .useServer(mutation): "use-server-\(mutation.id)"
            case let .keepConflict(conflict): "keep-conflict-\(conflict.id)"
            case let .useServerConflict(conflict): "use-server-conflict-\(conflict.id)"
            }
        }

        var title: String {
            switch self {
            case .retry: "Retry this change?"
            case .keepMine, .keepConflict: "Keep the local change?"
            case .useServer, .useServerConflict: "Use the server version?"
            }
        }

        var message: String {
            switch self {
            case .retry: "The change will return to the sync queue."
            case .keepMine, .keepConflict: "Your local values will be submitted again and may replace the server values."
            case .useServer, .useServerConflict: "The local change will be discarded. This cannot be undone."
            }
        }
    }

    var body: some View {
        List {
            if model.pendingMutations.isEmpty && model.conflicts.isEmpty {
                IOSContentUnavailableView("No sync conflicts", systemImage: "checkmark.shield", description: "Local and server changes agree.")
            }

            if !model.pendingMutations.isEmpty {
                Section("Pending and failed changes") {
                    ForEach(model.pendingMutations) { mutation in
                        mutationRow(mutation)
                    }
                }
            }

            if !model.conflicts.isEmpty {
                Section("Conflicts") {
                    ForEach(model.conflicts) { conflict in
                        conflictRow(conflict)
                    }
                }
            }
        }
        .navigationTitle("Conflicts")
        .confirmationDialog(
            action?.title ?? "Confirm sync action",
            isPresented: Binding(get: { action != nil }, set: { if !$0 { action = nil } }),
            presenting: action
        ) { selected in
            Button(confirmTitle(for: selected), role: isDestructive(selected) ? .destructive : nil) {
                Task { await perform(selected) }
            }
            Button("Cancel", role: .cancel) { action = nil }
        } message: { selected in
            Text(selected.message)
        }
    }

    private func mutationRow(_ mutation: SyncMutation) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(mutationTitle(mutation), systemImage: mutation.lastErrorCode == nil ? "arrow.triangle.2.circlepath" : "exclamationmark.triangle")
                .font(.headline)
            Text(mutation.lastErrorCode.map { "Failed: \($0)" } ?? "Waiting to sync")
                .font(.caption)
                .foregroundStyle(mutation.lastErrorCode == nil ? Color.secondary : Color.orange)
            Text("Entity \(mutation.entityId)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
            ViewThatFits(in: .horizontal) {
                HStack { mutationActions(mutation) }
                VStack(alignment: .leading) { mutationActions(mutation) }
            }
            .buttonStyle(.bordered)
            .font(.caption)
        }
        .padding(.vertical, 4)
    }

    private func conflictRow(_ conflict: SyncConflict) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(conflict.entityType.capitalized, systemImage: "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(.orange)
            Text(conflict.reason.replacingOccurrences(of: "_", with: " ").capitalized)
                .font(.subheadline)
            if let fields = conflict.conflictingFields, !fields.isEmpty {
                Text("Fields: \(fields.joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text("Entity \(conflict.entityId)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
            ViewThatFits(in: .horizontal) {
                HStack { conflictActions(conflict) }
                VStack(alignment: .leading) { conflictActions(conflict) }
            }
            .buttonStyle(.bordered)
            .font(.caption)
        }
        .padding(.vertical, 4)
    }

    private func mutationTitle(_ mutation: SyncMutation) -> String {
        let parts = mutation.kind.split(separator: ".", maxSplits: 1).map(String.init)
        let operation = parts.count > 1 ? parts[1] : "update"
        let verb = operation == "create" ? "Create" : operation == "delete" ? "Delete" : "Update"
        return "\(verb) \(parts.first?.capitalized ?? "item")"
    }

    @ViewBuilder
    private func mutationActions(_ mutation: SyncMutation) -> some View {
        Button("Retry") { action = .retry(mutation) }
        Button("Keep mine") { action = .keepMine(mutation) }
        Button("Use server") { action = .useServer(mutation) }
    }

    @ViewBuilder
    private func conflictActions(_ conflict: SyncConflict) -> some View {
        Button("Keep mine") { action = .keepConflict(conflict) }
        Button("Use server") { action = .useServerConflict(conflict) }
    }

    private func confirmTitle(for action: Action) -> String {
        switch action {
        case .retry: "Retry"
        case .keepMine, .keepConflict: "Keep mine"
        case .useServer, .useServerConflict: "Use server"
        }
    }

    private func isDestructive(_ action: Action) -> Bool {
        switch action {
        case .useServer, .useServerConflict: true
        case .retry, .keepMine, .keepConflict: false
        }
    }

    private func perform(_ action: Action) async {
        self.action = nil
        switch action {
        case let .retry(mutation): await model.retryPendingMutation(mutation)
        case let .keepMine(mutation): await model.retryPendingMutation(mutation, keepLocal: true)
        case let .useServer(mutation): await model.discardPendingMutation(mutation)
        case let .keepConflict(conflict): await model.resolveConflict(conflict, keepLocal: true)
        case let .useServerConflict(conflict): await model.resolveConflict(conflict, keepLocal: false)
        }
    }
}
