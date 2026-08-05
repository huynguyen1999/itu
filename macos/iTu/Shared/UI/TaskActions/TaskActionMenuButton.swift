import AppKit
import SwiftUI

/// Ellipsis button that presents the shared TickTick-style task action popover.
///
/// Pair it with `.taskActionMenu(for:onOpenDetails:)` on the row so a right-click
/// anywhere on the row opens the same menu. The button owns its own presentation
/// state; the right-click modifier owns a separate one, and opening either
/// dismisses the other because the presenting click lands outside the open popover.
struct TaskActionMenuButton: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let onOpenDetails: () -> Void

    @State private var isPresented = false
    @State private var screenPoint: CGPoint = .zero
    @State private var windowPoint: CGPoint?

    var body: some View {
        Button {
            screenPoint = NSEvent.mouseLocation
            windowPoint = nil
            isPresented.toggle()
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(iTuTheme.inkFaint)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
        .help("Task Actions")
        .background {
            PointerAnchoredPopover(
                isPresented: $isPresented,
                screenPoint: screenPoint,
                windowPoint: windowPoint,
                onDismiss: { isPresented = false }
            ) {
                TaskContextMenuPopoverView(
                    task: task,
                    onDismiss: { isPresented = false },
                    onOpenDetail: onOpenDetails
                )
                .environment(model)
            }
            .frame(width: 0, height: 0)
            .allowsHitTesting(false)
        }
    }
}

/// Adds right-click-anywhere support that presents the shared task action popover.
extension View {
    func taskActionMenu(
        for task: ProductivityTask,
        onOpenDetails: @escaping () -> Void
    ) -> some View {
        modifier(TaskActionMenuModifier(task: task, onOpenDetails: onOpenDetails))
    }
}

private struct TaskActionMenuModifier: ViewModifier {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let onOpenDetails: () -> Void

    @State private var isPresented = false
    @State private var screenPoint: CGPoint = .zero
    @State private var windowPoint: CGPoint?

    func body(content: Content) -> some View {
        content
            .background {
                RightClickDetector { point in
                    windowPoint = point
                    isPresented = true
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background {
                PointerAnchoredPopover(
                    isPresented: $isPresented,
                    screenPoint: screenPoint,
                    windowPoint: windowPoint,
                    onDismiss: { isPresented = false }
                ) {
                    TaskContextMenuPopoverView(
                        task: task,
                        onDismiss: { isPresented = false },
                        onOpenDetail: onOpenDetails
                    )
                    .environment(model)
                }
                .frame(width: 0, height: 0)
                .allowsHitTesting(false)
            }
    }
}
