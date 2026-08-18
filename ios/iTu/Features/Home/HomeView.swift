import SwiftUI
import iTuDomain
import iTuDesignCore

public struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var showingQuickCapture = false
    @State private var showingNewTaskSheet = false
    @State private var quickTaskTitle = ""

    public init() {}

    public var body: some View {
        IOSPage {
            // Header with date & greeting
            header

            // Actionable sync issues banner (only appears when error/conflict exists)
            IOSSyncIssueBanner()

            // 1. Current State Hero
            currentStateHero

            // 2. Today's Progress Strip (3 compact metrics)
            todayProgressStrip

            // 3. Open Tasks
            tasksSection

            // 4. Habits Check-ins
            habitsSection

            // 5. Daily Snapshot (Usage & Health overview)
            dailySnapshotCard
        }
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingQuickCapture = true
                } label: {
                    Image(systemName: "plus")
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }
                .accessibilityLabel("Quick capture")
            }
        }
        .confirmationDialog("New", isPresented: $showingQuickCapture) {
            Button("New Task") { showingNewTaskSheet = true }
            Button("New Journal Note") { model.requestNavigation(to: .journal) }
            Button("New Expense") { model.requestNavigation(to: .budget) }
            Button("New Habit") { model.requestNavigation(to: .habits) }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $showingNewTaskSheet) {
            NavigationStack {
                VStack(spacing: IOSSpacing.normal) {
                    TextField("What needs to be done?", text: $quickTaskTitle)
                        .font(IOSTypography.body)
                        .padding(IOSSpacing.normal)
                        .background(
                            IOSColor.surfaceMuted(colorScheme),
                            in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous)
                        )
                    Spacer()
                }
                .padding(IOSSpacing.normal)
                .navigationTitle("New Task")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            quickTaskTitle = ""
                            showingNewTaskSheet = false
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Create") {
                            let title = quickTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !title.isEmpty else { return }
                            quickTaskTitle = ""
                            showingNewTaskSheet = false
                            Task { await model.createTask(title: title) }
                        }
                        .disabled(quickTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .presentationDetents([.fraction(0.35)])
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: IOSSpacing.micro) {
            Text(currentDateFormatted.uppercased())
                .font(IOSTypography.kicker)
                .tracking(1.2)
                .foregroundStyle(IOSColor.teal(colorScheme))
            Text(greetingText)
                .font(IOSTypography.largeTitle)
                .tracking(-0.5)
                .foregroundStyle(IOSColor.ink(colorScheme))
            Text("Here's your day at a glance.")
                .font(IOSTypography.subheadline)
                .foregroundStyle(IOSColor.inkDim(colorScheme))
        }
        .padding(.vertical, IOSSpacing.micro)
    }

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let name = model.user?.accountLabel ?? "there"
        if hour < 12 {
            return "Good morning, \(name)"
        } else if hour < 18 {
            return "Good afternoon, \(name)"
        } else {
            return "Good evening, \(name)"
        }
    }

    private var currentDateFormatted: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEEE, d MMMM"
        return formatter.string(from: Date())
    }

    // MARK: - Current State Hero

    @ViewBuilder
    private var currentStateHero: some View {
        if let active = model.activeFocusSession {
            IOSHeroCard {
                VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                    HStack {
                        Label("FOCUS IN PROGRESS", systemImage: "timer")
                            .font(IOSTypography.kicker)
                            .tracking(1.2)
                            .foregroundStyle(IOSColor.mint(colorScheme))
                        Spacer()
                        Circle()
                            .fill(IOSColor.mint(colorScheme))
                            .frame(width: 8, height: 8)
                    }

                    Text(active.customTitle ?? active.taskTitleSnapshot ?? "Stay with the work")
                        .font(IOSTypography.title)
                        .lineLimit(2)

                    Button {
                        model.requestNavigation(to: .focus)
                    } label: {
                        HStack(spacing: 6) {
                            Text("Resume Session")
                                .font(IOSTypography.headline)
                            Image(systemName: "arrow.right")
                                .font(.caption.weight(.bold))
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.2), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        } else if let nextTask = prioritizedTasks.first {
            IOSCard {
                VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                    HStack {
                        Text("NEXT UP")
                            .font(IOSTypography.kicker)
                            .tracking(1.2)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                        Spacer()
                        if nextTask.priority == .high {
                            Text("HIGH")
                                .font(IOSTypography.kicker)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(IOSColor.amber(colorScheme).opacity(0.16), in: Capsule())
                                .foregroundStyle(IOSColor.amber(colorScheme))
                        }
                    }

                    Text(nextTask.title)
                        .font(IOSTypography.title)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                        .lineLimit(2)

                    HStack(spacing: IOSSpacing.compact) {
                        NavigationLink(destination: TaskDetailView(task: nextTask)) {
                            Text("Open Task")
                                .font(IOSTypography.subheadline)
                                .fontWeight(.semibold)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(IOSColor.teal(colorScheme), in: Capsule())
                                .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)

                        Button {
                            model.requestNavigation(to: .focus)
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "timer")
                                Text("Focus")
                            }
                            .font(IOSTypography.subheadline)
                            .fontWeight(.semibold)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(IOSColor.surfaceMuted(colorScheme), in: Capsule())
                            .overlay(Capsule().stroke(IOSColor.border(colorScheme), lineWidth: 1))
                            .foregroundStyle(IOSColor.ink(colorScheme))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        } else {
            IOSCard {
                VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                    Text("A quiet start")
                        .font(IOSTypography.title)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                    Text("All scheduled work is complete. Capture a task to begin.")
                        .font(IOSTypography.subheadline)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                    Button {
                        showingNewTaskSheet = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus")
                            Text("Add a Task")
                        }
                        .font(IOSTypography.subheadline)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(IOSColor.teal(colorScheme), in: Capsule())
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Progress Strip

    private var todayProgressStrip: some View {
        HStack(spacing: IOSSpacing.tight) {
            IOSMetricCard(
                title: "Tasks",
                value: "\(completedTasksCount)/\(max(1, model.tasks.count))",
                subtitle: "\(openTasks.count) remaining",
                icon: "checklist",
                tint: IOSColor.teal(colorScheme)
            )

            IOSMetricCard(
                title: "Focus",
                value: formattedTodayFocus,
                subtitle: "\(todayFocusSessionsCount) sessions",
                icon: "timer",
                tint: IOSColor.mint(colorScheme)
            )

            IOSMetricCard(
                title: "Habits",
                value: "\(completedHabitsCount)/\(max(1, model.habits.count))",
                subtitle: "\(model.habits.count - completedHabitsCount) left",
                icon: "repeat.circle",
                tint: IOSColor.amber(colorScheme)
            )
        }
    }

    // MARK: - Tasks Section

    private var tasksSection: some View {
        IOSSection(
            title: "Today's Tasks",
            subtitle: "\(openTasks.count) open",
            action: {
                Button("See all") {
                    model.requestNavigation(to: .plan)
                }
                .font(IOSTypography.captionBold)
                .foregroundStyle(IOSColor.teal(colorScheme))
            }
        ) {
            if openTasks.isEmpty {
                IOSEmptyState(
                    icon: "checklist",
                    title: "No Open Tasks",
                    description: "You're all caught up for today."
                ) {
                    Button("Plan Tomorrow") { model.requestNavigation(to: .plan) }
                        .font(IOSTypography.captionBold)
                        .buttonStyle(.bordered)
                        .tint(IOSColor.teal(colorScheme))
                }
            } else {
                VStack(spacing: IOSSpacing.tight) {
                    ForEach(prioritizedTasks.prefix(5)) { task in
                        IOSTaskRow(
                            task: task,
                            onToggleComplete: {
                                Task { await model.complete(task) }
                            },
                            onSelect: {
                                // Handled by NavigationLink in parent stack
                            },
                            onFocus: {
                                model.requestNavigation(to: .focus)
                            },
                            onDelete: {
                                Task { await model.setTaskStatus(task, status: .archived) }
                            }
                        )
                    }
                }
            }
        }
    }

    // MARK: - Habits Section

    private var habitsSection: some View {
        IOSSection(
            title: "Habit Check-ins",
            subtitle: "\(completedHabitsCount) of \(model.habits.count) done",
            action: {
                Button("See all") {
                    model.requestNavigation(to: .habits)
                }
                .font(IOSTypography.captionBold)
                .foregroundStyle(IOSColor.teal(colorScheme))
            }
        ) {
            if model.habits.isEmpty {
                IOSEmptyState(
                    icon: "repeat",
                    title: "No Habits Set",
                    description: "Build routines to stay consistent every day."
                ) {
                    Button("Create Habit") { model.requestNavigation(to: .habits) }
                        .font(IOSTypography.captionBold)
                        .buttonStyle(.bordered)
                        .tint(IOSColor.teal(colorScheme))
                }
            } else {
                VStack(spacing: IOSSpacing.tight) {
                    ForEach(model.habits.prefix(3)) { habit in
                        habitRow(habit)
                    }
                }
            }
        }
    }

    private func habitRow(_ habit: HabitModel) -> some View {
        HStack(spacing: IOSSpacing.compact) {
            Button {
                Task { await model.checkIn(habit) }
            } label: {
                Image(systemName: habit.isCompletedToday ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(
                        habit.isCompletedToday
                            ? IOSColor.teal(colorScheme)
                            : IOSColor.inkFaint(colorScheme)
                    )
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .disabled(habit.isCompletedToday)

            VStack(alignment: .leading, spacing: 2) {
                Text(habit.name)
                    .font(IOSTypography.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(IOSColor.ink(colorScheme))
                HStack(spacing: 6) {
                    if habit.currentStreak > 0 {
                        HStack(spacing: 2) {
                            Image(systemName: "flame.fill")
                                .font(.caption2)
                                .foregroundStyle(IOSColor.amber(colorScheme))
                            Text("\(habit.currentStreak)d streak")
                                .font(IOSTypography.caption)
                        }
                    }
                    Text(habit.targetType)
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkFaint(colorScheme))
                }
            }

            Spacer()

            if !habit.isCompletedToday {
                Button("Check in") {
                    Task { await model.checkIn(habit) }
                }
                .font(IOSTypography.captionBold)
                .buttonStyle(.bordered)
                .tint(IOSColor.teal(colorScheme))
            } else {
                Text("Done")
                    .font(IOSTypography.captionBold)
                    .foregroundStyle(IOSColor.teal(colorScheme))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(IOSColor.mintTint(colorScheme), in: Capsule())
            }
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
    }

    // MARK: - Daily Snapshot Card

    private var dailySnapshotCard: some View {
        Button {
            model.requestNavigation(to: .statistics)
        } label: {
            IOSCard {
                VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                    HStack {
                        Text("TODAY'S ACTIVITY")
                            .font(IOSTypography.kicker)
                            .tracking(1.2)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(IOSColor.inkFaint(colorScheme))
                    }

                    HStack(spacing: IOSSpacing.major) {
                        snapshotMetric(
                            icon: "hourglass",
                            label: "Screen Time",
                            value: formattedScreenTime
                        )
                        snapshotMetric(
                            icon: "figure.walk",
                            label: "Steps",
                            value: formattedSteps
                        )
                        snapshotMetric(
                            icon: "bed.double.fill",
                            label: "Sleep",
                            value: formattedSleep
                        )
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func snapshotMetric(icon: String, label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.caption2)
                    .foregroundStyle(IOSColor.teal(colorScheme))
                Text(label)
                    .font(IOSTypography.caption)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
            }
            Text(value)
                .font(IOSTypography.headline)
                .foregroundStyle(IOSColor.ink(colorScheme))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Helpers & Aggregations

    private var openTasks: [ProductivityTask] {
        model.tasks.filter { $0.status != .completed && $0.status != .archived && $0.status != .canceled }
    }

    private var completedTasksCount: Int {
        model.tasks.filter { $0.status == .completed }.count
    }

    private var completedHabitsCount: Int {
        model.habits.filter { $0.isCompletedToday }.count
    }

    private var todayFocusSessionsCount: Int {
        let day = String(IOSProductCalendar.dayString().prefix(10))
        return model.focusSessions.filter { session in
            (session.startedAt ?? "").starts(with: day)
        }.count
    }

    private var formattedTodayFocus: String {
        let day = String(IOSProductCalendar.dayString().prefix(10))
        let totalSeconds = model.focusSessions.filter { $0.startedAt.starts(with: day) }
            .reduce(0) { (res: Int, s: FocusSession) in res + (s.plannedSeconds ?? 0) }

        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else {
            return "\(minutes)m"
        }
    }

    private var formattedScreenTime: String {
        let totalSecs = model.usageSummaries.reduce(0) { $0 + $1.activeSeconds }
        if totalSecs == 0 { return "—" }
        let hours = totalSecs / 3600
        let mins = (totalSecs % 3600) / 60
        return "\(hours)h \(mins)m"
    }

    private var formattedSteps: String {
        let latest = model.healthDailySummaries.last?.steps
        if let latest, latest > 0 {
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            return formatter.string(from: NSNumber(value: latest)) ?? "\(latest)"
        }
        return "—"
    }

    private var formattedSleep: String {
        let sleepMinutes = model.healthDailySummaries.last?.sleepMinutes
        if let sleepMinutes, sleepMinutes > 0 {
            let hours = sleepMinutes / 60
            let mins = sleepMinutes % 60
            return "\(hours)h \(mins)m"
        }
        return "—"
    }

    private var prioritizedTasks: [ProductivityTask] {
        openTasks.sorted { left, right in
            // 1. Scheduled tasks first
            let leftScheduled = left.scheduledStartAt != nil
            let rightScheduled = right.scheduledStartAt != nil
            if leftScheduled != rightScheduled { return leftScheduled }

            // 2. Overdue tasks next
            let now = Date()
            let leftDue = left.dueAt.flatMap { IOSProductCalendar.date(from: $0) }
            let rightDue = right.dueAt.flatMap { IOSProductCalendar.date(from: $0) }
            let leftOverdue = (leftDue ?? .distantFuture) < now
            let rightOverdue = (rightDue ?? .distantFuture) < now
            if leftOverdue != rightOverdue { return leftOverdue }

            // 3. Priority high
            let leftHigh = left.priority == .high
            let rightHigh = right.priority == .high
            if leftHigh != rightHigh { return leftHigh }

            // 4. Important
            if left.important != right.important { return left.important }

            return (left.createdAt ?? "") > (right.createdAt ?? "")
        }
    }
}
