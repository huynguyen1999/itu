import SwiftUI

struct HabitsView: View {
    @Environment(AppModel.self) private var model

    @State private var showCreateSheet = false
    @State private var editingHabit: HabitModel?
    @State private var detailHabit: HabitModel?
    @State private var filterCategory: String = "All"
    @State private var collapsedGroups: Set<String> = []
    @State private var showGroupsSheet = false

    private var activeHabits: [HabitModel] {
        model.habits.filter { $0.archivedAt == nil }
    }

    private var weekDays: [HabitDay] {
        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dayFormatter = DateFormatter()
        dayFormatter.dateFormat = "EEE"
        return (0..<7).reversed().compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: -offset, to: Date()) else { return nil }
            return HabitDay(
                date: formatter.string(from: date),
                label: dayFormatter.string(from: date),
                number: calendar.component(.day, from: date),
                isToday: offset == 0
            )
        }
    }

    private var visibleWeekRange: (from: String, to: String)? {
        guard let first = weekDays.first, let last = weekDays.last else { return nil }
        return (first.date, last.date)
    }

    private var visibleWeekRangeKey: String {
        guard let range = visibleWeekRange else { return "empty" }
        return "\(range.from):\(range.to)"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        iTuSectionLabel(title: "TRACKING", color: iTuTheme.teal)
                        Text("Habits")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Build consistent daily routines and track your streaks.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }

                    Spacer()

                    Button {
                        let allCollapsed = !habitGroups.isEmpty && habitGroups.allSatisfy { collapsedGroups.contains($0.0) }
                        collapsedGroups = allCollapsed ? [] : Set(habitGroups.map(\.0))
                    } label: {
                        Image(systemName: "square.grid.2x2")
                            .font(.system(size: 14, weight: .semibold))
                            .frame(width: 30, height: 30)
                    }
                    .buttonStyle(iTuGhostButtonStyle())
                    .pointingHandCursor()
                    .help("Collapse or expand habit groups")

                    Button {
                        showGroupsSheet = true
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 14, weight: .semibold))
                            .frame(width: 30, height: 30)
                    }
                    .buttonStyle(iTuGhostButtonStyle())
                    .pointingHandCursor()
                    .help("Manage habit groups")

                    Button {
                        showCreateSheet = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus")
                                .font(.system(size: 13, weight: .bold))
                            Text("New Habit")
                                .font(.system(size: 13, weight: .semibold))
                        }
                    }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 38))
                }

                // Stats Overview
                overviewMetrics

                // Category Filter Pills
                filterRow

                weekCalendarHeader

                if model.habitOccurrencesLoading {
                    HStack(spacing: 8) {
                        ProgressView()
                            .controlSize(.small)
                        Text("Loading the visible week…")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .accessibilityElement(children: .combine)
                } else if let message = model.habitOccurrencesErrorMessage {
                    HStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(iTuTheme.coral)
                        Text("Could not load this week: \(message)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                            .lineLimit(2)
                        Spacer()
                        Button("Retry") {
                            guard let range = visibleWeekRange else { return }
                            Task { await model.refreshHabitOccurrences(from: range.from, to: range.to) }
                        }
                        .buttonStyle(iTuGhostButtonStyle())
                    }
                    .padding(12)
                    .iTuPanel(radius: 10)
                }

                // Habit Cards Grid
                if habitGroups.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "repeat")
                            .font(.system(size: 36))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("No Habits Found")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Create your first habit to start tracking consistent daily routines.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                    .iTuPanel(radius: 14)
                } else {
                    VStack(spacing: 12) {
                        ForEach(habitGroups, id: \.0) { group in
                            VStack(alignment: .leading, spacing: 8) {
                                Button {
                                    if collapsedGroups.contains(group.0) {
                                        collapsedGroups.remove(group.0)
                                    } else {
                                        collapsedGroups.insert(group.0)
                                    }
                                } label: {
                                    HStack(spacing: 8) {
                                        Image(systemName: collapsedGroups.contains(group.0) ? "chevron.right" : "chevron.down")
                                            .font(.system(size: 11, weight: .bold))
                                        Text(group.0)
                                            .font(.system(size: 12, weight: .bold, design: .rounded))
                                        Text("\(group.1.count)")
                                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                                            .foregroundStyle(iTuTheme.inkDim)
                                        Spacer()
                                    }
                                    .foregroundStyle(iTuTheme.ink)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .pointingHandCursor()

                                if !collapsedGroups.contains(group.0) {
                                    ForEach(group.1) { habit in
                                        HabitCardRow(
                                            habit: habit,
                                            weekDays: weekDays,
                                            occurrences: model.habitOccurrences,
                                            onCheckIn: { occurrence in
                                                Task { await model.checkInHabitOccurrence(occurrence, value: max(1, habit.targetValue)) }
                                            },
                                            onAction: { occurrence, action in
                                                Task { await model.habitOccurrenceAction(occurrence, action: action) }
                                            },
                                            isLoadingOccurrences: model.habitOccurrencesLoading,
                                            occurrencesFailed: model.habitOccurrencesErrorMessage != nil,
                                            onEdit: { editingHabit = habit },
                                            onOpenDetails: { detailHabit = habit },
                                            onArchive: { Task { await model.archiveHabit(habit) } }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(
            LinearGradient(
                colors: [iTuTheme.canvas, iTuTheme.mintTint.opacity(0.2)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .sheet(isPresented: $showCreateSheet) {
            HabitEditorSheet(habit: nil, timeBlocks: model.habitTimeBlocks) { newHabit in
                Task { await model.saveHabit(newHabit) }
            }
        }
        .sheet(item: $editingHabit) { habit in
            HabitEditorSheet(habit: habit, timeBlocks: model.habitTimeBlocks) { updated in
                Task { await model.saveHabit(updated) }
            }
        }
        .sheet(item: $detailHabit) { habit in
            HabitDetailSheet(
                habit: habit,
                stats: model.habitStatsByID[habit.id],
                onEdit: {
                    detailHabit = nil
                    editingHabit = habit
                }
            )
            .task { await model.refreshHabitStats(for: habit) }
        }
        .sheet(isPresented: $showGroupsSheet) {
            HabitGroupsSheet(
                timeBlocks: model.habitTimeBlocks,
                onCreate: { name in
                    Task { await model.createHabitTimeBlock(name: name) }
                }
            )
        }
        .task(id: visibleWeekRangeKey) {
            guard let range = visibleWeekRange else { return }
            await model.refreshHabitOccurrences(from: range.from, to: range.to)
        }
    }

    private var overviewMetrics: some View {
        HStack(spacing: 16) {
            MetricTile(
                title: "Active Habits",
                value: "\(activeHabits.count)",
                icon: "repeat",
                color: iTuTheme.teal
            )
            MetricTile(
                title: "Completed Today",
                value: "\(activeHabits.filter(\.isCompletedToday).count)/\(activeHabits.count)",
                icon: "checkmark.circle.fill",
                color: iTuTheme.mint
            )
            MetricTile(
                title: "Longest Streak",
                value: "\(activeHabits.map(\.bestStreak).max() ?? 0)d",
                icon: "flame.fill",
                color: iTuTheme.amber
            )
        }
    }

    private var filterRow: some View {
        HStack(spacing: 8) {
            ForEach(["All", "Daily", "Weekly"], id: \.self) { cat in
                Button {
                    filterCategory = cat
                } label: {
                    Text(cat)
                        .font(.system(size: 13, weight: filterCategory == cat ? .semibold : .medium))
                        .foregroundStyle(filterCategory == cat ? iTuTheme.teal : iTuTheme.inkDim)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(filterCategory == cat ? iTuTheme.mintTint : Color.clear)
                        .clipShape(Capsule())
                        .overlay {
                            Capsule()
                                .stroke(filterCategory == cat ? iTuTheme.teal.opacity(0.3) : iTuTheme.border, lineWidth: 1)
                        }
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
            }
        }
    }

    private var weekCalendarHeader: some View {
        HStack(spacing: 0) {
            Color.clear.frame(maxWidth: .infinity, alignment: .leading)
            ForEach(weekDays) { day in
                VStack(spacing: 3) {
                    Text(day.label)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(day.isToday ? iTuTheme.teal : iTuTheme.inkDim)
                    Text("\(day.number)")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundStyle(day.isToday ? iTuTheme.teal : iTuTheme.ink)
                    Circle()
                        .stroke(day.isToday ? iTuTheme.teal : iTuTheme.border, lineWidth: 1)
                        .frame(width: 16, height: 16)
                }
                .frame(width: 40)
            }
        }
        .padding(14)
        .iTuPanel(radius: 12)
    }

    private var filteredHabits: [HabitModel] {
        switch filterCategory {
        case "Daily":
            return activeHabits.filter { $0.frequency == .daily }
        case "Weekly":
            return activeHabits.filter { $0.frequency == .weekly }
        default:
            return activeHabits
        }
    }

    private var habitGroups: [(String, [HabitModel])] {
        let grouped = Dictionary(grouping: filteredHabits) { habit in
            model.habitTimeBlocks.first(where: { $0.id == habit.timeBlockId })?.name ?? "Anytime"
        }
        let orderedNames = model.habitTimeBlocks
            .sorted { $0.sortOrder < $1.sortOrder }
            .map(\.name) + ["Anytime"]
        return orderedNames.compactMap { name in
            guard let habits = grouped[name], !habits.isEmpty else { return nil }
            return (name, habits)
        }
    }

}

private struct HabitDay: Identifiable {
    let date: String
    let label: String
    let number: Int
    let isToday: Bool

    var id: String { date }
}

private struct MetricTile: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 42, height: 42)
                .background(color.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
                Text(value)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            Spacer()
        }
        .padding(14)
        .iTuPanel(radius: 12)
    }
}

private struct HabitCardRow: View {
    @Environment(AppModel.self) private var model

    let habit: HabitModel
    let weekDays: [HabitDay]
    let occurrences: [HabitOccurrenceModel]
    let onCheckIn: (HabitOccurrenceModel) -> Void
    let onAction: (HabitOccurrenceModel, String) -> Void
    let isLoadingOccurrences: Bool
    let occurrencesFailed: Bool
    let onEdit: () -> Void
    let onOpenDetails: () -> Void
    let onArchive: () -> Void

    @State private var isHovered = false

    private var todayOccurrence: HabitOccurrenceModel? {
        occurrences.first {
            $0.habitId == habit.id && $0.localDayString == (weekDays.last?.date ?? "")
        }
    }

    var body: some View {
        HStack(spacing: 16) {
            habitInfoButton
            Spacer()
            dayCirclesRow
            editButton
        }
        .padding(16)
        .iTuHoverCard()
        .iTuPanel(radius: 14)
        .contextMenu {
            rowContextMenu
        }
    }

    private var habitInfoButton: some View {
        Button(action: onOpenDetails) {
            HStack(spacing: 12) {
                Text(String(habit.icon.prefix(2)).uppercased())
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(iTuTheme.teal)
                    .frame(width: 36, height: 36)
                    .background(iTuTheme.mintTint)
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text(habit.name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)

                        Text(habit.frequency.rawValue.capitalized)
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(iTuTheme.borderSoft)
                            .clipShape(Capsule())
                    }

                    if let desc = habit.description, !desc.isEmpty {
                        Text(desc)
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                    }

                    streakBadges
                }
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }

    private var streakBadges: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 11, weight: .semibold))
                Text(habit.bestStreak > 0 ? "\(habit.bestStreak) Days" : "0 Day")
            }
            .foregroundStyle(iTuTheme.syncBlue)

            HStack(spacing: 4) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 11, weight: .semibold))
                Text(habit.currentStreak > 0 ? "\(habit.currentStreak) Day" : "0 Day")
            }
            .foregroundStyle(iTuTheme.amber)
        }
        .font(.system(size: 12, weight: .medium))
    }

    private var dayCirclesRow: some View {
        HStack(spacing: 8) {
            ForEach(weekDays) { day in
                let occurrence = occurrences.first {
                    $0.habitId == habit.id && $0.localDayString == day.date
                }
                HabitOccurrenceButton(
                    habitName: habit.name,
                    dayLabel: day.label,
                    dayNumber: day.number,
                    dayDate: day.date,
                    occurrence: occurrence,
                    isLoading: isLoadingOccurrences,
                    didFailLoading: occurrencesFailed,
                    onCheckIn: onCheckIn,
                    onAction: onAction,
                    onCheckInDate: {
                        Task { await model.checkInHabitDate(habitId: habit.id, date: day.date, value: max(1, habit.targetValue)) }
                    }
                )
            }
        }
    }

    private var editButton: some View {
        Button(action: onEdit) {
            Image(systemName: "ellipsis")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iTuTheme.inkFaint)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }

    @ViewBuilder
    private var rowContextMenu: some View {
        Button(todayOccurrence?.status == .completed ? "Unmark Check-in" : "Mark Done Today") {
            if let todayOccurrence {
                if todayOccurrence.status == .completed {
                    onAction(todayOccurrence, "undo")
                } else {
                    onCheckIn(todayOccurrence)
                }
            } else {
                let todayDate = weekDays.last?.date ?? ""
                Task { await model.checkInHabitDate(habitId: habit.id, date: todayDate, value: max(1, habit.targetValue)) }
            }
        }
        if let todayOccurrence, todayOccurrence.status == .pending {
            Button("Skip Today") { onAction(todayOccurrence, "skip") }
            Button("Record Today as Missed") { onAction(todayOccurrence, "fail") }
        } else if let todayOccurrence, todayOccurrence.status != .pending {
            Button("Undo Today's Status") { onAction(todayOccurrence, "undo") }
        }
        Button("View Details", action: onOpenDetails)
        Button("Edit Habit", action: onEdit)
        Button(habit.archivedAt == nil ? "Archive Habit" : "Restore Habit", action: onArchive)
    }
}

