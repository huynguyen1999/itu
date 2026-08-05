import SwiftUI

struct EisenhowerMatrixView: View {
    @Environment(AppModel.self) private var model
    @State private var searchText = ""
    @State private var priorityFilter: TaskPriority?
    @State private var showFilterPopover = false

    var body: some View {
        let matrixSettings = model.settingsStore.matrixSettings
        let filteredTasks = model.tasks.filter { task in
            guard task.deletedAt == nil, task.status != .archived else { return false }
            if let priorityFilter, task.priority != priorityFilter { return false }
            if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let query = searchText.lowercased()
                guard task.title.lowercased().contains(query) else { return false }
            }
            return true
        }
        let allTasks = filteredTasks.sorted { left, right in
            switch matrixSettings.sortOption {
            case .manual:
                return left.id < right.id
            case .dueDate:
                return (left.dueAt ?? "9999") < (right.dueAt ?? "9999")
            case .priority:
                return priorityRank(left.priority) < priorityRank(right.priority)
            case .title:
                return left.title.localizedCaseInsensitiveCompare(right.title) == .orderedAscending
            }
        }

        GeometryReader { proxy in
            let isNarrow = proxy.size.width < 700
            let isShort = proxy.size.height < 600
            let isMedium = proxy.size.width >= 700 && proxy.size.width < 900
            let spacing: CGFloat = isMedium ? 12 : 16
            let pagePadding: CGFloat = isMedium || isNarrow ? 12 : 16

            VStack(alignment: .leading, spacing: spacing) {
                // Header overview bar
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        iTuSectionLabel(title: "Prioritization Matrix", color: iTuTheme.teal)
                        Text("Eisenhower Matrix")
                            .font(.system(size: isNarrow ? 20 : 24, weight: .bold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)

                    HStack(spacing: isNarrow ? 6 : 8) {
                        HStack(spacing: 7) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkFaint)
                            TextField("Search matrix…", text: $searchText)
                                .textFieldStyle(.plain)
                                .font(.system(size: 12))
                        }
                        .padding(.horizontal, 9)
                        .frame(width: isNarrow ? 110 : (isMedium ? 130 : 160), height: 30)
                        .background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(iTuTheme.border, lineWidth: 1)
                        }

                        Button {
                            showFilterPopover.toggle()
                        } label: {
                            Image(systemName: "line.3.horizontal.decrease")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(priorityFilter == nil ? iTuTheme.inkDim : iTuTheme.teal)
                                .frame(width: 30, height: 30)
                                .background(priorityFilter == nil ? iTuTheme.surface : iTuTheme.mintTint)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .stroke(priorityFilter == nil ? iTuTheme.border : iTuTheme.teal.opacity(0.35), lineWidth: 1)
                                }
                        }
                        .buttonStyle(.plain)
                        .pointingHandCursor()
                        .help("Matrix filters")
                        .popover(isPresented: $showFilterPopover, arrowEdge: .top) {
                            MatrixFilterPopover(priorityFilter: $priorityFilter)
                        }

                        if !isNarrow {
                            Text("\(allTasks.filter { $0.status != .completed && $0.status != .canceled }.count) mapped")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                                .lineLimit(1)
                        }
                    }
                }
                .padding(.horizontal, 4)

                // Matrix Workspace
                if isNarrow || isShort {
                    ScrollView {
                        LazyVStack(spacing: spacing) {
                            ForEach(MatrixQuadrant.allCases) { quadrant in
                                MatrixQuadrantCard(
                                    quadrant: quadrant,
                                    tasks: tasksForQuadrant(quadrant, from: allTasks, settings: matrixSettings),
                                    onEditTask: { openTaskEditor($0) }
                                )
                                .frame(height: isShort ? 280 : 340)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                } else {
                    let availableHeight = proxy.size.height - 48 - spacing
                    let rowHeight = max(260, (availableHeight - spacing) / 2)

                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: spacing),
                            GridItem(.flexible())
                        ],
                        spacing: spacing
                    ) {
                        ForEach(MatrixQuadrant.allCases) { quadrant in
                            MatrixQuadrantCard(
                                quadrant: quadrant,
                                tasks: tasksForQuadrant(quadrant, from: allTasks, settings: matrixSettings),
                                onEditTask: { openTaskEditor($0) }
                            )
                            .frame(height: rowHeight)
                        }
                    }
                }
            }
            .padding(pagePadding)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(
                colors: [iTuTheme.canvas, iTuTheme.mintTint.opacity(0.38)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }

    private func openTaskEditor(_ task: ProductivityTask) {
        model.presentedOverlay = .taskEditor(taskID: task.id)
    }

    private func tasksForQuadrant(_ quadrant: MatrixQuadrant, from tasks: [ProductivityTask], settings: MatrixSettings) -> [ProductivityTask] {
        tasks.filter { quadrant.matches(task: $0, settings: settings) }
    }

    private func priorityRank(_ priority: TaskPriority) -> Int {
        switch priority {
        case .high: 0
        case .medium: 1
        case .low: 2
        case .none: 3
        }
    }
}

