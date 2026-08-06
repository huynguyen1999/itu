import SwiftUI

struct HomeOverviewView: View {
    @Environment(AppModel.self) private var model
    @State private var quickTaskTitle = ""
    @State private var quickPriority: TaskPriority = .none
    @State private var showCaptureOptions = false
    @State private var quickDescription = ""

    var body: some View {
        let todayTasks = model.homeTodayTasks()
        let completedTodayCount = todayTasks.filter { $0.status == .completed }.count

        ScrollView {
            VStack(spacing: 24) {
                headerBar

                ViewThatFits(in: .horizontal) {
                    wideLayout(todayTasks: todayTasks, completedCount: completedTodayCount)
                    narrowLayout(todayTasks: todayTasks, completedCount: completedTodayCount)
                }
            }
            .padding(24)
            .frame(maxWidth: 1140)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(iTuTheme.canvas)
    }

    private func openTaskEditor(_ task: ProductivityTask) {
        model.presentedOverlay = .taskEditor(taskID: task.id)
    }

    private func wideLayout(todayTasks: [ProductivityTask], completedCount: Int) -> some View {
        HStack(alignment: .top, spacing: 20) {
            VStack(spacing: 16) {
                levelHeroBanner
                todayTasksSection(todayTasks: todayTasks, completedCount: completedCount)
                todayHabitsSection
            }
            .frame(minWidth: 320, maxWidth: .infinity)

            attributeProfileCard
                .frame(width: 360)
        }
    }

    private func narrowLayout(todayTasks: [ProductivityTask], completedCount: Int) -> some View {
        VStack(spacing: 16) {
            levelHeroBanner
            todayTasksSection(todayTasks: todayTasks, completedCount: completedCount)
            todayHabitsSection
            attributeProfileCard
        }
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        VStack(alignment: .leading, spacing: 4) {
            iTuSectionLabel(title: "Overview & Workspace", color: iTuTheme.teal)
            Text("Home")
                .font(.system(size: 26, weight: .bold, design: .serif))
                .foregroundStyle(iTuTheme.ink)
            Text("Your local-first task workspace and connected account status.")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Level & Today Activity Hero Card (Left Column)

    private var levelHeroBanner: some View {
        VStack(spacing: 22) {
            // Account Level & XP Row
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    Text("ACCOUNT LEVEL")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .tracking(1.2)
                        .foregroundStyle(Color.white.opacity(0.65))

                    Spacer()

                    // Gold Seal Badge matching Web
                    ZStack {
                        Circle()
                            .stroke(iTuTheme.gold.opacity(0.65), lineWidth: 1.5)
                            .frame(width: 38, height: 38)
                        Circle()
                            .stroke(iTuTheme.gold.opacity(0.35), lineWidth: 1)
                            .frame(width: 28, height: 28)
                        Text(model.growthLevel.map { String($0) } ?? "—")
                            .font(.system(size: 14, weight: .bold, design: .serif))
                            .foregroundStyle(iTuTheme.goldSoft)
                    }
                }

                ViewThatFits(in: .horizontal) {
                    levelAndExperienceRow
                    VStack(alignment: .leading, spacing: 14) {
                        levelLabel
                        experienceProgress
                    }
                }
            }

            Rectangle()
                .fill(Color.white.opacity(0.12))
                .frame(height: 1)

            // Today's Activity Section
            VStack(alignment: .leading, spacing: 10) {
                Text("TODAY'S ACTIVITY")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(1.0)
                    .foregroundStyle(Color.white.opacity(0.65))

                HStack(spacing: 10) {
                    CompactStatTileView(
                        icon: "clock",
                        title: "Focus Today",
                        value: "\(model.focusTimer.totalFocusedMinutes)m",
                        detail: "Deep work",
                        section: .focus
                    )
                    CompactStatTileView(
                        icon: "book.closed",
                        title: "To Review",
                        value: "\(model.decks.reduce(0) { $0 + $1.dueCount })",
                        detail: "Scheduled now",
                        section: .learn
                    )
                    CompactStatTileView(
                        icon: "chart.bar",
                        title: "Reviewed",
                        value: "—",
                        detail: "Study total unavailable",
                        section: .learn
                    )
                }
            }
        }
        .padding(24)
        .iTuGradientCard(radius: 20)
    }

    private var levelLabel: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(model.growthLevel.map { String(format: "%02d", $0) } ?? "—")
                .font(.system(size: 52, weight: .medium, design: .serif))
                .foregroundStyle(.white)
            Text("current level")
                .font(.system(size: 11))
                .foregroundStyle(Color.white.opacity(0.65))
        }
    }

    private var levelAndExperienceRow: some View {
        HStack(alignment: .bottom, spacing: 20) {
            levelLabel
            Spacer()
            experienceProgress
        }
    }

    private var experienceProgress: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text("EXPERIENCE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color.white.opacity(0.65))
                Spacer()
                Text(xpProgressText)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Color.white.opacity(0.85))
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.14)).frame(height: 6)
                    Capsule()
                        .fill(LinearGradient(colors: [iTuTheme.gold, Color(hex: 0xD9B96A)], startPoint: .leading, endPoint: .trailing))
                        .frame(width: geo.size.width * xpProgress, height: 6)
                }
            }
            .frame(height: 6)
            Text(xpNextLevelText)
                .font(.system(size: 11))
                .foregroundStyle(Color.white.opacity(0.55))
        }
        .frame(width: 200)
    }

    // MARK: - Attribute Profile Radar Card (Right Column)

    private var attributeProfileCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    iTuSectionLabel(title: "Attribute Profile", color: iTuTheme.inkDim)
                    Text("\(attributes.count) attributes")
                        .font(.system(size: 18, weight: .bold, design: .serif))
                        .foregroundStyle(iTuTheme.ink)
                }
                Spacer()

                Button {
                    model.selectedSection = .growth
                } label: {
                    HStack(spacing: 3) {
                        Text("MANAGE")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundStyle(iTuTheme.teal)
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
            }

            if attributes.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "chart.pie.fill")
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("Attributes are not available yet")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 280)
            } else {
                AttributeRadarChartView(attributes: attributes)
            }
        }
        .padding(24)
        .iTuPanel(radius: 20)
    }

    // MARK: - Today's Tasks Section (Bottom Left Column)

    private func todayTasksSection(todayTasks: [ProductivityTask], completedCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Today's tasks")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)

                Spacer()

                Text("\(completedCount) of \(max(1, todayTasks.count)) completed")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
            }

            // Quick capture bar matching Web
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)

                    TextField("What needs to get done? (try '!high' or '#today')", text: $quickTaskTitle)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .onSubmit(addTask)

                    Button {
                        showCaptureOptions.toggle()
                    } label: {
                        Image(systemName: showCaptureOptions ? "chevron.up" : "slider.horizontal.3")
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(iTuGhostButtonStyle(height: 28))
                    .help(showCaptureOptions ? "Hide task details" : "Add task details")

                    Button("Add", action: addTask)
                        .buttonStyle(iTuSecondaryButtonStyle(height: 30))
                        .disabled(quickTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                if showCaptureOptions {
                    Divider()

                    HStack(spacing: 10) {
                        TextField("Notes (optional)", text: $quickDescription)
                            .textFieldStyle(.plain)
                            .font(.system(size: 12))

                        Picker("Priority", selection: $quickPriority) {
                            ForEach(TaskPriority.allCases, id: \.self) { priority in
                                Text(priority.rawValue.capitalized).tag(priority)
                            }
                        }
                        .labelsHidden()
                        .frame(width: 120)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }

            // Today tasks list
            if todayTasks.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "sun.max")
                        .font(.system(size: 24))
                        .foregroundStyle(iTuTheme.teal)
                    Text("Your day is clear")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Capture a task above to start your day.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 36)
                .iTuPanel(radius: 14)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(todayTasks) { task in
                        HomeTaskRowView(task: task, onEdit: { openTaskEditor(task) })
                        if task.id != todayTasks.last?.id {
                            Rectangle()
                                .fill(iTuTheme.borderSoft)
                                .frame(height: 1)
                                .padding(.leading, 44)
                        }
                    }
                }
                .iTuPanel(radius: 14)
            }
        }
    }

    private var todayHabits: [HabitModel] {
        model.habits.filter { habit in
            habit.archivedAt == nil
        }
    }

    private var todayDateString: String {
        Date().formatted(iTuDateSupport.day)
    }

    private var completedTodayHabitCount: Int {
        todayHabits.reduce(into: 0) { count, habit in
            if model.habitOccurrence(habitId: habit.id, day: todayDateString)?.status == .completed {
                count += 1
            }
        }
    }

    private var todayHabitsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Today's habits")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Text("\(completedTodayHabitCount) of \(todayHabits.count) done")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
                Button("View all") {
                    model.selectedSection = .habits
                }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(iTuTheme.teal)
            }

            if model.habitOccurrencesLoading && todayHabits.isEmpty {
                ProgressView("Loading today's habits…")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .iTuPanel(radius: 14)
            } else if let message = model.habitOccurrencesErrorMessage, todayHabits.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Could not load today's habits: \(message)")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                    Button("Retry") {
                        Task { await model.refreshHabitOccurrences(from: todayDateString, to: todayDateString, force: true) }
                    }
                    .buttonStyle(iTuGhostButtonStyle(height: 30))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .iTuPanel(radius: 14)
            } else if todayHabits.isEmpty {
                Text("No active habits for today.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .iTuPanel(radius: 14)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(todayHabits) { habit in
                        let occurrence = model.habitOccurrence(habitId: habit.id, day: todayDateString)
                        HStack(spacing: 12) {
                            HabitOccurrenceButton(
                                habitName: habit.name,
                                dayLabel: "Today",
                                dayNumber: Calendar.current.component(.day, from: Date()),
                                dayDate: todayDateString,
                                occurrence: occurrence,
                                isLoading: model.habitOccurrencesLoading,
                                didFailLoading: model.habitOccurrencesErrorMessage != nil,
                                onCheckIn: { occurrence in
                                    Task { await model.checkInHabitOccurrence(occurrence, value: max(1, habit.targetValue)) }
                                },
                                onAction: { occurrence, action in
                                    Task { await model.habitOccurrenceAction(occurrence, action: action) }
                                },
                                onCheckInDate: {
                                    Task { await model.checkInHabitDate(habitId: habit.id, date: todayDateString, value: max(1, habit.targetValue)) }
                                }
                            )
                            VStack(alignment: .leading, spacing: 2) {
                                Text(habit.name)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(iTuTheme.ink)
                                Text(habit.frequency.rawValue.capitalized)
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkDim)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        if habit.id != todayHabits.last?.id {
                            Rectangle()
                                .fill(iTuTheme.borderSoft)
                                .frame(height: 1)
                                .padding(.leading, 58)
                        }
                    }
                }
                .iTuPanel(radius: 14)
            }
        }
        .task(id: todayDateString) {
            await model.refreshHabitOccurrences(from: todayDateString, to: todayDateString)
        }
    }

    private func addTask() {
        let title = quickTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        let description = quickDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedPriority = quickPriority
        quickTaskTitle = ""
        quickDescription = ""
        quickPriority = .none

        var components = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        components.hour = 18
        let date = Calendar.current.date(from: components) ?? Date()
        let dueAt = ISO8601DateFormatter().string(from: date)

        Task {
            await model.createTask(
                title: title,
                descriptionMarkdown: description,
                priority: selectedPriority,
                dueAt: dueAt
            )
        }
    }

    private var attributes: [UserAttribute] { model.attributes }

    private var xpProgressValues: (current: Int, required: Int)? {
        if let current = model.growthProgressXp,
           let required = model.growthRequiredXp,
           required > 0 {
            return (current, required)
        }

        guard let total = model.growthCurrentXp,
              let next = model.growthNextLevelXp,
              let level = model.growthLevel,
              level > 0 else { return nil }
        let levelSquared = level * level
        let baseXP = max(1, next / levelSquared)
        let levelStartXP = baseXP * (level - 1) * (level - 1)
        return (max(0, total - levelStartXP), max(1, next - levelStartXP))
    }

    private var xpProgress: CGFloat {
        guard let values = xpProgressValues else { return 0 }
        return min(1, max(0, CGFloat(values.current) / CGFloat(values.required)))
    }

    private var xpProgressText: String {
        guard let values = xpProgressValues else { return "—" }
        return "\(values.current) / \(values.required) XP"
    }

    private var xpNextLevelText: String {
        guard let level = model.growthLevel,
              let next = model.growthNextLevelXp else { return "Growth profile unavailable" }
        return "Level \(level + 1) target: \(next) XP"
    }
}

