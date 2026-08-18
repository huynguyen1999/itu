import SwiftUI
import iTuDomain
import iTuDesignCore

public struct HabitsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var isCompletedExpanded = false
    @State private var showingNewHabitSheet = false
    @State private var newHabitName = ""
    @State private var newHabitType = "BOOLEAN"
    @State private var newHabitTarget = "1"

    public init() {}

    private var incompleteHabits: [HabitModel] {
        model.habits.filter { !$0.isCompletedToday && $0.archivedAt == nil }
    }

    private var completedHabits: [HabitModel] {
        model.habits.filter { $0.isCompletedToday && $0.archivedAt == nil }
    }

    private var completionRate: Double {
        guard !model.habits.isEmpty else { return 0 }
        return Double(completedHabits.count) / Double(model.habits.count)
    }

    public var body: some View {
        IOSPage {
            // Header with Date & Today's Completion Progress Bar
            headerProgressCard

            // Inline Sync Issue Banner if needed
            IOSSyncIssueBanner()

            // Incomplete Habits ("Needs Attention")
            if !incompleteHabits.isEmpty {
                IOSSection(title: "Today's Habits", subtitle: "\(incompleteHabits.count) remaining") {
                    VStack(spacing: IOSSpacing.tight) {
                        ForEach(incompleteHabits) { habit in
                            habitRow(habit)
                        }
                    }
                }
            } else if model.habits.isEmpty {
                IOSEmptyState(
                    icon: "repeat",
                    title: "No Habits Yet",
                    description: "Habits help you build consistency one day at a time."
                ) {
                    Button("Create First Habit") { showingNewHabitSheet = true }
                        .font(IOSTypography.captionBold)
                        .buttonStyle(.borderedProminent)
                        .tint(IOSColor.teal(colorScheme))
                }
            } else {
                IOSEmptyState(
                    icon: "checkmark.circle.fill",
                    title: "All Habits Completed!",
                    description: "Great job! You have completed all \(completedHabits.count) habits for today."
                )
            }

            // Completed Section (Collapsible)
            if !completedHabits.isEmpty {
                IOSSection(
                    title: "Completed Today (\(completedHabits.count))",
                    action: {
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                isCompletedExpanded.toggle()
                            }
                        } label: {
                            Image(systemName: isCompletedExpanded ? "chevron.up" : "chevron.down")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(IOSColor.inkDim(colorScheme))
                        }
                    }
                ) {
                    if isCompletedExpanded {
                        VStack(spacing: IOSSpacing.tight) {
                            ForEach(completedHabits) { habit in
                                habitRow(habit)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Habits")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingNewHabitSheet = true
                } label: {
                    Image(systemName: "plus")
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }
                .accessibilityLabel("Create Habit")
            }
        }
        .sheet(isPresented: $showingNewHabitSheet) {
            NavigationStack {
                Form {
                    Section("Habit Details") {
                        TextField("Habit Name", text: $newHabitName)
                        Picker("Type", selection: $newHabitType) {
                            Text("Yes/No (Boolean)").tag("BOOLEAN")
                            Text("Count (Glasses, Reps)").tag("COUNT")
                            Text("Duration (Minutes)").tag("DURATION")
                        }
                        if newHabitType != "BOOLEAN" {
                            TextField("Daily Target", text: $newHabitTarget)
                                .keyboardType(.numberPad)
                        }
                    }
                }
                .navigationTitle("New Habit")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingNewHabitSheet = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            let name = newHabitName.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !name.isEmpty else { return }
                            showingNewHabitSheet = false
                            newHabitName = ""
                            // Create habit via AppModel
                        }
                        .disabled(newHabitName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }

    // MARK: - Header Progress Card

    private var headerProgressCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(currentDateFormatted.uppercased())
                            .font(IOSTypography.kicker)
                            .tracking(1.2)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                        Text("\(completedHabits.count) of \(max(1, model.habits.count)) completed")
                            .font(IOSTypography.title)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                    }
                    Spacer()
                    Text("\(Int(completionRate * 100))%")
                        .font(IOSTypography.metric)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }

                ProgressView(value: completionRate)
                    .tint(IOSColor.teal(colorScheme))
            }
        }
    }

    private var currentDateFormatted: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEEE · MMM d"
        return formatter.string(from: Date())
    }

    // MARK: - Type-Aware Habit Row

    private func habitRow(_ habit: HabitModel) -> some View {
        NavigationLink(destination: HabitDetailView(habit: habit)) {
            HStack(spacing: IOSSpacing.compact) {
                // Interactive Check-in or Stepper
                typeAwareControl(for: habit)

                VStack(alignment: .leading, spacing: 3) {
                    Text(habit.name)
                        .font(IOSTypography.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                        .strikethrough(habit.isCompletedToday, color: IOSColor.inkDim(colorScheme))

                    HStack(spacing: 8) {
                        if habit.currentStreak > 0 {
                            HStack(spacing: 2) {
                                Image(systemName: "flame.fill")
                                    .font(.caption2)
                                    .foregroundStyle(IOSColor.amber(colorScheme))
                                Text("\(habit.currentStreak)d")
                                    .font(IOSTypography.caption)
                                    .foregroundStyle(IOSColor.inkDim(colorScheme))
                            }
                        }

                        targetProgressLabel(for: habit)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(IOSColor.inkFaint(colorScheme))
            }
            .padding(.horizontal, IOSSpacing.normal)
            .padding(.vertical, IOSSpacing.compact)
            .background(
                IOSColor.surface(colorScheme),
                in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                    .stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func typeAwareControl(for habit: HabitModel) -> some View {
        switch habit.targetType.uppercased() {
        case "BOOLEAN":
            Button {
                Task { await model.checkIn(habit) }
            } label: {
                Image(systemName: habit.isCompletedToday ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(
                        habit.isCompletedToday
                            ? IOSColor.teal(colorScheme)
                            : IOSColor.inkFaint(colorScheme)
                    )
                    .frame(width: IOSMetrics.minimumHitTarget, height: IOSMetrics.minimumHitTarget)
            }
            .buttonStyle(.plain)
            .disabled(habit.isCompletedToday)

        case "COUNT":
            Button {
                Task { await model.checkIn(habit, value: 1) }
            } label: {
                Image(systemName: habit.isCompletedToday ? "checkmark.circle.fill" : "plus.circle.fill")
                    .font(.title2)
                    .foregroundStyle(IOSColor.teal(colorScheme))
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)

        case "DURATION":
            Button {
                Task { await model.checkIn(habit, value: 5) }
            } label: {
                Text("+5m")
                    .font(IOSTypography.captionBold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(IOSColor.mintTint(colorScheme), in: Capsule())
                    .foregroundStyle(IOSColor.teal(colorScheme))
            }
            .buttonStyle(.plain)

        default:
            Button {
                Task { await model.checkIn(habit) }
            } label: {
                Image(systemName: habit.isCompletedToday ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(habit.isCompletedToday ? IOSColor.teal(colorScheme) : IOSColor.inkFaint(colorScheme))
                    .frame(width: IOSMetrics.minimumHitTarget, height: IOSMetrics.minimumHitTarget)
            }
            .buttonStyle(.plain)
            .disabled(habit.isCompletedToday)
        }
    }

    private func targetProgressLabel(for habit: HabitModel) -> some View {
        Group {
            switch habit.targetType.uppercased() {
            case "COUNT":
                Text("\(Int(habit.isCompletedToday ? habit.targetValue : 0)) / \(Int(habit.targetValue)) \(habit.unit ?? "")")
                    .font(IOSTypography.caption)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
            case "DURATION":
                Text("\(Int(habit.isCompletedToday ? habit.targetValue : 0)) / \(Int(habit.targetValue)) min")
                    .font(IOSTypography.caption)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
            default:
                EmptyView()
            }
        }
    }
}
