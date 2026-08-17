import SwiftUI
import iTuDomain

struct Phase6MatrixView: View {
    @EnvironmentObject private var model: AppModel
    @State private var searchText = ""

    private var projection: [IOSMatrixQuadrant: [ProductivityTask]] { model.matrixTasks(query: searchText) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SyncBanner()
                Text("Eisenhower Matrix").font(.title.bold())
                Text("Classify Tasks by importance and urgency. Tap a Task to complete it or move it to another quadrant.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if model.tasks.isEmpty {
                    IOSContentUnavailableView("No Tasks", systemImage: "square.grid.2x2", description: "Create Tasks in Plan to see them here.")
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(IOSMatrixQuadrant.allCases) { quadrant in
                            Phase6MatrixQuadrant(
                                quadrant: quadrant,
                                tasks: projection[quadrant] ?? [],
                                onComplete: { task in Task { await model.complete(task) } },
                                onMove: { task, target in Task { await model.reassignTask(task, to: target) } }
                            )
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Matrix")
        .searchable(text: $searchText, prompt: "Search Tasks")
    }
}

private struct Phase6MatrixQuadrant: View {
    let quadrant: IOSMatrixQuadrant
    let tasks: [ProductivityTask]
    let onComplete: (ProductivityTask) -> Void
    let onMove: (ProductivityTask, IOSMatrixQuadrant) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(quadrant.title).font(.headline)
                    Text(quadrant.subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(tasks.count)")
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.thinMaterial, in: Capsule())
            }
            if tasks.isEmpty {
                Text("No Tasks here").font(.subheadline).foregroundStyle(.secondary).padding(.vertical, 18)
            } else {
                ForEach(tasks) { task in
                    Phase6MatrixTaskRow(task: task, quadrant: quadrant, onComplete: onComplete, onMove: onMove)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(quadrantColor.opacity(0.45), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(quadrant.title), \(tasks.count) Tasks")
    }

    private var quadrantColor: Color {
        switch quadrant {
        case .q1: .red
        case .q2: .blue
        case .q3: .orange
        case .q4: .secondary
        }
    }
}

private struct Phase6MatrixTaskRow: View {
    let task: ProductivityTask
    let quadrant: IOSMatrixQuadrant
    let onComplete: (ProductivityTask) -> Void
    let onMove: (ProductivityTask, IOSMatrixQuadrant) -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button {
                onComplete(task)
            } label: {
                Image(systemName: task.status == .completed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(task.status == .completed ? .green : .secondary)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(task.status == .completed ? "Completed" : "Complete Task")
            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .strikethrough(task.status == .completed)
                    .lineLimit(2)
                if let dueAt = task.dueAt {
                    Text("Due \(String(dueAt.prefix(10)))").font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 4)
            Menu {
                ForEach(IOSMatrixQuadrant.allCases) { target in
                    Button {
                        onMove(task, target)
                    } label: {
                        Label(target.title, systemImage: target == quadrant ? "checkmark" : "arrow.right")
                    }
                    .disabled(target == quadrant)
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Move Task")
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(task.title), \(quadrant.title)")
    }
}