// MARK: - Compact Stat Tile Component

private struct CompactStatTileView: View {
    @Environment(AppModel.self) private var model
    let icon: String
    let title: String
    let value: String
    let detail: String
    let section: AppSection

    @State private var isHovered = false

    var body: some View {
        Button {
            model.selectedSection = section
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    ZStack {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(Color.white.opacity(0.12))
                            .frame(width: 28, height: 28)
                        Image(systemName: icon)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(iTuTheme.goldSoft)
                    }
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color.white.opacity(isHovered ? 0.8 : 0.3))
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(value)
                        .font(.system(size: 20, weight: .bold, design: .serif))
                        .foregroundStyle(.white)

                    Text(title.uppercased())
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(Color.white.opacity(0.7))

                    Text(detail)
                        .font(.system(size: 10))
                        .foregroundStyle(Color.white.opacity(0.55))
                        .lineLimit(1)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(isHovered ? 0.12 : 0.06))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.white.opacity(isHovered ? 0.25 : 0.1), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
        .onHover { hovering in
            isHovered = hovering
            if hovering {
                NSCursor.pointingHand.push()
            } else {
                NSCursor.pop()
            }
        }
    }
}

// MARK: - Attribute Radar Chart Component matching Web Profile Radar Chart

private struct AttributeRadarChartView: View {
    struct AttributeItem: Identifiable {
        let id: String
        let name: String
        let level: Int
        let totalXP: Int
        let progress: CGFloat
        let color: Color
        let icon: String
    }

