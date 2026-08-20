import SwiftUI
import iTuDomain
import iTuOffline

struct Phase6ConflictsView: View {
    @ObservedObject var model: AppModel
    @State private var action: Action?
    @State private var isSelectionMode = false
    @State private var selectedMutationIDs: Set<String> = []
    @State private var selectedConflictIDs: Set<String> = []
    @State private var batchAction: BatchAction?

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

    private enum BatchAction: Identifiable {
        case keepMine(mutations: [SyncMutation], conflicts: [SyncConflict])
        case useServer(mutations: [SyncMutation], conflicts: [SyncConflict])
        case retry(mutations: [SyncMutation])

        var id: String {
            switch self {
            case .keepMine: "batch-keep-mine"
            case .useServer: "batch-use-server"
            case .retry: "batch-retry"
            }
        }

        var title: String {
            switch self {
            case let .keepMine(m, c): "Keep \(m.count + c.count) local changes?"
            case let .useServer(m, c): "Use server for \(m.count + c.count) items?"
            case let .retry(m): "Retry \(m.count) changes?"
            }
        }

        var message: String {
            switch self {
            case .keepMine: "Your selected local changes will be submitted again and will overwrite the server values."
            case .useServer: "Your selected local changes will be discarded and replaced with server values. This cannot be undone."
            case .retry: "Selected changes will return to the sync queue to retry immediately."
            }
        }
    }

    private var totalSelectableCount: Int {
        model.pendingMutations.count + model.conflicts.count
    }

    private var selectedCount: Int {
        selectedMutationIDs.count + selectedConflictIDs.count
    }

    private var isAllSelected: Bool {
        totalSelectableCount > 0 && selectedCount == totalSelectableCount
    }