private struct MatrixFilterPopover: View {
    @Environment(AppModel.self) private var model
    @Binding var priorityFilter: TaskPriority?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Filter & Sort")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(iTuTheme.ink)
                .padding(.bottom, 10)

            Divider()
                .padding(.bottom, 12)

            Text("Priority")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(iTuTheme.inkDim)
                .padding(.bottom, 4)

            MatrixFilterOptionRow(
                title: "All priorities",
                iconName: priorityFilter == nil ? "checkmark.circle.fill" : "circle",
                isSelected: priorityFilter == nil
            ) {
                priorityFilter = nil
            }

            ForEach([TaskPriority.high, .medium, .low, .none], id: \.self) { priority in
                MatrixFilterOptionRow(
                    title: priority.rawValue.capitalized,
                    iconName: priorityFilter == priority ? "checkmark.circle.fill" : "circle",
                    isSelected: priorityFilter == priority
                ) {
                    priorityFilter = priorityFilter == priority ? nil : priority
                }
            }

            Divider()
                .padding(.vertical, 12)

            Text("Sort by")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(iTuTheme.inkDim)
                .padding(.bottom, 4)

            Menu {
                ForEach(MatrixSortOption.allCases) { option in
                    Button {
                        model.settingsStore.matrixSettings.sortOption = option
                    } label: {
                        HStack {
                            Text(option.title)
                            if model.settingsStore.matrixSettings.sortOption == option {
                                Spacer()
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.up.arrow.down")
                        .foregroundStyle(iTuTheme.inkDim)
                    Text(model.settingsStore.matrixSettings.sortOption.title)
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
                .contentShape(Rectangle())
            }
            .menuStyle(.borderlessButton)
            .buttonStyle(.plain)
            .pointingHandCursor()

        }
        .padding(14)
        .frame(width: 230)
        .background(iTuTheme.surface)
    }
}

private struct MatrixFilterOptionRow: View {
    let title: String
    let iconName: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: iconName)
                    .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkFaint)
                    .frame(width: 16)
                Text(title)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
            }
            .frame(maxWidth: .infinity, minHeight: 26, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }
}

enum MatrixQuadrant: String, CaseIterable, Identifiable {
    case q1 // Do First (Urgent & Important)
    case q2 // Schedule (Not Urgent & Important)
    case q3 // Delegate (Urgent & Not Important)
    case q4 // Don't Do (Not Urgent & Not Important)

    var id: String { rawValue }

    var title: String {
        switch self {
        case .q1: "Do now"
        case .q2: "Schedule"
        case .q3: "Delegate or minimize"
        case .q4: "Eliminate"
        }
    }

    var subtitle: String {
        switch self {
        case .q1: "Important + urgent"
        case .q2: "Important + not urgent"
        case .q3: "Not important + urgent"
        case .q4: "Not important + not urgent"
        }
    }

    var accentColor: Color {
        switch self {
        case .q1: iTuTheme.coral
        case .q2: iTuTheme.teal
        case .q3: iTuTheme.amber
        case .q4: iTuTheme.inkDim
        }
    }

    var tintColor: Color {
        switch self {
        case .q1: iTuTheme.coralTint
        case .q2: iTuTheme.mintTint
        case .q3: iTuTheme.amberTint
        case .q4: iTuTheme.borderSoft
        }
    }

    var iconName: String {
        switch self {
        case .q1: "exclamationmark.shield"
        case .q2: "calendar.badge.clock"
        case .q3: "person.wave.2"
        case .q4: "archivebox"
        }
    }

    func matches(task: ProductivityTask, settings: MatrixSettings) -> Bool {
        let isUrgent = task.urgentOverride ?? (settings.urgentPriorities.contains(task.priority) || isDueWithin(task.dueAt, days: settings.urgentDueWithinDays))
        let isImportant = task.important || settings.importantPriorities.contains(task.priority)

        switch self {
        case .q1: return isImportant && isUrgent
        case .q2: return isImportant && !isUrgent
        case .q3: return !isImportant && isUrgent
        case .q4: return !isImportant && !isUrgent
        }
    }

    private func isDueWithin(_ dueAt: String?, days: Int) -> Bool {
        guard days > 0, let dueAt = dueAt, let date = ISO8601DateFormatter().date(from: dueAt) else { return false }
        return date <= Date().addingTimeInterval(Double(days) * 86_400)
    }
}

private struct MatrixQuadrantCard: View {
    @Environment(AppModel.self) private var model
    let quadrant: MatrixQuadrant
    let tasks: [ProductivityTask]
    let onEditTask: (ProductivityTask) -> Void