    let items: [AttributeItem]

    init(attributes: [UserAttribute]) {
        let ceiling = max(1, Int(ceil(Double(attributes.map(\.currentXP).max() ?? 0) * 1.1)))
        items = attributes.map { attribute in
            AttributeItem(
                id: attribute.id,
                name: attribute.name,
                level: attribute.level,
                totalXP: attribute.currentXP,
                progress: min(1, max(0, CGFloat(attribute.currentXP) / CGFloat(ceiling))),
                color: Self.color(for: attribute.color),
                icon: attribute.icon
            )
        }
    }

    private static func color(for value: String) -> Color {
        switch value.lowercased() {
        case "mint": iTuTheme.mint
        case "amber": iTuTheme.amber
        case "coral": iTuTheme.coral
        case "purple": iTuTheme.gold
        case "blue": iTuTheme.syncBlue
        default: iTuTheme.teal
        }
    }

    var body: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let radius = min(geo.size.width, geo.size.height) * 0.30

            ZStack {
                gridShapes(center: center, radius: radius)
                axisLines(center: center, radius: radius)
                radarFill(center: center, radius: radius)
                radarOutline(center: center, radius: radius)
                vertexPointsAndLabels(center: center, radius: radius, availableWidth: geo.size.width)
            }
        }
        .frame(height: 280)
    }

    private func radarFill(center: CGPoint, radius: CGFloat) -> some View {
        filledRadarShape(center: center, radius: radius)
            .fill(
                LinearGradient(
                    colors: [iTuTheme.mint.opacity(0.30), iTuTheme.teal.opacity(0.20)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .shadow(color: iTuTheme.teal.opacity(0.12), radius: 4, y: 2)
    }

    private func radarOutline(center: CGPoint, radius: CGFloat) -> some View {
        filledRadarShape(center: center, radius: radius)
            .stroke(iTuTheme.teal, lineWidth: 2.5)
    }

    @ViewBuilder
    private func gridShapes(center: CGPoint, radius: CGFloat) -> some View {
        ForEach([1, 2, 3], id: \.self) { levelStep in
            radarGridPath(center: center, radius: radius * CGFloat(levelStep) / 3)
            .stroke(iTuTheme.borderSoft.opacity(levelStep == 3 ? 0.9 : 0.65), lineWidth: 1)
        }
    }

    private func radarGridPath(center: CGPoint, radius: CGFloat) -> Path {
        Path { path in
            for index in 0..<items.count {
                let angle = Double(index) * (2 * .pi / Double(items.count)) - (.pi / 2)
                let point = CGPoint(
                    x: center.x + radius * CGFloat(cos(angle)),
                    y: center.y + radius * CGFloat(sin(angle))
                )
                if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
            }
            path.closeSubpath()
        }
    }

    @ViewBuilder
    private func axisLines(center: CGPoint, radius: CGFloat) -> some View {
        let count = items.count
        Path { path in
            for i in 0..<count {
                let angle = Double(i) * (2 * .pi / Double(count)) - (.pi / 2)
                let pt = CGPoint(
                    x: center.x + radius * CGFloat(cos(angle)),
                    y: center.y + radius * CGFloat(sin(angle))
                )
                path.move(to: center)
                path.addLine(to: pt)
            }
        }
        .stroke(iTuTheme.border.opacity(0.55), lineWidth: 1)
    }

    private func filledRadarShape(center: CGPoint, radius: CGFloat) -> Path {
        let count = items.count
        return Path { path in
            for (i, item) in items.enumerated() {
                let stepRadius = radius * item.progress
                let angle = Double(i) * (2 * .pi / Double(count)) - (.pi / 2)
                let pt = CGPoint(
                    x: center.x + stepRadius * CGFloat(cos(angle)),
                    y: center.y + stepRadius * CGFloat(sin(angle))
                )
                if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
            }
            path.closeSubpath()
        }
    }

    @ViewBuilder
    private func vertexPointsAndLabels(center: CGPoint, radius: CGFloat, availableWidth: CGFloat) -> some View {
        let count = items.count
        let labelWidth = min(132, max(96, availableWidth * 0.38))
        ForEach(0..<count, id: \.self) { i in
            AttributeVertexView(
                item: items[i],
                index: i,
                totalCount: count,
                center: center,
                radius: radius,
                labelWidth: labelWidth
            )
        }
    }
}

private struct AttributeVertexView: View {
    let item: AttributeRadarChartView.AttributeItem
    let index: Int
    let totalCount: Int
    let center: CGPoint
    let radius: CGFloat
    let labelWidth: CGFloat

    var body: some View {
        let angle = Double(index) * (2 * .pi / Double(totalCount)) - (.pi / 2)
        let stepRadius = radius * item.progress
        let dotX = center.x + stepRadius * CGFloat(cos(angle))
        let dotY = center.y + stepRadius * CGFloat(sin(angle))
        let labelRadius = radius + 38
        let labelX = center.x + labelRadius * CGFloat(cos(angle))
        let labelY = center.y + labelRadius * CGFloat(sin(angle))
        let side = cos(angle)
        let labelAlignment: Alignment = side > 0.25 ? .leading : (side < -0.25 ? .trailing : .center)
        let textAlignment: TextAlignment = side > 0.25 ? .leading : (side < -0.25 ? .trailing : .center)
        let labelOffset: CGFloat = side > 0.25 ? labelWidth / 2 : (side < -0.25 ? -labelWidth / 2 : 0)

        ZStack {
            Circle()
                .fill(item.color)
                .frame(width: 7, height: 7)
                .overlay {
                    Circle()
                        .stroke(iTuTheme.surface, lineWidth: 1.5)
                }
                .shadow(color: item.color.opacity(0.2), radius: 1.5, y: 1)
                .position(x: dotX, y: dotY)

            VStack(spacing: 2) {
                HStack(spacing: 3) {
                    GrowthIconView(icon: item.icon, size: 10, color: item.color)
                    Text(item.name)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                        .multilineTextAlignment(textAlignment)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                }
                Text("\(item.totalXP) XP · Lv \(item.level)")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
                    .multilineTextAlignment(textAlignment)
                    .lineLimit(1)
            }
            .frame(width: labelWidth, alignment: labelAlignment)
            .position(x: labelX + labelOffset, y: labelY)
        }
    }
}

// MARK: - Task Row Component

private struct HomeTaskRowView: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let onEdit: () -> Void

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 12) {
            Button {
                Task { await model.toggleCompletion(task) }
            } label: {
                Image(systemName: task.status == .completed ? "checkmark" : "")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 24, height: 24)
                    .background(task.status == .completed ? iTuTheme.mint : Color.clear)
                    .clipShape(Circle())
                    .overlay {
                        Circle()
                            .stroke(task.status == .completed ? iTuTheme.mint : iTuTheme.inkFaint.opacity(0.55), lineWidth: 1.5)
                    }
            }
            .buttonStyle(.plain)
            .pointingHandCursor()

            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(task.status == .completed ? iTuTheme.inkFaint : iTuTheme.ink)
                    .strikethrough(task.status == .completed)

                if let dueAt = task.dueAt {
                    Text(dueAt.contains("T") ? String(dueAt.prefix(10)) : dueAt)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(iTuTheme.teal)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(iTuTheme.mintTint)
                        .clipShape(Capsule())
                }
            }

            Spacer()

            if task.priority != .none {
                Text(task.priority.rawValue.capitalized)
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(priorityColor(task.priority))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(priorityColor(task.priority).opacity(0.12))
                    .clipShape(Capsule())
            }

            TaskActionMenuButton(task: task, onOpenDetails: onEdit)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(isHovered ? iTuTheme.mintTint.opacity(0.4) : Color.clear)
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
        .taskActionMenu(for: task, onOpenDetails: onEdit)
        .onHover { hovering in
            isHovered = hovering
            if hovering {
                NSCursor.pointingHand.push()
            } else {
                NSCursor.pop()
            }
        }
    }

    private func priorityColor(_ priority: TaskPriority) -> Color {
        switch priority {
        case .high: iTuTheme.coral
        case .medium: iTuTheme.amber
        case .low, .none: iTuTheme.teal
        }
    }
}