    var body: some View {
        VStack(spacing: 0) {
            List {
                if model.pendingMutations.isEmpty && model.conflicts.isEmpty {
                    IOSContentUnavailableView("No sync conflicts", systemImage: "checkmark.shield", description: "Local and server changes agree.")
                }

                if isSelectionMode && totalSelectableCount > 0 {
                    Section {
                        HStack {
                            Button(isAllSelected ? "Deselect All" : "Select All (\(totalSelectableCount))") {
                                toggleSelectAll()
                            }
                            .font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("\(selectedCount) of \(totalSelectableCount) selected")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if !model.pendingMutations.isEmpty {
                    Section("Pending and failed changes (\(model.pendingMutations.count))") {
                        ForEach(model.pendingMutations) { mutation in
                            mutationRow(mutation)
                        }
                    }
                }

                if !model.conflicts.isEmpty {
                    Section("Conflicts (\(model.conflicts.count))") {
                        ForEach(model.conflicts) { conflict in
                            conflictRow(conflict)
                        }
                    }
                }
            }
            .refreshable {
                await model.reconcileForeground()
            }

            if isSelectionMode && selectedCount > 0 {
                batchActionBar
            }
        }
        .navigationTitle("Conflicts")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if totalSelectableCount > 0 {
                ToolbarItem(placement: .primaryAction) {
                    Button(isSelectionMode ? "Done" : "Select") {
                        isSelectionMode.toggle()
                        if !isSelectionMode {
                            selectedMutationIDs.removeAll()
                            selectedConflictIDs.removeAll()
                        }
                    }
                }
            }
        }
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
        .confirmationDialog(
            batchAction?.title ?? "Confirm batch sync action",
            isPresented: Binding(get: { batchAction != nil }, set: { if !$0 { batchAction = nil } }),
            presenting: batchAction
        ) { target in
            Button(target.title, role: isBatchDestructive(target) ? .destructive : nil) {
                Task { await performBatch(target) }
            }
            Button("Cancel", role: .cancel) { batchAction = nil }
        } message: { target in
            Text(target.message)
        }
    }

    private var batchActionBar: some View {
        VStack(spacing: 8) {
            Divider()
            HStack(spacing: 12) {
                let selectedMutations = model.pendingMutations.filter { selectedMutationIDs.contains($0.id) }
                let selectedConflicts = model.conflicts.filter { selectedConflictIDs.contains($0.id) }

                if !selectedMutations.isEmpty {
                    Button("Retry (\(selectedMutations.count))") {
                        batchAction = .retry(mutations: selectedMutations)
                    }
                    .buttonStyle(.bordered)
                    .font(.caption.weight(.medium))
                }

                Button("Keep Mine (\(selectedCount))") {
                    batchAction = .keepMine(mutations: selectedMutations, conflicts: selectedConflicts)
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
                .font(.caption.weight(.semibold))

                Button("Use Server (\(selectedCount))", role: .destructive) {
                    batchAction = .useServer(mutations: selectedMutations, conflicts: selectedConflicts)
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Color(uiColor: .secondarySystemBackground))
    }

    private func toggleSelectAll() {
        if isAllSelected {
            selectedMutationIDs.removeAll()
            selectedConflictIDs.removeAll()
        } else {
            selectedMutationIDs = Set(model.pendingMutations.map(\.id))
            selectedConflictIDs = Set(model.conflicts.map(\.id))
        }
    }

    private func mutationRow(_ mutation: SyncMutation) -> some View {
        let isSelected = selectedMutationIDs.contains(mutation.id)
        return HStack(alignment: .top, spacing: 12) {
            if isSelectionMode {
                Button {
                    if isSelected {
                        selectedMutationIDs.remove(mutation.id)
                    } else {
                        selectedMutationIDs.insert(mutation.id)
                    }
                } label: {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isSelected ? Color.teal : Color.secondary)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 8) {
                Label(mutationTitle(mutation), systemImage: mutation.lastErrorCode == nil ? "arrow.triangle.2.circlepath" : "exclamationmark.triangle")
                    .font(.headline)
                Text(mutation.lastErrorCode.map { "Failed: \($0)" } ?? "Waiting to sync")
                    .font(.caption)
                    .foregroundStyle(mutation.lastErrorCode == nil ? Color.secondary : Color.orange)
                Text("Entity \(mutation.entityId)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                if !isSelectionMode {
                    ViewThatFits(in: .horizontal) {
                        HStack { mutationActions(mutation) }
                        VStack(alignment: .leading) { mutationActions(mutation) }
                    }
                    .buttonStyle(.bordered)
                    .font(.caption)
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            if isSelectionMode {
                if isSelected {
                    selectedMutationIDs.remove(mutation.id)
                } else {
                    selectedMutationIDs.insert(mutation.id)
                }
            }
        }
    }

    private func conflictRow(_ conflict: SyncConflict) -> some View {
        let isSelected = selectedConflictIDs.contains(conflict.id)
        return HStack(alignment: .top, spacing: 12) {
            if isSelectionMode {
                Button {
                    if isSelected {
                        selectedConflictIDs.remove(conflict.id)
                    } else {
                        selectedConflictIDs.insert(conflict.id)
                    }
                } label: {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isSelected ? Color.teal : Color.secondary)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
            }

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

                if !isSelectionMode {
                    ViewThatFits(in: .horizontal) {
                        HStack { conflictActions(conflict) }
                        VStack(alignment: .leading) { conflictActions(conflict) }
                    }
                    .buttonStyle(.bordered)
                    .font(.caption)
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            if isSelectionMode {
                if isSelected {
                    selectedConflictIDs.remove(conflict.id)
                } else {
                    selectedConflictIDs.insert(conflict.id)
                }
            }
        }
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

    private func isBatchDestructive(_ target: BatchAction) -> Bool {
        switch target {
        case .useServer: true
        case .keepMine, .retry: false
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

    private func performBatch(_ target: BatchAction) async {
        self.batchAction = nil
        switch target {
        case let .keepMine(mutations, conflicts):
            if !mutations.isEmpty {
                await model.retryPendingMutations(mutations, keepLocal: true)
            }
            if !conflicts.isEmpty {
                await model.resolveConflicts(conflicts, keepLocal: true)
            }
        case let .useServer(mutations, conflicts):
            if !mutations.isEmpty {
                await model.discardPendingMutations(mutations)
            }
            if !conflicts.isEmpty {
                await model.resolveConflicts(conflicts, keepLocal: false)
            }
        case let .retry(mutations):
            if !mutations.isEmpty {
                await model.retryPendingMutations(mutations, keepLocal: false)
            }
        }
        selectedMutationIDs.removeAll()
        selectedConflictIDs.removeAll()
    }
}