    @State private var quickTitle = ""
    @State private var isAdding = false
    @State private var showsCompleted = false
    @State private var showsWontDo = false

    private var activeTasks: [ProductivityTask] {
        tasks.filter { $0.status != .completed && $0.status != .canceled }
    }

    private var completedTasks: [ProductivityTask] {
        tasks.filter { $0.status == .completed }
    }

    private var wontDoTasks: [ProductivityTask] {
        tasks.filter { $0.status == .canceled }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Quadrant Header
            HStack(spacing: 10) {
                Image(systemName: quadrant.iconName)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(quadrant.accentColor)
                    .frame(width: 28, height: 28)
                    .background(quadrant.tintColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 1) {
                    Text(quadrant.title)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)
                    Text(quadrant.subtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                Spacer()

                HStack(spacing: 6) {
                    Text("\(activeTasks.count)")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(quadrant.accentColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(quadrant.tintColor)
                        .clipShape(Capsule())

                    Button {
                        isAdding.toggle()
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(quadrant.accentColor)
                            .frame(width: 26, height: 26)
                            .background(quadrant.tintColor)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()
                    .help("Add task to \(quadrant.title)")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(iTuTheme.surface)

            Divider()

            // Flexible Content Area
            ZStack {
                if activeTasks.isEmpty && completedTasks.isEmpty && wontDoTasks.isEmpty {
                    VStack(spacing: 6) {
                        Image(systemName: quadrant.iconName)
                            .font(.system(size: 20))
                            .foregroundStyle(quadrant.accentColor.opacity(0.5))
                            .padding(.bottom, 2)
                        Text("No tasks in \(quadrant.title.lowercased())")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(iTuTheme.inkFaint)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            if activeTasks.isEmpty {
                                VStack(spacing: 4) {
                                    Text("No active tasks")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(iTuTheme.inkFaint)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                            } else {
                                ForEach(activeTasks) { task in
                                    MatrixTaskRow(task: task, quadrant: quadrant, onEdit: { onEditTask(task) })
                                }
                            }

                            resolvedTasks(
                                title: "Completed",
                                tasks: completedTasks,
                                isExpanded: $showsCompleted,
                                color: iTuTheme.mint
                            )
                            resolvedTasks(
                                title: "Won't do",
                                tasks: wontDoTasks,
                                isExpanded: $showsWontDo,
                                color: iTuTheme.inkDim
                            )
                        }
                        .padding(10)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if isAdding {
                Divider()

                HStack(spacing: 8) {
                    TextField("Task title…", text: $quickTitle)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .onSubmit(addTask)

                    Button("Add") { addTask() }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 28))
                        .disabled(quickTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    Button {
                        isAdding = false
                        quickTitle = ""
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(iTuTheme.inkFaint)
                    }
                    .buttonStyle(.plain)
                }
                .padding(10)
                .background(iTuTheme.surface)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(quadrant.accentColor.opacity(0.22), lineWidth: 1.5)
        }
        .shadow(color: iTuTheme.forest.opacity(0.04), radius: 4, y: 2)
        .clipped()
    }

    private func addTask() {
        let title = quickTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        quickTitle = ""
        isAdding = false

        let isImportant = (quadrant == .q1 || quadrant == .q2)
        let isUrgent = (quadrant == .q1 || quadrant == .q3)

        Task {
            await model.createTask(
                title: title,
                important: isImportant,
                urgentOverride: isUrgent
            )
        }
    }

    @ViewBuilder
    private func resolvedTasks(
        title: String,
        tasks: [ProductivityTask],
        isExpanded: Binding<Bool>,
        color: Color
    ) -> some View {
        if !tasks.isEmpty {
            DisclosureGroup(isExpanded: isExpanded) {
                VStack(spacing: 8) {
                    ForEach(tasks) { task in
                        MatrixTaskRow(task: task, quadrant: quadrant, onEdit: { onEditTask(task) })
                    }
                }
                .padding(.top, 8)
            } label: {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.system(size: 12, weight: .semibold))
                    Text("\(tasks.count)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(color.opacity(0.12))
                        .clipShape(Capsule())
                    Spacer()
                }
                .foregroundStyle(color)
                .contentShape(Rectangle())
            }
            .padding(.top, 4)
        }
    }
}

private struct MatrixTaskRow: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let quadrant: MatrixQuadrant
    let onEdit: () -> Void

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 10) {
            Button {
                Task { await model.cycleTaskStatus(task) }
            } label: {
                statusIcon
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(width: 30, height: 30)
            .contentShape(Rectangle())
            .zIndex(1)
            .pointingHandCursor()
            .accessibilityLabel("Status: \(task.status.displayName)")

            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(task.status == .completed ? iTuTheme.inkFaint : iTuTheme.ink)
                    .strikethrough(task.status == .completed)
                    .lineLimit(2)
                    .layoutPriority(1)

                WrappingHStack(horizontalSpacing: 5, verticalSpacing: 4) {
                    if let taskListName {
                        MatrixTaskChip(
                            title: taskListName,
                            systemImage: "list.bullet",
                            foreground: iTuTheme.inkDim,
                            background: iTuTheme.surface
                        )
                    }

                    if task.priority != .none {
                        MatrixTaskChip(
                            title: priorityLabel,
                            systemImage: "flag.fill",
                            foreground: priorityColor,
                            background: priorityBackground
                        )
                    }

                    if let dueAt = task.dueAt {
                        MatrixTaskChip(
                            title: formattedDueDate(dueAt),
                            systemImage: "calendar",
                            foreground: dueColor(dueAt),
                            background: dueBackground(dueAt)
                        )
                    }

                    if let reminder = task.reminders?.first(where: { $0.status == "SCHEDULED" || $0.status == "SNOOZED" }) {
                        MatrixTaskChip(
                            title: formattedDueDate(reminder.remindAt),
                            systemImage: "bell.fill",
                            foreground: iTuTheme.teal,
                            background: iTuTheme.mintTint
                        )
                    }

                    if let growthRule = model.growthEarningRules[task.id] {
                        GrowthRewardSummaryView(
                            rule: growthRule,
                            compact: true,
                            dense: true,
                            archivedSkillIDs: Set(model.skills.filter { $0.archivedAt != nil }.map(\.id))
                        )
                    }
                }
            }

            Spacer()

            TaskActionMenuButton(task: task, onOpenDetails: onEdit)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            isHovered ? iTuTheme.mintTint.opacity(0.4) : iTuTheme.surfaceMuted
        )
        .contentShape(Rectangle())
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(iTuTheme.borderSoft, lineWidth: 1)
        }
        .onTapGesture(perform: onEdit)
        .taskActionMenu(for: task, onOpenDetails: onEdit)
        .onHover { isHovered = $0 }
        .pointingHandCursor()
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch task.status {
        case .completed:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(iTuTheme.mint)
        case .inProgress:
            Image(systemName: "play.circle.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(iTuTheme.teal)
        case .canceled:
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(iTuTheme.coral)
        default:
            Circle()
                .stroke(quadrant.accentColor, lineWidth: 1.5)
                .frame(width: 18, height: 18)
        }
    }

    private var taskListName: String? {
        guard let taskListId = task.taskListId else { return nil }
        return model.taskLists.first(where: { $0.id == taskListId })?.name
    }

    private var priorityLabel: String {
        task.priority.rawValue.lowercased()
    }

    private var priorityColor: Color {
        switch task.priority {
        case .high: iTuTheme.coral
        case .medium: iTuTheme.amber
        case .low: iTuTheme.teal
        case .none: iTuTheme.inkFaint
        }
    }

    private var priorityBackground: Color {
        switch task.priority {
        case .high: iTuTheme.coralTint
        case .medium: iTuTheme.amberTint
        case .low: iTuTheme.mintTint
        case .none: iTuTheme.surface
        }
    }

    private func dueColor(_ value: String) -> Color {
        isResolved ? iTuTheme.inkDim : (isOverdue(value) ? iTuTheme.coral : iTuTheme.teal)
    }

    private func dueBackground(_ value: String) -> Color {
        isResolved ? iTuTheme.surface : (isOverdue(value) ? iTuTheme.coralTint : iTuTheme.mintTint)
    }

    private func formattedDueDate(_ value: String) -> String {
        guard let date = parseDate(value) else { return value }

        if isResolved {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "dd MMM"
            return formatter.string(from: date)
        }
        if Calendar.current.isDateInToday(date) {
            return "Today"
        }
        if isOverdue(value) {
            let days = Calendar.current.dateComponents([.day], from: date, to: Date()).day ?? 1
            return "\(days) Day\(days == 1 ? "" : "s") Overdue"
        }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }

    private func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }

        let simpleFormatter = DateFormatter()
        simpleFormatter.dateFormat = "yyyy-MM-dd"
        return simpleFormatter.date(from: value)
    }

    private func isOverdue(_ value: String) -> Bool {
        guard let date = parseDate(value) else { return false }
        return date < Date() && !Calendar.current.isDateInToday(date)
    }

    private var isResolved: Bool {
        task.status == .completed || task.status == .canceled
    }
}

private struct MatrixTaskChip: View {
    let title: String
    let systemImage: String
    let foreground: Color
    let background: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.system(size: 9, weight: .medium, design: .monospaced))
            .foregroundStyle(foreground)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(background)
            .clipShape(Capsule())
            .overlay {
                Capsule()
                    .stroke(foreground.opacity(0.2), lineWidth: 1)
            }
    }
}
