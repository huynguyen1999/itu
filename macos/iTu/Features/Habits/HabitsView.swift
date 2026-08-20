import SwiftUI

func habitQuickIncrement(_ habit: HabitModel) -> Double {
    switch habit.targetType.uppercased() {
    case "BOOLEAN": return max(1, habit.targetValue)
    case "COUNT": return 1
    case "DURATION": return 5
    default: return max(0.1, habit.targetValue / 4)
    }
}

struct HabitsView: View {
    @Environment(AppModel.self) private var model

    @State private var collapsedGroups: Set<String> = []
    @State private var weekOffset = 0
    @State private var quickLogRequest: HabitQuickLogRequest?
    @State private var showingDateJump = false
    @State private var dateJumpTarget = Date()
    @State private var showingSettings = false

    private var activeHabits: [HabitModel] {
        model.habits.filter { $0.archivedAt == nil }
    }

    private var weekDays: [HabitDay] {
        let calendar = iTuCalendarSupport.calendar(firstWeekday: model.habitPreferences.weekStartDay.uppercased() == "SUNDAY" ? 1 : 2)
        let anchor = calendar.date(byAdding: .day, value: weekOffset * 7, to: Date()) ?? Date()
        let start = weekStart(for: anchor, calendar: calendar)
        let dayFormatter = DateFormatter()
        dayFormatter.dateFormat = "EEE"
        dayFormatter.locale = Locale.current
        dayFormatter.timeZone = calendar.timeZone
        return (0..<7).compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: offset, to: start) else { return nil }
            return HabitDay(
                date: iTuCalendarSupport.dayString(date),
                label: dayFormatter.string(from: date),
                number: calendar.component(.day, from: date),
                isToday: iTuCalendarSupport.dayString(date) == iTuCalendarSupport.dayString()
            )
        }
    }

    private var visibleWeekRangeKey: String {
        guard let first = weekDays.first, let last = weekDays.last else { return "empty" }
        return "\(first.date):\(last.date)"
    }

    private var habitOccurrenceIndex: [String: HabitOccurrenceModel] {
        Dictionary(uniqueKeysWithValues: model.habitOccurrences.map {
            (AppModel.habitOccurrenceKey(habitId: $0.habitId, day: $0.localDayString), $0)
        })
    }

    private var habitCalendarIndex: [String: HabitDayStateModel] {
        model.habitCalendarByHabitAndDay
    }

    private var habitGroups: [(String, [HabitModel])] {
        let grouped = Dictionary(grouping: activeHabits) { habit in
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Week calendar header panel
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
                            guard let first = weekDays.first, let last = weekDays.last else { return }
                            Task { await model.refreshHabitOccurrences(from: first.date, to: last.date, force: true) }
                        }
                        .buttonStyle(iTuGhostButtonStyle())
                    }
                    .padding(12)
                    .iTuPanel(radius: 10)
                }

                // Categorized Habit Sections
                if habitGroups.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "face.smiling")
                            .font(.system(size: 36))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("No active habits")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Create your first habit to build consistency and track daily streaks.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                        Button {
                            model.presentedOverlay = .habitCreate
                        } label: {
                            Label("Create habit", systemImage: "plus")
                        }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                        .padding(.top, 4)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 48)
                    .iTuPanel(radius: 14)
                } else {
                    VStack(alignment: .leading, spacing: 20) {
                        ForEach(habitGroups, id: \.0) { group in
                            VStack(alignment: .leading, spacing: 10) {
                                Button {
                                    if collapsedGroups.contains(group.0) {
                                        collapsedGroups.remove(group.0)
                                    } else {
                                        collapsedGroups.insert(group.0)
                                    }
                                } label: {
                                    HStack(spacing: 6) {
                                        Image(systemName: collapsedGroups.contains(group.0) ? "chevron.right" : "chevron.down")
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundStyle(iTuTheme.inkDim)
                                        Text(group.0)
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundStyle(iTuTheme.ink)
                                        Text("\(group.1.count)")
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundStyle(iTuTheme.inkDim)
                                        Spacer()
                                    }
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .pointingHandCursor()

                                if !collapsedGroups.contains(group.0) {
                                    VStack(spacing: 8) {
                                        ForEach(group.1) { habit in
                                            HabitCardRow(
                                                habit: habit,
                                                weekDays: weekDays,
                                                occurrencesByDate: Dictionary(uniqueKeysWithValues: weekDays.compactMap { day in
                                                    guard let occurrence = habitOccurrenceIndex[AppModel.habitOccurrenceKey(habitId: habit.id, day: day.date)] else { return nil }
                                                    return (day.date, occurrence)
                                                }),
                                                projectedStatesByDate: Dictionary(uniqueKeysWithValues: weekDays.compactMap { day in
                                                    guard let state = habitCalendarIndex[AppModel.habitOccurrenceKey(habitId: habit.id, day: day.date)] else { return nil }
                                                    return (day.date, state)
                                                } + habitCalendarIndex.values.compactMap { state in
                                                    guard state.habitId == habit.id,
                                                          let periodStart = state.periodStart,
                                                          let periodEnd = state.periodEnd,
                                                          let firstDate = weekDays.first?.date,
                                                          let lastDate = weekDays.last?.date,
                                                          periodEnd >= firstDate,
                                                          periodStart <= lastDate,
                                                          !weekDays.contains(where: { $0.date == state.localDate }) else { return nil }
                                                    return (state.localDate, state)
                                                }),
                                                todayOccurrence: habitOccurrenceIndex[AppModel.habitOccurrenceKey(habitId: habit.id, day: iTuCalendarSupport.dayString())],
                                                todayState: model.habitDayState(habitId: habit.id, day: iTuCalendarSupport.dayString()),
                                                growthRule: model.growthEarningRules[habit.id],
                                                archivedSkillIDs: model.archivedSkillIDs,
                                                onCheckIn: { occurrence in
                                                    Task { await model.checkInHabitOccurrence(occurrence, value: habitQuickIncrement(habit)) }
                                                },
                                                onAction: { occurrence, action in
                                                    Task { await model.habitOccurrenceAction(occurrence, action: action) }
                                                },
                                                isLoadingOccurrences: model.habitOccurrencesLoading,
                                                occurrencesFailed: model.habitOccurrencesErrorMessage != nil,
                                                onCheckInDate: { date in
                                                    Task { await model.checkInHabitDate(habitId: habit.id, date: date, value: habitQuickIncrement(habit)) }
                                                },
                                                onActionDate: { date, action in
                                                    Task { await model.habitOccurrenceAction(habitId: habit.id, date: date, action: action) }
                                                },
                                                onEdit: { model.presentedOverlay = .habitEdit(habit) },
                                                onOpenDetails: { model.presentedOverlay = .habitDetail(habit) },
                                                onArchive: { Task { await model.archiveHabit(habit) } }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .iTuPinnedHeader { headerBar }
        .background(
            LinearGradient(
                colors: [iTuTheme.canvas, iTuTheme.mintTint.opacity(0.15)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .task(id: visibleWeekRangeKey) {
            guard let first = weekDays.first, let last = weekDays.last else { return }
            await model.refreshHabitOccurrences(from: first.date, to: last.date)
        }
        .onAppear { consumePendingQuickLog() }
        .onChange(of: model.pendingHabitQuickLog?.id) { _, _ in consumePendingQuickLog() }
    }

    private var headerBar: some View {
        iTuPageHeader(
            kicker: "ROUTINES & TRACKING",
            title: "Habits",
            actions: {
                HStack(spacing: 8) {
                    Button {
                        weekOffset -= 1
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Previous")
                        }
                        .font(.system(size: 12, weight: .medium))
                    }
                    .buttonStyle(iTuGhostButtonStyle(height: 30))
                    .pointingHandCursor()

                    HStack(spacing: 6) {
                        Image(systemName: "calendar")
                            .font(.system(size: 12))
                        Text("\(weekDays.first?.date ?? "") – \(weekDays.last?.date ?? "")")
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                    }
                    .foregroundStyle(iTuTheme.inkDim)
                    .padding(.horizontal, 4)

                    Button {
                        showingDateJump = true
                    } label: {
                        Image(systemName: "calendar")
                            .font(.system(size: 13, weight: .medium))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(iTuHeaderGhostButtonStyle(height: 28))
                    .pointingHandCursor()
                    .help("Jump to date")
                    .popover(isPresented: $showingDateJump) {
                        VStack(alignment: .leading, spacing: 12) {
                            DatePicker("Jump to date", selection: $dateJumpTarget, displayedComponents: .date)
                            Button("Show week") { jumpToDate() }
                                .buttonStyle(iTuPrimaryButtonStyle(height: 30))
                                .frame(maxWidth: .infinity, alignment: .trailing)
                        }
                        .padding(14)
                    }

                    Button("Today") {
                        weekOffset = 0
                    }
                    .buttonStyle(iTuGhostButtonStyle(height: 30))
                    .font(.system(size: 12, weight: .medium))
                    .pointingHandCursor()

                    Button {
                        weekOffset += 1
                    } label: {
                        HStack(spacing: 4) {
                            Text("Next")
                            Image(systemName: "chevron.right")
                        }
                        .font(.system(size: 12, weight: .medium))
                    }
                    .buttonStyle(iTuGhostButtonStyle(height: 30))
                    .pointingHandCursor()

                    Button {
                        let allCollapsed = !habitGroups.isEmpty && habitGroups.allSatisfy { collapsedGroups.contains($0.0) }
                        collapsedGroups = allCollapsed ? [] : Set(habitGroups.map(\.0))
                    } label: {
                        Image(systemName: "square.grid.2x2")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(iTuHeaderGhostButtonStyle(height: 28))
                    .pointingHandCursor()
                    .help("Collapse or expand habit groups")

                    Button {
                        model.presentedOverlay = .habitCreate
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(iTuHeaderGhostButtonStyle(height: 28))
                    .pointingHandCursor()
                    .help("Create habit")

                    Button {
                        model.presentedOverlay = .habitGroups
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(iTuHeaderGhostButtonStyle(height: 28))
                    .pointingHandCursor()
                    .help("Manage habit groups")

                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(iTuHeaderGhostButtonStyle(height: 28))
                    .pointingHandCursor()
                    .help("Habit settings")
                    .popover(isPresented: $showingSettings) {
                        HabitsSettingsPopover()
                            .environment(model)
                    }
                }
            }
        )
    }

    private func weekStart(for date: Date, calendar: Calendar) -> Date {
        let day = calendar.startOfDay(for: date)
        let weekday = calendar.component(.weekday, from: day)
        return calendar.date(byAdding: .day, value: -(weekday - calendar.firstWeekday + 7) % 7, to: day) ?? day
    }

    private func jumpToDate() {
        let calendar = iTuCalendarSupport.calendar(firstWeekday: model.habitPreferences.weekStartDay.uppercased() == "SUNDAY" ? 1 : 2)
        let currentStart = weekStart(for: Date(), calendar: calendar)
        let targetStart = weekStart(for: dateJumpTarget, calendar: calendar)
        let days = calendar.dateComponents([.day], from: currentStart, to: targetStart).day ?? 0
        weekOffset = days / 7
        showingDateJump = false
    }

    private var weekCalendarHeader: some View {
        HStack(spacing: 16) {
            Color.clear
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 12) {
                ForEach(weekDays) { day in
                    VStack(spacing: 4) {
                        Text(day.label)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(day.isToday ? Color(hex: 0x3B82F6) : iTuTheme.inkDim)
                        Text("\(day.number)")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(day.isToday ? Color(hex: 0x3B82F6) : iTuTheme.ink)
                        Circle()
                            .stroke(day.isToday ? Color(hex: 0x3B82F6) : iTuTheme.border.opacity(0.8), lineWidth: 1.5)
                            .background(Circle().fill(day.isToday ? Color(hex: 0x3B82F6).opacity(0.12) : Color.clear))
                            .frame(width: 14, height: 14)
                    }
                    .frame(width: 32)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .iTuPanel(radius: 12)
    }

    private func consumePendingQuickLog() {
        guard let request = model.pendingHabitQuickLog else { return }
        model.pendingHabitQuickLog = nil
        quickLogRequest = request
    }
}

private struct HabitDay: Identifiable {
    let date: String
    let label: String
    let number: Int
    let isToday: Bool

    var id: String { date }
}

private struct HabitCardRow: View {
    let habit: HabitModel
    let weekDays: [HabitDay]
    let occurrencesByDate: [String: HabitOccurrenceModel]
    let projectedStatesByDate: [String: HabitDayStateModel]
    let todayOccurrence: HabitOccurrenceModel?
    let todayState: HabitDayStateModel?
    let growthRule: GrowthEarningRuleDTO?
    let archivedSkillIDs: Set<String>
    let onCheckIn: (HabitOccurrenceModel) -> Void
    let onAction: (HabitOccurrenceModel, String) -> Void
    let isLoadingOccurrences: Bool
    let occurrencesFailed: Bool
    let onCheckInDate: (String) -> Void
    let onActionDate: (String, String) -> Void
    let onEdit: () -> Void
    let onOpenDetails: () -> Void
    let onArchive: () -> Void

    @State private var isHovered = false
    @State private var showingPeriodQuickLog = false

    var body: some View {
        HStack(spacing: 16) {
            habitInfoButton
                .frame(maxWidth: .infinity, alignment: .leading)
            dayCirclesRow
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .iTuHoverCard()
        .iTuPanel(radius: 12)
        .contextMenu {
            rowContextMenu
        }
    }

    private var habitInfoButton: some View {
        Button(action: onOpenDetails) {
            HStack(spacing: 12) {
                HabitIconBadgeView(icon: habit.icon, color: habit.color)

                VStack(alignment: .leading, spacing: 4) {
                    Text(habit.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                        .lineLimit(1)

                    HStack(spacing: 8) {
                        streakBadges
                        if habit.targetType.uppercased() != "BOOLEAN" && habit.scheduleType.uppercased() != "TIMES_PER_PERIOD" {
                            let displayVal = habit.stats?.averageValue != nil && (habit.stats?.averageValue ?? 0) > 0
                                ? String(format: "%.1f", habit.stats!.averageValue)
                                : String(format: habit.targetValue.rounded() == habit.targetValue ? "%.0f" : "%.1f", habit.targetValue)
                            Text("\(displayVal) \(habit.unit ?? "")")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        HabitGrowthChipsView(rule: growthRule, archivedSkillIDs: archivedSkillIDs)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }

    @ViewBuilder
    private var streakBadges: some View {
        let streakUnit = habit.scheduleType.uppercased() == "TIMES_PER_PERIOD"
            ? (habit.period?.lowercased() ?? "Period")
            : "Day"
        HStack(spacing: 8) {
            HStack(spacing: 3) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 10, weight: .bold))
                Text(habit.bestStreak > 0 ? "\(habit.bestStreak) \(streakUnit)s" : "0 \(streakUnit)")
            }
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .foregroundStyle(Color(hex: 0x3B82F6))

            HStack(spacing: 3) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 10, weight: .bold))
                Text(habit.currentStreak > 0 ? "\(habit.currentStreak) \(streakUnit)\(habit.currentStreak == 1 ? "" : "s")" : "0 \(streakUnit)")
            }
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .foregroundStyle(Color(hex: 0xF59E0B))
        }
    }

    @ViewBuilder
    private var dayCirclesRow: some View {
        if habit.scheduleType.uppercased() == "TIMES_PER_PERIOD" {
            let state = weekDays.last.flatMap { projectedStatesByDate[$0.date] } ?? projectedStatesByDate.values.first(where: {
                $0.periodStart != nil && $0.periodEnd != nil
            })
            let target = max(1, Int(state?.targetValue ?? Double(habit.timesPerPeriod ?? 1)))
            let completed = min(target, max(0, Int(state?.value ?? 0)))
            Button { showingPeriodQuickLog = true } label: {
                HStack(spacing: 8) {
                    HStack(spacing: 4) {
                        ForEach(0..<min(target, 7), id: \.self) { index in
                            Circle()
                                .fill(index < completed ? Color(hex: 0x10B981) : Color.clear)
                                .frame(width: 12, height: 12)
                                .overlay { Circle().stroke(index < completed ? Color(hex: 0x10B981) : iTuTheme.border, lineWidth: 1.5) }
                        }
                    }
                    Text("\(completed) / \(target) this \((habit.period ?? "WEEK").lowercased())")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showingPeriodQuickLog) {
                if let date = weekDays.first(where: { day in
                    guard let start = state?.periodStart, let end = state?.periodEnd else { return true }
                    return start <= day.date && day.date <= end
                })?.date ?? weekDays.last?.date {
                    HabitQuickLogView(
                        habit: habit,
                        localDate: date,
                        state: state
                    )
                }
            }
        } else {
            HStack(spacing: 12) {
                ForEach(weekDays, id: \.date) { day in
                    let occurrence = occurrencesByDate[day.date]
                    HabitQuickActionView(
                        habit: habit,
                        habitName: habit.name,
                        dayLabel: day.label,
                        dayNumber: day.number,
                        dayDate: day.date,
                        occurrence: occurrence,
                        projectedState: projectedStatesByDate[day.date],
                        isLoading: isLoadingOccurrences,
                        didFailLoading: occurrencesFailed,
                        onCheckIn: onCheckIn,
                        onAction: onAction,
                        onCheckInDate: { onCheckInDate(day.date) },
                        onActionDate: { action in onActionDate(day.date, action) }
                    )
                    .frame(width: 32)
                }
            }
        }
    }

    @ViewBuilder
    private var rowContextMenu: some View {
        let todayStatus = todayOccurrence?.status == .completed || todayState?.status == .completed
        Button(todayStatus ? "Unmark Check-in" : "Mark Done Today") {
            if let todayOccurrence {
                if todayOccurrence.status == .completed {
                    onAction(todayOccurrence, "undo")
                } else {
                    onCheckIn(todayOccurrence)
                }
            } else {
                onCheckInDate(iTuCalendarSupport.dayString())
            }
        }
        if let todayOccurrence, todayOccurrence.status == .pending {
            Button("Skip Today") { onAction(todayOccurrence, "skip") }
            Button("Record Today as Missed") { onAction(todayOccurrence, "fail") }
        } else if let todayOccurrence, todayOccurrence.status != .pending {
            Button("Undo Today's Status") { onAction(todayOccurrence, "undo") }
        } else if todayState?.status == .completed || todayState?.status == .skipped || todayState?.status == .failed {
            Button("Undo Today's Status") { onActionDate(iTuCalendarSupport.dayString(), "UNDO") }
        }
        Button("View Details", action: onOpenDetails)
        Button("Edit Habit", action: onEdit)
        Button(habit.archivedAt == nil ? "Archive Habit" : "Restore Habit", action: onArchive)
    }
}

struct HabitIconBadgeView: View {
    let icon: String
    let color: String

    private var iconColor: Color {
        switch color.uppercased() {
        case "EMERALD", "MINT": return Color(hex: 0x10B981)
        case "TEAL": return Color(hex: 0x14B8A6)
        case "BLUE": return Color(hex: 0x3B82F6)
        case "INDIGO": return Color(hex: 0x6366F1)
        case "VIOLET": return Color(hex: 0x8B5CF6)
        case "ROSE", "CORAL": return Color(hex: 0xF43F5E)
        case "AMBER": return Color(hex: 0xF59E0B)
        case "SLATE": return Color(hex: 0x64748B)
        default: return Color(hex: 0x10B981)
        }
    }

    private var backgroundColor: Color {
        switch color.uppercased() {
        case "EMERALD", "MINT": return Color(hex: 0x064E3B).opacity(0.4)
        case "TEAL": return Color(hex: 0x134E4A).opacity(0.4)
        case "BLUE": return Color(hex: 0x1E3A8A).opacity(0.4)
        case "INDIGO": return Color(hex: 0x312E81).opacity(0.4)
        case "VIOLET": return Color(hex: 0x4C1D95).opacity(0.4)
        case "ROSE", "CORAL": return Color(hex: 0x881337).opacity(0.4)
        case "AMBER": return Color(hex: 0x78350F).opacity(0.4)
        case "SLATE": return Color(hex: 0x334155).opacity(0.4)
        default: return Color(hex: 0x064E3B).opacity(0.4)
        }
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(backgroundColor)
            Circle()
                .stroke(iconColor.opacity(0.3), lineWidth: 1)

            if isEmoji(icon) {
                Text(icon)
                    .font(.system(size: 16))
            } else if !icon.isEmpty {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(iconColor)
            } else {
                Text("✅")
                    .font(.system(size: 16))
            }
        }
        .frame(width: 36, height: 36)
    }

    private func isEmoji(_ text: String) -> Bool {
        guard let first = text.first else { return false }
        return first.unicodeScalars.contains { scalar in
            scalar.properties.isEmoji && (scalar.value > 0x238C || scalar.properties.isEmojiPresentation)
        }
    }
}

struct HabitGrowthChipsView: View {
    let rule: GrowthEarningRuleDTO?
    var archivedSkillIDs: Set<String> = []

    private var accountXp: Int { rule?.accountXp ?? 0 }
    private var coinReward: Int { rule?.coinReward ?? 0 }
    private var itemAwards: [GrowthEarningRuleItemDTO] { rule?.itemAwards.filter { $0.quantity > 0 } ?? [] }

    private var xpGroups: [(amount: Int, awards: [GrowthEarningRuleSkillAwardDTO])] {
        guard let rule else { return [] }
        let selected = GrowthRewardMath.selectedAwards(rule.skillAwards, archivedSkillIDs: archivedSkillIDs)
        let allocations = GrowthRewardMath.split(
            accountXp: rule.accountXp,
            awards: selected,
            archivedSkillIDs: archivedSkillIDs
        )
        return Dictionary(grouping: zip(selected, allocations).filter { $0.1 > 0 }, by: { $0.1 })
            .map { (amount: $0.key, awards: $0.value.map { $0.0 }) }
            .sorted { $0.amount > $1.amount }
    }

    private var totalChipCount: Int {
        (accountXp > 0 ? 1 : 0) + xpGroups.count + (coinReward > 0 ? 1 : 0) + itemAwards.count
    }

    var body: some View {
        if totalChipCount > 0 {
            HStack(spacing: 6) {
                if accountXp > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 9, weight: .bold))
                        Text("+\(accountXp) XP")
                    }
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color(hex: 0x34D399))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Color(hex: 0x064E3B).opacity(0.5))
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color(hex: 0x10B981).opacity(0.3), lineWidth: 1))
                }

                ForEach(Array(xpGroups.prefix(2).enumerated()), id: \.offset) { _, group in
                    HStack(spacing: 4) {
                        if let firstAward = group.awards.first {
                            skillIconView(award: firstAward)
                        }
                        Text("+\(group.amount)")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(skillTextColor(group.awards.first?.skill?.color))
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(skillBgColor(group.awards.first?.skill?.color))
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(skillBorderColor(group.awards.first?.skill?.color), lineWidth: 1))
                }

                if coinReward > 0 {
                    HStack(spacing: 3) {
                        Text("🪙")
                            .font(.system(size: 9))
                        Text("+\(coinReward)")
                    }
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color(hex: 0xFBBF24))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Color(hex: 0x78350F).opacity(0.4))
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color(hex: 0xF59E0B).opacity(0.3), lineWidth: 1))
                }

                ForEach(itemAwards.prefix(1), id: \.itemId) { award in
                    HStack(spacing: 3) {
                        GrowthIconView(icon: award.item?.icon ?? "gift", size: 10, color: iTuTheme.teal)
                        Text("x\(award.quantity)")
                    }
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(iTuTheme.surfaceMuted)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(iTuTheme.border, lineWidth: 1))
                }

                if totalChipCount > 3 {
                    Text("+\(totalChipCount - 3)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(iTuTheme.surfaceMuted)
                        .clipShape(Capsule())
                }
            }
        }
    }

    @ViewBuilder
    private func skillIconView(award: GrowthEarningRuleSkillAwardDTO) -> some View {
        let iconName = award.skill?.icon ?? "shield"
        GrowthIconView(icon: iconName, size: 11, color: skillTextColor(award.skill?.color))
    }

    private func skillTextColor(_ color: String?) -> Color {
        switch color?.uppercased() {
        case "ROSE", "CORAL": return Color(hex: 0xFB7185)
        case "TEAL", "MINT", "EMERALD": return Color(hex: 0x34D399)
        case "VIOLET", "PURPLE", "INDIGO": return Color(hex: 0xC084FC)
        case "BLUE": return Color(hex: 0x60A5FA)
        case "AMBER": return Color(hex: 0xFBBF24)
        default: return Color(hex: 0x34D399)
        }
    }

    private func skillBgColor(_ color: String?) -> Color {
        switch color?.uppercased() {
        case "ROSE", "CORAL": return Color(hex: 0x881337).opacity(0.4)
        case "TEAL", "MINT", "EMERALD": return Color(hex: 0x064E3B).opacity(0.4)
        case "VIOLET", "PURPLE", "INDIGO": return Color(hex: 0x4C1D95).opacity(0.4)
        case "BLUE": return Color(hex: 0x1E3A8A).opacity(0.4)
        case "AMBER": return Color(hex: 0x78350F).opacity(0.4)
        default: return Color(hex: 0x064E3B).opacity(0.4)
        }
    }

    private func skillBorderColor(_ color: String?) -> Color {
        switch color?.uppercased() {
        case "ROSE", "CORAL": return Color(hex: 0xF43F5E).opacity(0.3)
        case "TEAL", "MINT", "EMERALD": return Color(hex: 0x10B981).opacity(0.3)
        case "VIOLET", "PURPLE", "INDIGO": return Color(hex: 0x8B5CF6).opacity(0.3)
        case "BLUE": return Color(hex: 0x3B82F6).opacity(0.3)
        case "AMBER": return Color(hex: 0xF59E0B).opacity(0.3)
        default: return Color(hex: 0x10B981).opacity(0.3)
        }
    }
}

struct HabitQuickActionView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var habit: HabitModel? = nil
    let habitName: String
    let dayLabel: String
    let dayNumber: Int
    let dayDate: String
    let occurrence: HabitOccurrenceModel?
    let projectedState: HabitDayStateModel?
    let isLoading: Bool
    let didFailLoading: Bool
    let onCheckIn: (HabitOccurrenceModel) -> Void
    let onAction: (HabitOccurrenceModel, String) -> Void
    var onCheckInDate: (() -> Void)? = nil
    var onActionDate: ((String) -> Void)? = nil

    @State private var isHovered = false
    @State private var showingQuickLog = false

    var body: some View {
        Button {
            let isCompleted = occurrence?.status == .completed
                || projectedState?.status == .completed
            let isTerminal = occurrence?.status == .skipped || occurrence?.status == .failed
                || projectedState?.status == .skipped || projectedState?.status == .failed
            if isCompleted || isTerminal {
                if let occurrence {
                    onAction(occurrence, "undo")
                } else {
                    onActionDate?("UNDO")
                }
            } else if let habit, habit.targetType.uppercased() != "BOOLEAN" {
                showingQuickLog = true
            } else if let occurrence {
                onCheckIn(occurrence)
            } else if let projectedState, projectedState.status == .rest || projectedState.status == .notScheduled {
                return
            } else if let onCheckInDate {
                onCheckInDate()
            }
        } label: {
            ZStack {
                let isCompleted = occurrence?.status == .completed || projectedState?.status == .completed
                let isFailed = occurrence?.status == .failed || projectedState?.status == .failed || projectedState?.status == .missed
                let isSkipped = occurrence?.status == .skipped || projectedState?.status == .skipped
                let isPartial = projectedState?.status == .partial
                let isDisabled = occurrence == nil && (projectedState?.status == .rest || projectedState?.status == .notScheduled)

                if isCompleted {
                    Circle()
                        .fill(Color(hex: 0x10B981))
                        .frame(width: 24, height: 24)
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .black))
                        .foregroundStyle(.white)
                } else if isFailed {
                    Circle()
                        .fill(Color(hex: 0xEF4444).opacity(0.18))
                        .frame(width: 24, height: 24)
                    Circle()
                        .stroke(Color(hex: 0xEF4444).opacity(0.4), lineWidth: 1)
                        .frame(width: 24, height: 24)
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Color(hex: 0xF87171))
                } else if isPartial {
                    Circle()
                        .fill(Color(hex: 0xF59E0B).opacity(0.2))
                        .frame(width: 24, height: 24)
                    Circle()
                        .stroke(Color(hex: 0xF59E0B).opacity(0.5), lineWidth: 1)
                        .frame(width: 24, height: 24)
                    Circle()
                        .fill(Color(hex: 0xF59E0B))
                        .frame(width: 6, height: 6)
                } else if isSkipped {
                    Circle()
                        .fill(iTuTheme.surfaceMuted)
                        .frame(width: 24, height: 24)
                    Circle()
                        .stroke(iTuTheme.border, lineWidth: 1)
                        .frame(width: 24, height: 24)
                    Image(systemName: "forward.fill")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(iTuTheme.inkDim)
                } else if isLoading && occurrence == nil && projectedState == nil {
                    ProgressView().controlSize(.mini)
                } else if didFailLoading && occurrence == nil && projectedState == nil {
                    Image(systemName: "exclamationmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(iTuTheme.coral)
                } else if isDisabled {
                    Circle()
                        .stroke(iTuTheme.border.opacity(0.2), lineWidth: 1)
                        .frame(width: 24, height: 24)
                } else {
                    Circle()
                        .fill(isHovered ? iTuTheme.mintTint : Color.clear)
                        .frame(width: 24, height: 24)
                    Circle()
                        .stroke(isHovered ? iTuTheme.teal : iTuTheme.borderSoft.opacity(0.8), lineWidth: 1.5)
                        .frame(width: 24, height: 24)
                }
            }
            .frame(width: 32, height: 32)
        }
        .buttonStyle(.plain)
        .frame(width: 32, height: 32)
        .contentShape(Rectangle())
        .scaleEffect(reduceMotion ? 1 : (isHovered ? 1.08 : 1))
        .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: isHovered)
        .onHover { isHovered = $0 }
        .pointingHandCursor()
        .popover(isPresented: $showingQuickLog) {
            if let habit {
                HabitQuickLogView(
                    habit: habit,
                    localDate: dayDate,
                    state: projectedState
                )
                .environment(model)
            }
        }
        .disabled(occurrence == nil && (projectedState?.status == .rest || projectedState?.status == .notScheduled || (projectedState == nil && onCheckInDate == nil)))
        .accessibilityLabel("\(habitName), \(dayLabel) \(dayNumber)")
        .accessibilityValue(accessibilityProgress)
        .accessibilityAddTraits(occurrence?.status == .completed ? .isSelected : [])
        .accessibilityHint(occurrence == nil && projectedState == nil ? (onCheckInDate == nil ? "Not scheduled" : "Click to mark done") : "Click to mark done or undo")
        .help(helpText)
    }

    private var helpText: String {
        if isLoading && occurrence == nil { return "Loading \(dayDate)" }
        if didFailLoading && occurrence == nil { return "Could not load \(dayDate)" }
        guard let occurrence else {
            if let projectedState { return "\(projectedState.status.rawValue.lowercased()), \(dayDate)" }
            return onCheckInDate == nil ? "Not scheduled on \(dayDate)" : "Click to mark done on \(dayDate)"
        }
        return "\(habitName), \(occurrence.status.rawValue.lowercased()), \(dayDate)"
    }

    private var accessibilityProgress: String {
        let value = projectedState?.value ?? occurrence?.value ?? 0
        let target = projectedState?.targetValue ?? habit?.targetValue ?? 1
        let unit = habit?.unit ?? (habit?.targetType.uppercased() == "DURATION" ? "minutes" : habit?.targetType.lowercased() ?? "progress")
        let date = Date.fromAPI(dayDate)?.formatted(date: .long, time: .omitted) ?? dayDate
        let status = projectedState?.status.rawValue.lowercased() ?? occurrence?.status.rawValue.lowercased() ?? "pending"
        return "\(formatted(value)) of \(formatted(target)) \(unit), \(date), \(status)"
    }

    private func formatted(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(value.rounded() == value ? 0 : 2)))
    }
}