struct HabitOccurrenceButton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let habitName: String
    let dayLabel: String
    let dayNumber: Int
    let dayDate: String
    let occurrence: HabitOccurrenceModel?
    let isLoading: Bool
    let didFailLoading: Bool
    let onCheckIn: (HabitOccurrenceModel) -> Void
    let onAction: (HabitOccurrenceModel, String) -> Void
    var onCheckInDate: (() -> Void)? = nil

    @State private var isHovered = false

    var body: some View {
        Button {
            if let occurrence {
                if occurrence.status == .completed {
                    onAction(occurrence, "undo")
                } else {
                    onCheckIn(occurrence)
                }
            } else if let onCheckInDate {
                onCheckInDate()
            }
        } label: {
            ZStack {
                Circle()
                    .fill(isHovered ? iTuTheme.mintTint : Color.clear)
                Circle()
                    .stroke(isHovered ? iTuTheme.teal : Color.clear, lineWidth: 1.5)

                if occurrence?.status == .completed {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(iTuTheme.mint)
                } else if occurrence?.status == .failed {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(iTuTheme.coral)
                } else if occurrence?.status == .skipped {
                    Image(systemName: "forward.fill")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(iTuTheme.inkDim)
                } else if occurrence == nil && isLoading {
                    ProgressView().controlSize(.mini)
                } else if occurrence == nil && didFailLoading {
                    Image(systemName: "exclamationmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(iTuTheme.coral)
                } else if occurrence == nil || occurrence?.status == .pending {
                    Circle()
                        .stroke(iTuTheme.inkFaint.opacity(0.7), lineWidth: 1.5)
                        .frame(width: 22, height: 22)
                }
            }
            .frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
        .frame(width: 30, height: 30)
        .contentShape(Rectangle())
        .scaleEffect(reduceMotion ? 1 : (isHovered ? 1.06 : 1))
        .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: isHovered)
        .onHover { isHovered = $0 }
        .pointingHandCursor()
        .disabled(occurrence == nil && onCheckInDate == nil)
        .accessibilityLabel("\(habitName), \(dayLabel) \(dayNumber)")
        .accessibilityValue(helpText)
        .accessibilityAddTraits(occurrence?.status == .completed ? .isSelected : [])
        .accessibilityHint(occurrence == nil ? (onCheckInDate == nil ? "Not scheduled" : "Click to mark done") : "Click to mark done or undo")
        .help(helpText)
    }

    private var helpText: String {
        if isLoading && occurrence == nil { return "Loading \(dayDate)" }
        if didFailLoading && occurrence == nil { return "Could not load \(dayDate)" }
        guard let occurrence else {
            return onCheckInDate == nil ? "Not scheduled on \(dayDate)" : "Click to mark done on \(dayDate)"
        }
        return "\(habitName), \(occurrence.status.rawValue.lowercased()), \(dayDate)"
    }
}

