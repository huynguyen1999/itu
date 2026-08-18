import SwiftUI
import iTuDomain

public struct IOSTaskRow: View {
    @Environment(\.colorScheme) private var colorScheme
    public let task: ProductivityTask
    public let onToggleComplete: () -> Void
    public let onSelect: () -> Void
    public let onFocus: (() -> Void)?
    public let onDelete: (() -> Void)?

    public init(
        task: ProductivityTask,
        onToggleComplete: @escaping () -> Void,
        onSelect: @escaping () -> Void,
        onFocus: (() -> Void)? = nil,
        onDelete: (() -> Void)? = nil
    ) {
        self.task = task
        self.onToggleComplete = onToggleComplete
        self.onSelect = onSelect
        self.onFocus = onFocus
        self.onDelete = onDelete
    }

    public var body: some View {
        HStack(alignment: .top, spacing: IOSSpacing.compact) {
            Button(action: onToggleComplete) {
                Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(
                        isCompleted
                            ? IOSColor.teal(colorScheme)
                            : IOSColor.inkFaint(colorScheme)
                    )
                    .frame(width: IOSMetrics.minimumHitTarget, height: IOSMetrics.minimumHitTarget)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isCompleted ? "Mark task as not completed" : "Mark task as completed")

            VStack(alignment: .leading, spacing: IOSSpacing.micro) {
                Button(action: onSelect) {
                    Text(task.title)
                        .font(IOSTypography.body)
                        .fontWeight(.medium)
                        .foregroundStyle(isCompleted ? IOSColor.inkDim(colorScheme) : IOSColor.ink(colorScheme))
                        .strikethrough(isCompleted, color: IOSColor.inkDim(colorScheme))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)

                HStack(spacing: IOSSpacing.tight) {
                    if let dueText = formattedDueOrSchedule {
                        HStack(spacing: 3) {
                            Image(systemName: isScheduled ? "calendar.badge.clock" : "calendar")
                            Text(dueText)
                        }
                        .font(IOSTypography.caption)
                        .foregroundStyle(isOverdue ? IOSColor.coral(colorScheme) : IOSColor.inkDim(colorScheme))
                    }

                    if let estimated = task.estimatedMinutes, estimated > 0 {
                        HStack(spacing: 3) {
                            Image(systemName: "clock")
                            Text("\(estimated)m")
                        }
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                    }

                    if task.priority == .high {
                        Text(task.priority.rawValue.uppercased())
                            .font(IOSTypography.kicker)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                IOSColor.amber(colorScheme).opacity(0.16),
                                in: Capsule()
                            )
                            .foregroundStyle(IOSColor.amber(colorScheme))
                    }

                    if task.important {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(IOSColor.amber(colorScheme))
                    }
                }
            }
            .padding(.vertical, 2)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, IOSSpacing.compact)
        .padding(.vertical, IOSSpacing.tight)
        .background(
            IOSColor.surface(colorScheme),
            in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                .stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1)
        }
        .contextMenu {
            Button {
                onToggleComplete()
            } label: {
                Label(isCompleted ? "Reopen Task" : "Complete Task", systemImage: isCompleted ? "arrow.uturn.backward" : "checkmark.circle")
            }

            if let onFocus {
                Button {
                    onFocus()
                } label: {
                    Label("Start Focus Session", systemImage: "timer")
                }
            }

            if let onDelete {
                Divider()
                Button(role: .destructive) {
                    onDelete()
                } label: {
                    Label("Delete Task", systemImage: "trash")
                }
            }
        }
    }

    private var isCompleted: Bool {
        task.status == .completed
    }

    private var isScheduled: Bool {
        task.scheduledStartAt != nil
    }

    private var isOverdue: Bool {
        guard !isCompleted, let dueAt = task.dueAt, let dueDate = IOSProductCalendar.date(from: dueAt) else { return false }
        return dueDate < Date()
    }

    private var formattedDueOrSchedule: String? {
        if let scheduled = task.scheduledStartAt, let date = IOSProductCalendar.date(from: scheduled) {
            return date.formatted(date: .abbreviated, time: .shortened)
        }
        if let dueAt = task.dueAt, let date = IOSProductCalendar.date(from: dueAt) {
            return date.formatted(date: .abbreviated, time: .shortened)
        }
        return nil
    }
}