struct HabitQuickLogView: View {
    @Environment(AppModel.self) private var model

    let habit: HabitModel
    let localDate: String
    let state: HabitDayStateModel?

    @State private var customAmount = ""
    @State private var logs: [HabitProgressLogModel] = []
    @State private var isLoading = false

    private var currentValue: Double { model.habitDayState(habitId: habit.id, day: localDate)?.value ?? state?.value ?? 0 }
    private var targetValue: Double { model.habitDayState(habitId: habit.id, day: localDate)?.targetValue ?? state?.targetValue ?? habit.targetValue }
    private var increments: [Double] {
        if habit.scheduleType.uppercased() == "TIMES_PER_PERIOD" { return [1] }
        switch habit.targetType.uppercased() {
        case "COUNT": return [1]
        case "DURATION": return [5, 10]
        default: return [max(0.1, targetValue / 4), max(0.1, targetValue / 2)]
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(habit.name)
                .font(.system(size: 16, weight: .bold))
            Text("\(formatted(currentValue)) / \(formatted(targetValue)) \(habit.unit ?? "")")
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)

            HStack(spacing: 8) {
                ForEach(increments, id: \.self) { amount in
                    Button("+\(formatted(amount))") { add(amount) }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 30))
                }
            }

            HStack(spacing: 8) {
                TextField("Custom amount", text: $customAmount)
                    .textFieldStyle(.roundedBorder)
                Button("Add") {
                    guard let amount = Double(customAmount), amount > 0 else { return }
                    add(amount)
                    customAmount = ""
                }
                .buttonStyle(iTuGhostButtonStyle(height: 30))
            }

            if !logs.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Recent")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                    ForEach(logs.prefix(5)) { log in
                        HStack {
                            Text("+\(formatted(log.value))")
                                .font(.system(size: 12, weight: .medium, design: .monospaced))
                            Spacer()
                            Text(time(for: log.recordedAt))
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkFaint)
                            Button("Undo") { remove(log) }
                                .buttonStyle(.plain)
                                .foregroundStyle(iTuTheme.coral)
                        }
                    }
                }
            }

            if isLoading { ProgressView().controlSize(.small) }
        }
        .padding(18)
        .frame(width: 300)
        .task { await load() }
    }

    private func add(_ amount: Double) {
        Task {
            isLoading = true
            await model.checkInHabitDate(habitId: habit.id, date: localDate, value: amount)
            await load()
            isLoading = false
        }
    }

    private func remove(_ log: HabitProgressLogModel) {
        Task {
            isLoading = true
            await model.deleteHabitProgress(log, habitId: habit.id, date: localDate)
            await load()
            isLoading = false
        }
    }

    private func load() async {
        do {
            logs = try await model.apiClient.fetchHabitProgress(habitId: habit.id, from: localDate, to: localDate)
        } catch {
            logs = []
        }
    }

    private func formatted(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(value.rounded() == value ? 0 : 2)))
    }

    private func time(for value: String) -> String {
        Date.fromAPI(value)?.formatted(date: .omitted, time: .shortened) ?? value
    }
}

