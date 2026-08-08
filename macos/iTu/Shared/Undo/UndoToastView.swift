import SwiftUI

struct UndoToastView: View {
    @ObservedObject var coordinator: TaskUndoCoordinator = .shared

    init(coordinator: TaskUndoCoordinator = .shared) {
        self.coordinator = coordinator
    }

    var body: some View {
        if let toast = coordinator.activeToast {
            HStack(spacing: 12) {
                Text(toast.label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(iTuTheme.ink)

                Button {
                    Task {
                        await coordinator.performUndo(recordId: toast.recordId)
                    }
                } label: {
                    Text("Undo")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(iTuTheme.teal)
                }
                .buttonStyle(.plain)
                .onHover { inside in
                    if inside {
                        NSCursor.pointingHand.push()
                    } else {
                        NSCursor.pop()
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(iTuTheme.surface)
                    .shadow(color: Color.black.opacity(0.25), radius: 8, x: 0, y: 4)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: toast)
        }
    }
}
