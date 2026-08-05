import SwiftUI

struct SyncStatusView: View {
    @Environment(AppModel.self) private var model
    @State private var showPopover = false

    var body: some View {
        Button {
            showPopover.toggle()
        } label: {
            HStack(spacing: 7) {
                Image(systemName: icon)
                    .foregroundStyle(color)
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if model.pendingCount > 0 {
                    Text("\(model.pendingCount)")
                        .font(.caption.monospacedDigit())
                }
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
        .popover(isPresented: $showPopover, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Cloud sync")
                        .font(.system(size: 14, weight: .semibold))
                    Spacer()
                    Text(label)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(color)
                }

                Divider()

                HStack {
                    syncCount(title: "Pending", value: model.pendingMutations.count)
                    syncCount(title: "Conflicts", value: model.conflicts.count)
                }

                if !model.pendingMutations.isEmpty || !model.conflicts.isEmpty {
                    Button("Open sync details") {
                        showPopover = false
                        model.selectedSection = .conflicts
                    }
                    .buttonStyle(iTuSecondaryButtonStyle(height: 30))
                    .frame(maxWidth: .infinity)
                }

                if model.pendingMutations.contains(where: { $0.lastErrorCode != nil }) {
                    Button("Retry failed changes") {
                        showPopover = false
                        Task {
                            for mutation in model.pendingMutations where mutation.lastErrorCode != nil {
                                await model.retryPendingMutation(mutation)
                            }
                        }
                    }
                    .buttonStyle(iTuGhostButtonStyle(height: 28))
                    .frame(maxWidth: .infinity)

                    Button("Discard failed changes", role: .destructive) {
                        showPopover = false
                        Task { await model.discardFailedMutations() }
                    }
                    .buttonStyle(iTuGhostButtonStyle(height: 28))
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(16)
            .frame(width: 260)
        }
    }

    private func syncCount(title: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)
            Text(title)
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var label: String {
        switch model.syncPhase {
        case .offline: "Offline"
        case .pending: "Pending"
        case .syncing: "Syncing"
        case .upToDate: "Up to date"
        case .conflict: "Needs attention"
        }
    }

    private var icon: String {
        switch model.syncPhase {
        case .offline: "wifi.slash"
        case .pending: "clock.arrow.circlepath"
        case .syncing: "arrow.triangle.2.circlepath"
        case .upToDate: "checkmark.circle.fill"
        case .conflict: "exclamationmark.triangle.fill"
        }
    }

    private var color: Color {
        switch model.syncPhase {
        case .offline: .secondary
        case .pending, .syncing: .blue
        case .upToDate: .green
        case .conflict: .orange
        }
    }
}