struct HabitDetailSheet: View {
    @Environment(AppModel.self) private var model

    let habit: HabitModel
    let stats: HabitStatsModel?
    let onClose: () -> Void
    let onEdit: () -> Void

    @State private var reflectionText = ""
    @State private var showingReflectionComposer = false
    @State private var savingReflection = false

    private var reflections: [JournalNoteModel] {
        model.journalNotes
            .filter {
                $0.kind == "NOTE" && $0.contextType == "HABIT_OCCURRENCE" &&
                $0.contextData?.objectValue?["habitId"]?.stringValue == habit.id
            }
            .sorted { $0.entryDate > $1.entryDate }
    }

    private func weekdayName(_ value: Int?) -> String {
        guard let value, (0..<7).contains(value) else { return "—" }
        return Calendar(identifier: .gregorian).weekdaySymbols[value]
    }

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
                Button("Done") { onClose() }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 30))
            }

            if let description = habit.description, !description.isEmpty {
                Text(description)
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            if let stats {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    HabitDetailMetric(title: "Current streak", value: "\(stats.currentStreak) \(stats.streakUnit == "PERIOD" ? "periods" : "days")", icon: "flame.fill", color: iTuTheme.amber)
                    HabitDetailMetric(title: "Best streak", value: "\(stats.bestStreak) \(stats.streakUnit == "PERIOD" ? "periods" : "days")", icon: "bolt.fill", color: iTuTheme.teal)
                    HabitDetailMetric(title: "Last 30 days", value: "\(Int(stats.last30Rate * 100))%", icon: "chart.line.uptrend.xyaxis", color: iTuTheme.mint)
                    HabitDetailMetric(title: "Focused", value: "\(Int(stats.focusedMinutes)) min", icon: "timer", color: iTuTheme.teal)
                    HabitDetailMetric(title: "Previous 30", value: "\(Int(stats.previous30Rate * 100))%", icon: "arrow.left", color: iTuTheme.syncBlue)
                    HabitDetailMetric(title: "Last 90 days", value: "\(Int(stats.last90Rate * 100))%", icon: "calendar", color: iTuTheme.teal)
                    HabitDetailMetric(title: "Completed", value: "\(stats.completed)", icon: "checkmark.circle", color: iTuTheme.mint)
                    HabitDetailMetric(title: "Missed", value: "\(stats.missed)", icon: "xmark.circle", color: iTuTheme.coral)
                    if habit.targetType != "BOOLEAN" {
                        HabitDetailMetric(
                            title: "Average completed",
                            value: stats.averageValue.formatted(.number.precision(.fractionLength(0...2))) + (habit.unit.map { " \($0)" } ?? ""),
                            icon: "chart.bar",
                            color: iTuTheme.teal
                        )
                    }
                    HabitDetailMetric(title: "Strongest day", value: weekdayName(stats.strongestWeekday), icon: "arrow.up", color: iTuTheme.mint)
                    HabitDetailMetric(title: "Weakest day", value: weekdayName(stats.weakestWeekday), icon: "arrow.down", color: iTuTheme.coral)
                }
            } else {
                ProgressView("Loading statistics…")
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 30)
            }

            if let stats, !stats.heatmap.isEmpty {
                HabitHeatmapView(states: stats.heatmap)
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Reflections")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Button("Reflect in Journal") { showingReflectionComposer = true }
                        .buttonStyle(iTuGhostButtonStyle(height: 28))
                }
                ForEach(reflections.prefix(3)) { note in
                    Button {
                        model.selectedSection = .journal
                        onClose()
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(note.displayDate)
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                            Text(note.previewText)
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                                .lineLimit(2)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
                if showingReflectionComposer {
                    VStack(alignment: .leading, spacing: 8) {
                        TextEditor(text: $reflectionText)
                            .font(.system(size: 12))
                            .frame(minHeight: 72)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(iTuTheme.border, lineWidth: 1))
                        HStack {
                            Spacer()
                            Button("Cancel") {
                                reflectionText = ""
                                showingReflectionComposer = false
                            }
                            .buttonStyle(iTuGhostButtonStyle(height: 28))
                            Button(savingReflection ? "Saving…" : "Save to Journal") {
                                let content = reflectionText.trimmingCharacters(in: .whitespacesAndNewlines)
                                guard !content.isEmpty else { return }
                                savingReflection = true
                                Task {
                                    await model.createHabitReflection(
                                        habitId: habit.id,
                                        habitName: habit.name,
                                        localDate: iTuCalendarSupport.dayString(),
                                        occurrenceId: model.habitDayState(habitId: habit.id, day: iTuCalendarSupport.dayString())?.occurrenceId,
                                        contentMarkdown: content
                                    )
                                    reflectionText = ""
                                    savingReflection = false
                                    showingReflectionComposer = false
                                }
                            }
                            .buttonStyle(iTuPrimaryButtonStyle(height: 28))
                            .disabled(savingReflection || reflectionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                    .padding(10)
                    .iTuPanel(radius: 10)
                }
            }

            HStack {
                Text("Completed \(stats?.completed ?? 0) · Missed \(stats?.missed ?? 0) · Skipped \(stats?.skipped ?? 0)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
                Spacer()
                Button("Edit Habit") {
                    onEdit()
                    onClose()
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 30))
            }
        }
        .padding(24)
        .frame(width: 520)
        .frame(minHeight: 300)
    }
}

