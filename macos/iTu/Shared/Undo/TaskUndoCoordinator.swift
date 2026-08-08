import Foundation
import AppKit
import Combine

enum TaskMutationType: String, Sendable {
    case status
    case priority
    case dueDate
    case taskList
    case softDelete
}

struct TaskUndoRecord: Identifiable, Sendable {
    let id: String
    let label: String
    let taskId: String
    let mutationType: TaskMutationType
    let previousValues: [String: String]
    let timestamp: Date
    let inverseAction: @MainActor @Sendable () async -> Void

    init(
        id: String = UUID().uuidString,
        label: String,
        taskId: String,
        mutationType: TaskMutationType,
        previousValues: [String: String],
        timestamp: Date = Date(),
        inverseAction: @escaping @MainActor @Sendable () async -> Void
    ) {
        self.id = id
        self.label = label
        self.taskId = taskId
        self.mutationType = mutationType
        self.previousValues = previousValues
        self.timestamp = timestamp
        self.inverseAction = inverseAction
    }
}

struct UndoToastState: Equatable, Sendable {
    let recordId: String
    let label: String

    init(recordId: String, label: String) {
        self.recordId = recordId
        self.label = label
    }
}

@MainActor
final class TaskUndoCoordinator: ObservableObject {
    static let shared = TaskUndoCoordinator()

    @Published private(set) var activeToast: UndoToastState?
    private var undoStack: [TaskUndoRecord] = []
    private var dismissTask: Task<Void, Never>?
    private let maxStackDepth = 5

    init() {}

    func registerUndo(_ record: TaskUndoRecord) {
        undoStack.append(record)
        if undoStack.count > maxStackDepth {
            undoStack.removeFirst(undoStack.count - maxStackDepth)
        }

        activeToast = UndoToastState(recordId: record.id, label: record.label)
        scheduleToastDismissal()

        if let undoManager = NSApp.keyWindow?.undoManager {
            undoManager.registerUndo(withTarget: self) { [weak self] _ in
                Task { @MainActor in
                    await self?.performUndo(recordId: record.id)
                }
            }
            undoManager.setActionName(record.label)
        }
    }

    func performLatestUndo() async {
        guard let latest = undoStack.last else { return }
        await performUndo(recordId: latest.id)
    }

    func performUndo(recordId: String) async {
        guard let index = undoStack.firstIndex(where: { $0.id == recordId }) else { return }
        let record = undoStack.remove(at: index)

        dismissTask?.cancel()
        dismissTask = nil
        activeToast = nil

        await record.inverseAction()
    }

    func clearHistory() {
        undoStack.removeAll()
        dismissTask?.cancel()
        dismissTask = nil
        activeToast = nil
        NSApp.keyWindow?.undoManager?.removeAllActions()
    }

    private func scheduleToastDismissal() {
        dismissTask?.cancel()
        dismissTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if !Task.isCancelled {
                self.activeToast = nil
            }
        }
    }
}