private struct HabitDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let habit: HabitModel
    let stats: HabitStatsModel?
    let onEdit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    iTuSectionLabel(title: "HABIT DETAILS", color: iTuTheme.teal)
                    Text(habit.name)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                }
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 30))
            }

            if let description = habit.description, !description.isEmpty {
                Text(description)
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            if let stats {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    HabitDetailMetric(title: "Current streak", value: "\(stats.currentStreak) d", icon: "flame.fill", color: iTuTheme.amber)
                    HabitDetailMetric(title: "Best streak", value: "\(stats.bestStreak) d", icon: "bolt.fill", color: iTuTheme.teal)
                    HabitDetailMetric(title: "Success rate", value: "\(Int(stats.successRate * 100))%", icon: "chart.line.uptrend.xyaxis", color: iTuTheme.mint)
                    HabitDetailMetric(title: "Focused", value: "\(Int(stats.focusedMinutes)) min", icon: "timer", color: iTuTheme.teal)
                }
            } else {
                ProgressView("Loading statistics…")
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 30)
            }

            HStack {
                Text("Completed \(stats?.completed ?? 0) · Failed \(stats?.failed ?? 0) · Skipped \(stats?.skipped ?? 0)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
                Spacer()
                Button("Edit Habit") {
                    onEdit()
                    dismiss()
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 30))
            }
        }
        .padding(24)
        .frame(width: 520)
        .frame(minHeight: 300)
    }
}