private struct HabitHeatmapView: View {
    let states: [HabitDayStateModel]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Consistency")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            Canvas { context, size in
                let columns = max(1, Int(ceil(Double(states.count) / 7)))
                let gap: CGFloat = 2
                let cell = max(3, (size.width - CGFloat(columns - 1) * gap) / CGFloat(columns))
                for (index, state) in states.enumerated() {
                    let column = index / 7
                    let row = index % 7
                    let rect = CGRect(
                        x: CGFloat(column) * (cell + gap),
                        y: CGFloat(row) * (cell + gap),
                        width: cell,
                        height: cell
                    )
                    context.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(color(for: state.status)))
                }
            }
            .frame(height: 7 * 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 10) {
                legend("Completed", iTuTheme.mint)
                legend("Partial", iTuTheme.amber)
                legend("Missed", iTuTheme.coral)
                legend("Skipped", iTuTheme.inkFaint)
            }
            .font(.system(size: 10))
            .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(12)
        .iTuPanel(radius: 10)
    }

    private func legend(_ title: String, _ color: Color) -> some View {
        Label(title, systemImage: "square.fill")
            .symbolRenderingMode(.palette)
            .foregroundStyle(color, iTuTheme.inkDim)
    }

    private func color(for status: HabitProjectedStatus) -> Color {
        switch status {
        case .completed: return iTuTheme.mint
        case .partial: return iTuTheme.amber
        case .missed, .failed: return iTuTheme.coral
        case .skipped: return iTuTheme.inkFaint
        case .pending: return iTuTheme.surfaceMuted
        case .rest, .notScheduled: return iTuTheme.borderSoft
        }
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

struct HabitGroupsSheet: View {
    let timeBlocks: [HabitTimeBlockModel]
    let onClose: () -> Void
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
                Button("Done") { onClose() }
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

struct HabitEditorSheet: View {
    @Environment(AppModel.self) private var model
    let habit: HabitModel?
    let timeBlocks: [HabitTimeBlockModel]
    let onClose: () -> Void
    let onSave: (HabitModel) -> Void

    @State private var name: String = ""
    @State private var description: String = ""
    @State private var frequency: HabitFrequency = .daily
    @State private var icon: String = "✅"
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
    @State private var allowedSkips: Int = 0
    @State private var restDays: [Int] = []
    @State private var reminderTimes: [String] = []
    @State private var checklistItems: [HabitChecklistItemModel] = []
    @State private var showingAdvancedOptions = false

    var body: some View {
        VStack(spacing: 20) {
            HStack {
                Text(habit == nil ? "New Habit" : "Edit Habit")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Cancel") { onClose() }
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
                    Text("ICON")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(["✅", "🎯", "📅", "⭐", "🔥", "⚡", "🏆", "💯", "💧", "☕", "🍵", "🍎", "🥗", "💪", "🏃", "🚶", "🧘", "😴", "🛌", "📖", "📚", "🧠", "🎓", "📝", "🎨", "🌱", "🌿", "🌳", "🌊", "🏠", "🧹", "🐕", "🪴", "🚭", "📵", "🍬", "🍷"], id: \.self) { emoji in
                                Button {
                                    icon = emoji
                                } label: {
                                    Text(emoji)
                                        .font(.system(size: 18))
                                        .frame(width: 32, height: 32)
                                        .background(icon == emoji ? iTuTheme.teal.opacity(0.2) : iTuTheme.surfaceMuted)
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                        .overlay {
                                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                .stroke(icon == emoji ? iTuTheme.teal : Color.clear, lineWidth: 1.5)
                                        }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
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

                if scheduleType != "TIMES_PER_PERIOD" {
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

                } else {
                    Text("Times per period uses the frequency target above; measurement goals are not used for this schedule.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(10)
                        .iTuPanel(radius: 10)
                }

                HStack {
                    Picker("Direction", selection: $direction) {
                        Text("Build habit").tag(HabitDirection.build)
                        Text("Limit habit").tag(HabitDirection.limit)
                    }
                    .pickerStyle(.segmented)
                }

                DisclosureGroup("More options", isExpanded: $showingAdvancedOptions) {
                    VStack(alignment: .leading, spacing: 12) {
                        Stepper("Allowed skips: \(allowedSkips)", value: $allowedSkips, in: 0...30)

                        VStack(alignment: .leading, spacing: 6) {
                            Text("REST DAYS")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                            HStack(spacing: 5) {
                                ForEach(Array(["S", "M", "T", "W", "T", "F", "S"].enumerated()), id: \.offset) { index, label in
                                    Button(label) {
                                        if restDays.contains(index) {
                                            restDays.removeAll { $0 == index }
                                        } else {
                                            restDays.append(index)
                                            restDays.sort()
                                        }
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(restDays.contains(index) ? iTuTheme.teal : iTuTheme.surfaceMuted)
                                    .foregroundStyle(restDays.contains(index) ? Color.white : iTuTheme.inkDim)
                                    .accessibilityLabel(Calendar.current.weekdaySymbols[index])
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("REMINDERS")
                                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkFaint)
                                Spacer()
                                if reminderTimes.count < 3 {
                                    Button("Add reminder") { reminderTimes.append("08:00") }
                                        .buttonStyle(.plain)
                                        .foregroundStyle(iTuTheme.teal)
                                }
                            }
                            if reminderTimes.isEmpty {
                                Text("None")
                                    .font(.system(size: 12))
                                    .foregroundStyle(iTuTheme.inkDim)
                            } else {
                                ForEach(reminderTimes.indices, id: \.self) { index in
                                    HStack {
                                        TextField("HH:mm", text: $reminderTimes[index])
                                            .textFieldStyle(.roundedBorder)
                                        Button { reminderTimes.remove(at: index) } label: {
                                            Image(systemName: "minus.circle")
                                        }
                                        .buttonStyle(.plain)
                                        .foregroundStyle(iTuTheme.coral)
                                    }
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("CHECKLIST")
                                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkFaint)
                                Spacer()
                                Button("Add step") {
                                    checklistItems.append(HabitChecklistItemModel(id: nil, title: "", required: true, sortOrder: nil))
                                }
                                .buttonStyle(.plain)
                                .foregroundStyle(iTuTheme.teal)
                            }
                            ForEach(checklistItems.indices, id: \.self) { index in
                                HStack {
                                    TextField("Step", text: $checklistItems[index].title)
                                        .textFieldStyle(.roundedBorder)
                                    Toggle("Required", isOn: $checklistItems[index].required)
                                        .toggleStyle(.checkbox)
                                        .labelsHidden()
                                    Button { checklistItems.remove(at: index) } label: {
                                        Image(systemName: "minus.circle")
                                    }
                                    .buttonStyle(.plain)
                                    .foregroundStyle(iTuTheme.coral)
                                }
                            }
                        }
                    }
                    .padding(.top, 8)
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
                    allowedSkips: allowedSkips,
                    restDays: restDays,
                    reminderTimes: reminderTimes.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty },
                    checklistItems: checklistItems.filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty },
                    archivedAt: habit?.archivedAt,
                    currentStreak: habit?.currentStreak ?? 0,
                    bestStreak: habit?.bestStreak ?? 0,
                    isCompletedToday: habit?.isCompletedToday ?? false,
                    totalCompletions: habit?.totalCompletions ?? 0,
                    createdAt: habit?.createdAt ?? ISO8601DateFormatter().string(from: Date()),
                    version: (habit?.version ?? 0) + 1
                )
                onSave(saved)
                onClose()
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
                allowedSkips = habit.allowedSkips
                restDays = habit.restDays
                reminderTimes = habit.reminderTimes
                checklistItems = habit.checklistItems
                showingAdvancedOptions = !habit.reminderTimes.isEmpty || !habit.checklistItems.isEmpty || habit.allowedSkips > 0 || !habit.restDays.isEmpty
            }
        }
    }
}

private extension Date {
    var apiStartOfDay: String {
        formatted(iTuDateSupport.day) + "T00:00:00.000Z"
    }

    static func fromAPI(_ value: String) -> Date? {
        iTuDateSupport.parse(value)
    }
}
