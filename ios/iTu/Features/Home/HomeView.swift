import SwiftUI
import iTuDomain
import iTuDesignCore

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                SyncBanner()
                VStack(alignment: .leading, spacing: 5) {
                    Text("Good to see you, \(model.user?.accountLabel ?? "there")")
                        .font(.largeTitle.bold())
                        .tracking(-0.5)
                    Text("A clear next step for today.")
                        .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                }
                nextActionCard
                todayTasksCard
                todayHabitsCard
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollIndicators(.hidden)
        .background(iTuTheme.color(iTuDesignTokens.canvas, scheme: colorScheme))
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var openTasks: [ProductivityTask] {
        model.tasks.filter { $0.status != .completed }
    }

    @ViewBuilder
    private var nextActionCard: some View {
        if let active = model.activeFocusSession {
            Button { model.requestNavigation(to: .focus) } label: {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Focus Session in progress", systemImage: "timer")
                        .font(.caption.weight(.semibold))
                        .textCase(.uppercase)
                        .tracking(0.8)
                    Text(active.customTitle ?? active.taskTitleSnapshot ?? "Stay with the work")
                        .font(.title3.bold())
                    Text("Return to your Focus Session")
                        .font(.subheadline)
                        .opacity(0.82)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .foregroundStyle(.white)
                .background(forestGradient, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens Focus")
        } else if let task = openTasks.first {
            VStack(alignment: .leading, spacing: 12) {
                Text("NEXT UP")
                    .font(.caption.weight(.semibold))
                    .tracking(1)
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme))
                Text(task.title)
                    .font(.title3.bold())
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.ink, scheme: colorScheme))
                HStack(spacing: 10) {
                    NavigationLink("Open Task", destination: TaskDetailView(task: task))
                        .buttonStyle(.borderedProminent)
                    Button("Focus") { model.requestNavigation(to: .focus) }
                        .buttonStyle(.bordered)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .iTuMobilePanel(cornerRadius: 18)
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text("A quiet start")
                    .font(.title3.bold())
                Text("Capture one Task and give it your full attention.")
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                Button("Add a Task") { model.requestNavigation(to: .plan) }
                    .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .iTuMobilePanel(cornerRadius: 18)
        }
    }

    private var todayTasksCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(title: "Open Tasks", action: "See all") {
                model.requestNavigation(to: .plan)
            }
            if model.tasks.isEmpty {
                IOSContentUnavailableView("No Tasks yet", systemImage: "checklist", description: "Add one from Plan to begin.")
            } else {
                ForEach(openTasks.prefix(5)) { task in
                    HStack(spacing: 10) {
                        Button {
                            guard task.status != .completed else { return }
                            Task { await model.complete(task) }
                        } label: {
                            Image(systemName: task.status == .completed ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .foregroundStyle(task.status == .completed ? iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme) : .secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(task.status == .completed ? "Completed" : "Complete Task")
                        NavigationLink(destination: TaskDetailView(task: task)) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(task.title).strikethrough(task.status == .completed)
                                Text(task.status.displayName)
                                    .font(.caption)
                                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                            }
                        }
                    }
                    .accessibilityElement(children: .contain)
                }
            }
        }
        .padding(16)
        .iTuMobilePanel()
    }

    private var todayHabitsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(title: "Habit check-ins", action: "See all") {
                model.requestNavigation(to: .habits)
            }
            if model.habits.isEmpty {
                Text("No Habits yet. Add a Habit to make progress visible here.")
                    .font(.subheadline)
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
            } else {
                ForEach(model.habits.prefix(3)) { habit in
                    HStack(spacing: 10) {
                        Image(systemName: habit.isCompletedToday ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(habit.isCompletedToday ? iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme) : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(habit.name)
                            Text("\(habit.currentStreak) day streak")
                                .font(.caption)
                                .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                        }
                        Spacer()
                        if !habit.isCompletedToday {
                            Button("Check in") { Task { await model.checkIn(habit) } }
                                .buttonStyle(.bordered)
                        }
                    }
                }
            }
        }
        .padding(16)
        .iTuMobilePanel()
    }

    private var forestGradient: LinearGradient {
        LinearGradient(
            colors: [
                iTuTheme.color(iTuDesignTokens.forest, scheme: colorScheme),
                iTuTheme.color(iTuDesignTokens.forestDeep, scheme: colorScheme)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private struct SectionHeading: View {
    let title: String
    let action: String
    let onAction: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.headline)
            Spacer()
            Button(action, action: onAction)
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
        }
    }
}