private struct HabitDetailMetric: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 10))
                    .foregroundStyle(iTuTheme.inkDim)
                Text(value)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            Spacer()
        }
        .padding(12)
        .iTuPanel(radius: 10)
    }
}

private struct HabitGroupsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let timeBlocks: [HabitTimeBlockModel]
    let onCreate: (String) -> Void

    @State private var name = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    iTuSectionLabel(title: "HABITS", color: iTuTheme.teal)
                    Text("Habit Groups")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                }
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 30))
            }

            Text("Groups organize habits. Habits without a group appear under Anytime.")
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)

            if timeBlocks.isEmpty {
                Text("No groups yet.")
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(timeBlocks) { block in
                        HStack(spacing: 10) {
                            Image(systemName: "list.bullet.rectangle")
                                .foregroundStyle(iTuTheme.teal)
                            Text(block.name)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(iTuTheme.ink)
                            Spacer()
                            Text("\(block.startLocal)–\(block.endLocal)")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }
                        .padding(10)
                        .iTuPanel(radius: 10)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("NEW GROUP NAME")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
                HStack(spacing: 8) {
                    TextField("Study", text: $name)
                        .textFieldStyle(.roundedBorder)
                    Button("Create") {
                        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !trimmed.isEmpty else { return }
                        onCreate(trimmed)
                        name = ""
                    }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 30))
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(12)
            .iTuPanel(radius: 12)
        }
        .padding(24)
        .frame(width: 420, height: 420)
    }
}

