import SwiftUI
import iTuDomain
import iTuDesignCore

public typealias Phase6PlanView = PlanView

public enum PlanScope: String, CaseIterable, Identifiable {
    case today = "Today"
    case inbox = "Inbox"
    case upcoming = "Upcoming"
    case all = "All"
    case completed = "Done"

    public var id: String { rawValue }

    public var systemImage: String {
        switch self {
        case .today: return "sun.max"
        case .inbox: return "tray"
        case .upcoming: return "calendar"
        case .all: return "checklist"
        case .completed: return "checkmark.circle"
        }
    }
}

public struct PlanView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var selectedScope: PlanScope = .today
    @State private var captureTitle = ""
    @FocusState private var captureFocused: Bool

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            // Scope Filter Bar
            IOSFilterBar(
                items: PlanScope.allCases,
                title: { $0.rawValue },
                icon: { $0.systemImage },
                selection: $selectedScope
            )
            .padding(.top, IOSSpacing.tight)
            .padding(.bottom, IOSSpacing.compact)

            // Sync Issue Banner
            IOSSyncIssueBanner()
                .padding(.horizontal, IOSSpacing.normal)
                .padding(.bottom, IOSSpacing.tight)

            // Task List Content
            taskScrollView
        }
        .background(IOSColor.canvas(colorScheme))
        .navigationTitle("Plan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        model.requestNavigation(to: .calendar)
                    } label: {
                        Label("Calendar Agenda", systemImage: "calendar")
                    }
                    Button {
                        model.requestNavigation(to: .matrix)
                    } label: {
                        Label("Eisenhower Matrix", systemImage: "square.grid.2x2")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { captureFocused = false }
            }
        }
    }

    // MARK: - Task Scroll View

    private var taskScrollView: some View {
        ScrollView {
            VStack(spacing: IOSSpacing.tight) {
                quickCaptureBar

                if filteredTasks.isEmpty {
                    emptyStateForScope
                        .padding(.top, IOSSpacing.major)
                } else {
                    ForEach(filteredTasks) { task in
                        taskRowLink(task)
                    }
                }
            }
            .padding(.horizontal, IOSSpacing.normal)
            .padding(.bottom, IOSSpacing.pageBreak)
        }
        .scrollIndicators(.hidden)
        .refreshable {
            await model.reconcileForeground()
        }
    }

    private func taskRowLink(_ task: ProductivityTask) -> some View {
        NavigationLink(destination: TaskDetailView(task: task)) {
            IOSTaskRow(
                task: task,
                onToggleComplete: {
                    Task {
                        if task.status == .completed {
                            await model.setTaskStatus(task, status: .planned)
                        } else {
                            await model.complete(task)
                        }
                    }
                },
                onSelect: {},
                onFocus: {
                    model.requestNavigation(to: .focus)
                },
                onDelete: {
                    Task { await model.setTaskStatus(task, status: .archived) }
                }
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Quick Capture Bar

    private var quickCaptureBar: some View {
        HStack(spacing: IOSSpacing.tight) {
            Image(systemName: "plus.circle.fill")
                .font(.title3)
                .foregroundStyle(IOSColor.teal(colorScheme))

            TextField("Add a task to \(selectedScope.rawValue)...", text: $captureTitle)
                .font(IOSTypography.subheadline)
                .focused($captureFocused)
                .submitLabel(.done)
                .onSubmit { submitTask() }

            if !captureTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button(action: submitTask) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title3)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, IOSSpacing.normal)
        .padding(.vertical, 10)
        .background(
            IOSColor.surface(colorScheme),
            in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                .stroke(IOSColor.border(colorScheme), lineWidth: 1)
        }
    }

    private func submitTask() {
        let trimmed = captureTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        captureTitle = ""
        captureFocused = false

        Task {
            await model.createTask(title: trimmed)
        }
    }

    // MARK: - Filtered Tasks

    private var filteredTasks: [ProductivityTask] {
        let todayDay = String(IOSProductCalendar.dayString().prefix(10))
        let now = Date()

        switch selectedScope {
        case .today:
            return model.tasks.filter { task in
                guard task.status != .completed && task.status != .archived && task.status != .canceled else { return false }
                if let sched = task.scheduledStartAt, sched.starts(with: todayDay) { return true }
                if let due = task.dueAt {
                    if due.starts(with: todayDay) { return true }
                    if let date = IOSProductCalendar.date(from: due), date < now { return true }
                }
                return false
            }

        case .inbox:
            return model.tasks.filter { task in
                task.status == .inbox || (task.status != .completed && task.status != .archived && task.scheduledStartAt == nil && task.dueAt == nil)
            }

        case .upcoming:
            return model.tasks.filter { task in
                guard task.status != .completed && task.status != .archived else { return false }
                if let sched = task.scheduledStartAt, !sched.starts(with: todayDay) { return true }
                if let due = task.dueAt, !due.starts(with: todayDay), let date = IOSProductCalendar.date(from: due), date > now { return true }
                return false
            }

        case .all:
            return model.tasks.filter { $0.status != .archived && $0.status != .canceled }

        case .completed:
            return model.tasks.filter { $0.status == .completed }
        }
    }

    @ViewBuilder
    private var emptyStateForScope: some View {
        switch selectedScope {
        case .today:
            IOSEmptyState(
                icon: "sun.max",
                title: "No Tasks For Today",
                description: "Capture what you want to achieve today, or check Upcoming tasks."
            )
        case .inbox:
            IOSEmptyState(
                icon: "tray",
                title: "Inbox is Clear",
                description: "Unsorted tasks captured on the fly will arrive here."
            )
        case .upcoming:
            IOSEmptyState(
                icon: "calendar.badge.clock",
                title: "No Upcoming Tasks",
                description: "Schedule tasks for future dates to keep track of deadlines."
            )
        case .all:
            IOSEmptyState(
                icon: "checklist",
                title: "No Tasks Found",
                description: "Create your first task to start organizing your work."
            )
        case .completed:
            IOSEmptyState(
                icon: "checkmark.circle",
                title: "No Completed Tasks",
                description: "Finished tasks will be archived here."
            )
        }
    }
}
