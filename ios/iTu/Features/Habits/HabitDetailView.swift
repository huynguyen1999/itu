import SwiftUI
import iTuDomain
import iTuDesignCore

public struct HabitDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    let habit: HabitModel
    @State private var showingArchiveConfirmation = false

    public init(habit: HabitModel) {
        self.habit = habit
    }

    private var liveHabit: HabitModel {
        model.habits.first(where: { $0.id == habit.id }) ?? habit
    }

    public var body: some View {
        IOSPage {
            // Hero card with streak & completion status
            heroCard

            // Target & Measurement Card
            measurementCard

            // Weekly & Consistency Card
            weeklyConsistencyCard

            // Monthly Calendar Heatmap
            monthlyHeatmapCard

            // Checklist items if present
            if !liveHabit.checklistItems.isEmpty {
                checklistCard
            }

            // Reminders card
            remindersCard

            // Archive Button
            archiveButton
        }
        .navigationTitle(liveHabit.name)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Archive Habit?", isPresented: $showingArchiveConfirmation) {
            Button("Archive Habit", role: .destructive) {
                // Archive habit logic
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Archiving keeps your historical progress while hiding this habit from daily check-ins.")
        }
    }

    // MARK: - Hero Card

    private var heroCard: some View {
        IOSHeroCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack {
                    Image(systemName: liveHabit.icon.isEmpty ? "repeat" : liveHabit.icon)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(IOSColor.mint(colorScheme))
                        .frame(width: 44, height: 44)
                        .background(Color.white.opacity(0.15), in: Circle())
                    Spacer()
                    if liveHabit.currentStreak > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "flame.fill")
                                .foregroundStyle(IOSColor.amber(colorScheme))
                            Text("\(liveHabit.currentStreak) days")
                                .font(IOSTypography.headline)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.15), in: Capsule())
                    }
                }

                Text(liveHabit.name)
                    .font(IOSTypography.title)
                    .lineLimit(2)

                if let desc = liveHabit.description, !desc.isEmpty {
                    Text(desc)
                        .font(IOSTypography.subheadline)
                        .foregroundStyle(.white.opacity(0.82))
                }

                HStack(spacing: IOSSpacing.compact) {
                    Button {
                        Task { await model.checkIn(liveHabit) }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: liveHabit.isCompletedToday ? "checkmark.circle.fill" : "plus.circle.fill")
                            Text(liveHabit.isCompletedToday ? "Completed Today" : "Check In")
                        }
                        .font(IOSTypography.headline)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(liveHabit.isCompletedToday ? IOSColor.mint(colorScheme) : Color.white, in: Capsule())
                        .foregroundStyle(liveHabit.isCompletedToday ? .white : IOSColor.forestDeep(colorScheme))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, IOSSpacing.tight)
            }
        }
    }

    // MARK: - Measurement & Target Card

    private var measurementCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("TARGET & GOAL")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                HStack(spacing: IOSSpacing.major) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Type")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                        Text(liveHabit.targetType.capitalized)
                            .font(IOSTypography.headline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Target")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                        Text(formattedTargetValue)
                            .font(IOSTypography.headline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Direction")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                        Text(liveHabit.direction == .build ? "Build" : "Limit")
                            .font(IOSTypography.headline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                    }
                }
            }
        }
    }

    private var formattedTargetValue: String {
        switch liveHabit.targetType.uppercased() {
        case "BOOLEAN":  return "1 / day"
        case "COUNT":    return "\(Int(liveHabit.targetValue)) \(liveHabit.unit ?? "times")"
        case "DURATION": return "\(Int(liveHabit.targetValue)) min"
        default:         return "\(Int(liveHabit.targetValue)) \(liveHabit.unit ?? "")"
        }
    }

    // MARK: - Weekly Consistency Card

    private var weeklyConsistencyCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("STREAKS & STATS")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                HStack(spacing: IOSSpacing.major) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Current Streak")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                        Text("\(liveHabit.currentStreak) days")
                            .font(IOSTypography.metric)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Best Streak")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                        Text("\(liveHabit.bestStreak) days")
                            .font(IOSTypography.metric)
                            .foregroundStyle(IOSColor.amber(colorScheme))
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Total")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                        Text("\(liveHabit.totalCompletions)")
                            .font(IOSTypography.metric)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                    }
                }
            }
        }
    }

    // MARK: - Monthly Heatmap Card

    private var monthlyHeatmapCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("RECENT ACTIVITY (LAST 14 DAYS)")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                HStack(spacing: 6) {
                    ForEach(0..<14, id: \.self) { dayOffset in
                        let isToday = dayOffset == 13
                        let isDone = isToday ? liveHabit.isCompletedToday : (dayOffset % 2 == 0 || dayOffset > 7)
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(
                                isDone
                                    ? IOSColor.teal(colorScheme)
                                    : IOSColor.borderSoft(colorScheme)
                            )
                            .frame(height: 24)
                            .overlay {
                                if isToday {
                                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                                        .stroke(IOSColor.ink(colorScheme), lineWidth: 1.5)
                                }
                            }
                    }
                }
            }
        }
    }

    // MARK: - Checklist Card

    private var checklistCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("SUB-STEPS")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                ForEach(Array(liveHabit.checklistItems.enumerated()), id: \.offset) { _, item in
                    HStack(spacing: IOSSpacing.compact) {
                        Image(systemName: "circle")
                            .foregroundStyle(IOSColor.teal(colorScheme))
                        Text(item.title)
                            .font(IOSTypography.subheadline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                    }
                }
            }
        }
    }

    // MARK: - Reminders Card

    private var remindersCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("REMINDERS")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                if liveHabit.reminderTimes.isEmpty {
                    Text("No reminders set for this habit.")
                        .font(IOSTypography.subheadline)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                } else {
                    ForEach(liveHabit.reminderTimes, id: \.self) { time in
                        HStack {
                            Image(systemName: "bell.fill")
                                .font(.caption)
                                .foregroundStyle(IOSColor.teal(colorScheme))
                            Text(time)
                                .font(IOSTypography.subheadline)
                                .foregroundStyle(IOSColor.ink(colorScheme))
                        }
                    }
                }
            }
        }
    }

    // MARK: - Archive Button

    private var archiveButton: some View {
        Button(role: .destructive) {
            showingArchiveConfirmation = true
        } label: {
            HStack {
                Image(systemName: "archivebox")
                Text("Archive Habit")
            }
            .font(IOSTypography.subheadline)
            .fontWeight(.semibold)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(IOSColor.coralTint(colorScheme).opacity(0.3), in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous))
            .foregroundStyle(IOSColor.coral(colorScheme))
        }
        .buttonStyle(.plain)
        .padding(.top, IOSSpacing.tight)
    }
}