private struct HabitEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let habit: HabitModel?
    let timeBlocks: [HabitTimeBlockModel]
    let onSave: (HabitModel) -> Void

    @State private var name: String = ""
    @State private var description: String = ""
    @State private var frequency: HabitFrequency = .daily
    @State private var icon: String = "brain"
    @State private var targetValue: Double = 1
    @State private var targetType: String = "COUNT"
    @State private var unit: String = ""
    @State private var targetDaysPerWeek: Int = 7
    @State private var direction: HabitDirection = .build
    @State private var scheduleType: String = "WEEKDAYS"
    @State private var weekdays: [Int] = [0, 1, 2, 3, 4, 5, 6]
    @State private var intervalDays: Int = 2
    @State private var timesPerPeriod: Int = 3
    @State private var period: String = "WEEK"
    @State private var startDate: Date = Date()
    @State private var timeBlockID: String = ""
    @State private var tagIDs: [String] = []

    var body: some View {
        VStack(spacing: 20) {
            HStack {
                Text(habit == nil ? "New Habit" : "Edit Habit")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(iTuGhostButtonStyle())
            }

            ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("HABIT NAME")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                    TextField("e.g., Morning Meditation", text: $name)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("DESCRIPTION (OPTIONAL)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                    TextField("e.g., 10 minutes of mindfulness", text: $description)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("SCHEDULE")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                    Picker("Schedule", selection: $scheduleType) {
                        Text("Selected days").tag("WEEKDAYS")
                        Text("Times per period").tag("TIMES_PER_PERIOD")
                        Text("Every few days").tag("INTERVAL")
                    }
                    .pickerStyle(.segmented)
                }

                if scheduleType == "WEEKDAYS" {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("GOAL DAYS")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkFaint)
                        HStack(spacing: 5) {
                            ForEach(Array(["S", "M", "T", "W", "T", "F", "S"].enumerated()), id: \.offset) { index, label in
                                Button {
                                    if weekdays.contains(index) {
                                        weekdays.removeAll { $0 == index }
                                    } else {
                                        weekdays.append(index)
                                        weekdays.sort()
                                    }
                                } label: {
                                    Text(label)
                                        .font(.system(size: 11, weight: .bold))
                                        .frame(maxWidth: .infinity, minHeight: 28)
                                        .foregroundStyle(weekdays.contains(index) ? Color.white : iTuTheme.inkDim)
                                        .background(weekdays.contains(index) ? iTuTheme.teal : iTuTheme.surfaceMuted)
                                        .clipShape(Circle())
                                }
                                .buttonStyle(.plain)
                                .pointingHandCursor()
                                .accessibilityLabel(Calendar.current.weekdaySymbols[index])
                                .accessibilityAddTraits(weekdays.contains(index) ? .isSelected : [])
                            }
                        }
                    }
                } else if scheduleType == "INTERVAL" {
                    Stepper("Repeat every \(intervalDays) days", value: $intervalDays, in: 1...365)
                } else {
                    HStack {
                        Stepper("\(timesPerPeriod) times", value: $timesPerPeriod, in: 1...100)
                        Picker("Period", selection: $period) {
                            Text("Week").tag("WEEK")
                            Text("Month").tag("MONTH")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 150)
                    }
                }

                DatePicker("Start date", selection: $startDate, displayedComponents: .date)

                Picker("Time block", selection: $timeBlockID) {
                    Text("Anytime").tag("")
                    ForEach(timeBlocks) { block in
                        Text(block.name).tag(block.id)
                    }
                }
                .pickerStyle(.menu)

                if !model.tags.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TAGS")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkFaint)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 6)], spacing: 6) {
                            ForEach(model.tags) { tag in
                                Button {
                                    if tagIDs.contains(tag.id) {
                                        tagIDs.removeAll { $0 == tag.id }
                                    } else {
                                        tagIDs.append(tag.id)
                                    }
                                } label: {
                                    Text("#\(tag.name)")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundStyle(tagIDs.contains(tag.id) ? iTuTheme.teal : iTuTheme.inkDim)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 5)
                                        .frame(maxWidth: .infinity)
                                        .background(tagIDs.contains(tag.id) ? iTuTheme.mintTint : iTuTheme.surfaceMuted)
                                        .clipShape(Capsule())
                                        .overlay {
                                            Capsule().stroke(tagIDs.contains(tag.id) ? iTuTheme.teal.opacity(0.5) : iTuTheme.border, lineWidth: 1)
                                        }
                                }
                                .buttonStyle(.plain)
                                .pointingHandCursor()
                            }
                        }
                    }
                }

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("GOAL TYPE")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkFaint)
                        Picker("Goal type", selection: $targetType) {
                            Text("Check off").tag("BOOLEAN")
                            Text("Count").tag("COUNT")
                            Text("Duration").tag("DURATION")
                            Text("Quantity").tag("QUANTITY")
                        }
                        .pickerStyle(.menu)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("TARGET")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkFaint)
                        TextField("1", value: $targetValue, format: .number)
                            .textFieldStyle(.roundedBorder)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("UNIT")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkFaint)
                        TextField("times / minutes", text: $unit)
                            .textFieldStyle(.roundedBorder)
                    }
                }

                HStack {
                    Picker("Direction", selection: $direction) {
                        Text("Build habit").tag(HabitDirection.build)
                        Text("Limit habit").tag(HabitDirection.limit)
                    }
                    .pickerStyle(.segmented)
                }
            }
            }

            Spacer()

            Button("Save Habit") {
                let normalizedFrequency: HabitFrequency = if scheduleType == "TIMES_PER_PERIOD" {
                    .weekly
                } else if scheduleType == "WEEKDAYS" && weekdays.count == 7 {
                    .daily
                } else {
                    .custom
                }
                let saved = HabitModel(
                    id: habit?.id ?? UUID().uuidString,
                    name: name,
                    description: description.isEmpty ? nil : description,
                    icon: icon,
                    color: "mint",
                    frequency: normalizedFrequency,
                    targetValue: max(0.0001, targetValue),
                    targetType: targetType,
                    unit: unit.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : unit,
                    targetDaysPerWeek: scheduleType == "TIMES_PER_PERIOD" ? min(timesPerPeriod, 7) : max(1, weekdays.count),
                    direction: direction,
                    scheduleType: scheduleType,
                    weekdays: scheduleType == "WEEKDAYS" ? weekdays : [],
                    intervalDays: scheduleType == "INTERVAL" ? intervalDays : nil,
                    timesPerPeriod: scheduleType == "TIMES_PER_PERIOD" ? timesPerPeriod : nil,
                    period: scheduleType == "TIMES_PER_PERIOD" ? period : nil,
                    startDate: startDate.apiStartOfDay,
                    endDate: habit?.endDate,
                    timeBlockId: timeBlockID.isEmpty ? nil : timeBlockID,
                    tagIds: tagIDs,
                    archivedAt: habit?.archivedAt,
                    currentStreak: habit?.currentStreak ?? 0,
                    bestStreak: habit?.bestStreak ?? 0,
                    isCompletedToday: habit?.isCompletedToday ?? false,
                    totalCompletions: habit?.totalCompletions ?? 0,
                    createdAt: habit?.createdAt ?? ISO8601DateFormatter().string(from: Date()),
                    version: (habit?.version ?? 0) + 1
                )
                onSave(saved)
                dismiss()
            }
            .buttonStyle(iTuPrimaryButtonStyle())
            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(24)
        .frame(width: 460, height: 680)
        .onAppear {
            if let habit {
                name = habit.name
                description = habit.description ?? ""
                frequency = habit.frequency
                icon = habit.icon
                targetValue = habit.targetValue
                targetType = habit.targetType
                unit = habit.unit ?? ""
                targetDaysPerWeek = habit.targetDaysPerWeek
                direction = habit.direction
                scheduleType = habit.scheduleType
                weekdays = habit.weekdays
                intervalDays = habit.intervalDays ?? 2
                timesPerPeriod = habit.timesPerPeriod ?? 3
                period = habit.period ?? "WEEK"
                startDate = Date.fromAPI(habit.startDate) ?? Date()
                timeBlockID = habit.timeBlockId ?? ""
                tagIDs = habit.tagIds
            }
        }
    }
}

private extension Date {
    var apiStartOfDay: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: self) + "T00:00:00.000Z"
    }

    static func fromAPI(_ value: String) -> Date? {
        if let date = ISO8601DateFormatter().date(from: value) { return date }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: String(value.prefix(10)))
    }
}
