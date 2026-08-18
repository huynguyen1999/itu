import SwiftUI
import iTuDomain
import iTuDesignCore

public typealias MatrixView = Phase6MatrixView

public struct Phase6MatrixView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var searchText = ""

    public init() {}

    private var projection: [IOSMatrixQuadrant: [ProductivityTask]] { model.matrixTasks(query: searchText) }

    public var body: some View {
        IOSPage {
            // Header card
            IOSHeroCard {
                VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                    HStack {
                        Label("PRIORITIZATION", systemImage: "square.grid.2x2.fill")
                            .font(IOSTypography.kicker)
                            .tracking(1.2)
                            .foregroundStyle(IOSColor.mint(colorScheme))
                        Spacer()
                    }

                    Text("Eisenhower Matrix")
                        .font(IOSTypography.largeTitle)
                        .foregroundStyle(.white)

                    Text("Classify tasks by importance and urgency to focus on what matters most.")
                        .font(IOSTypography.subheadline)
                        .foregroundStyle(.white.opacity(0.85))
                }
            }

            // Sync issue banner
            IOSSyncIssueBanner()

            if model.tasks.isEmpty {
                IOSEmptyState(
                    icon: "square.grid.2x2",
                    title: "No Tasks Found",
                    description: "Create tasks in Plan to organize them in the Eisenhower matrix."
                )
            } else {
                VStack(spacing: IOSSpacing.normal) {
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
        .navigationTitle("Matrix")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Search Tasks")
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
        }
    }
}

private struct Phase6MatrixQuadrant: View {
    @Environment(\.colorScheme) private var colorScheme
    let quadrant: IOSMatrixQuadrant
    let tasks: [ProductivityTask]
    let onComplete: (ProductivityTask) -> Void
    let onMove: (ProductivityTask, IOSMatrixQuadrant) -> Void

    var body: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(quadrant.title)
                            .font(IOSTypography.headline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                        Text(quadrant.subtitle)
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                    }
                    Spacer()
                    Text("\(tasks.count)")
                        .font(IOSTypography.captionBold)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(IOSColor.mintTint(colorScheme), in: Capsule())
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }

                if tasks.isEmpty {
                    Text("No tasks in this quadrant")
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkFaint(colorScheme))
                        .padding(.vertical, 4)
                } else {
                    VStack(spacing: IOSSpacing.tight) {
                        ForEach(tasks) { task in
                            HStack(spacing: IOSSpacing.compact) {
                                Button {
                                    onComplete(task)
                                } label: {
                                    Image(systemName: task.status == .completed ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(task.status == .completed ? IOSColor.teal(colorScheme) : IOSColor.inkFaint(colorScheme))
                                }
                                .buttonStyle(.plain)

                                Text(task.title)
                                    .font(IOSTypography.subheadline)
                                    .foregroundStyle(IOSColor.ink(colorScheme))
                                    .lineLimit(1)

                                Spacer()

                                Menu {
                                    ForEach(IOSMatrixQuadrant.allCases.filter { $0 != quadrant }) { target in
                                        Button("Move to \(target.title)") {
                                            onMove(task, target)
                                        }
                                    }
                                } label: {
                                    Image(systemName: "arrow.up.and.down.and.arrow.left.and.right")
                                        .font(.caption2)
                                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
        }
    }
}
