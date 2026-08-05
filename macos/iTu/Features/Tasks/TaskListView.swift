import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct TaskListView: View {
    @Environment(AppModel.self) private var model
    let section: AppSection
    var filterQuery: String = ""
    var taskListId: String? = nil

    @State private var newTaskTitle = ""
    @State private var priority: TaskPriority = .none
    @State private var hasReminder = false
    @State private var reminderDate = Date().addingTimeInterval(3600)
    @State private var editingTask: ProductivityTask?
    @State private var isInboxGroupExpanded = true
    @State private var isCompletedGroupExpanded = true
    @State private var draggedTaskId: String?

    var body: some View {
        var allSectionTasks = model.tasks(for: section)

        if let taskListId {
            allSectionTasks = allSectionTasks.filter { $0.taskListId == taskListId }
        }

        if !filterQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let query = filterQuery.lowercased()
            allSectionTasks = allSectionTasks.filter { $0.title.lowercased().contains(query) }
        }

        if model.hideCompletedTasks {
            allSectionTasks = allSectionTasks.filter { $0.status != .completed }
        }

        switch model.sortOption {
        case .manual:
            allSectionTasks.sort { $0.sortOrder < $1.sortOrder }
        case .priority:
            allSectionTasks.sort { lhs, rhs in
                let lhsWeight = priorityWeight(lhs.priority)
                let rhsWeight = priorityWeight(rhs.priority)
                if lhsWeight != rhsWeight { return lhsWeight > rhsWeight }
                return lhs.sortOrder < rhs.sortOrder
            }
        case .dueDate:
            allSectionTasks.sort { lhs, rhs in
                guard let lDate = lhs.dueAt else { return false }
                guard let rDate = rhs.dueAt else { return true }
                return lDate < rDate
            }
        case .title:
            allSectionTasks.sort { $0.title.localizedCompare($1.title) == .orderedAscending }
        }

        let pendingTasks = allSectionTasks.filter { ![.completed, .canceled].contains($0.status) }
        let completedTasks = allSectionTasks.filter { [.completed, .canceled].contains($0.status) }

        return ScrollView {
            VStack(spacing: 20) {
                // Quick Capture Bar matching Web Plan page
                if section != .completed {
                    quickCaptureBar
                }

                // Group 1: Active / Pending Tasks Group ("Inbox")
                if !pendingTasks.isEmpty || (completedTasks.isEmpty && pendingTasks.isEmpty) {
                    taskGroupSection(
                        title: section == .today ? "Today" : "Inbox",
                        tasks: pendingTasks,
                        isExpanded: $isInboxGroupExpanded,
                        onReorder: { draggedId, beforeId in
                            let ordered = reorderedVisibleIds(
                                pending: pendingTasks.map(\.id),
                                completed: completedTasks.map(\.id),
                                draggedId: draggedId,
                                beforeId: beforeId
                            )
                            Task { await model.reorderTasks(ordered) }
                        }
                    )
                }

                // Group 2: Completed & Won't Do Tasks Group
                if !completedTasks.isEmpty && !model.hideCompletedTasks {
                    taskGroupSection(
                        title: "Completed & Won’t Do",
                        tasks: completedTasks,
                        isExpanded: $isCompletedGroupExpanded,
                        onReorder: { draggedId, beforeId in
                            let ordered = reorderedVisibleIds(
                                pending: pendingTasks.map(\.id),
                                completed: completedTasks.map(\.id),
                                draggedId: draggedId,
                                beforeId: beforeId
                            )
                            Task { await model.reorderTasks(ordered) }
                        }
                    )
                }
            }
            .padding(24)
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(
            LinearGradient(
                colors: [iTuTheme.canvas, iTuTheme.mintTint.opacity(0.3)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .sheet(item: $editingTask) { task in
            TaskEditorView(task: task)
        }
    }

    private func priorityWeight(_ priority: TaskPriority) -> Int {
        switch priority {
        case .high: 3
        case .medium: 2
        case .low: 1
        case .none: 0
        }
    }

    private func reorderedVisibleIds(
        pending: [String],
        completed: [String],
        draggedId: String,
        beforeId: String
    ) -> [String] {
        var ordered = pending + completed
        guard let from = ordered.firstIndex(of: draggedId) else { return ordered }
        ordered.remove(at: from)
        if let to = ordered.firstIndex(of: beforeId) {
            ordered.insert(draggedId, at: to)
        } else {
            ordered.append(draggedId)
        }
        return ordered
    }

    // MARK: - Quick Capture Input Bar (Matching Web App)

    private var quickCaptureBar: some View {
        HStack(spacing: 12) {
            HStack(spacing: 11) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(iTuTheme.teal)

                TextField("What needs to get done? (try “!high” or “#today”)", text: $newTaskTitle)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .foregroundStyle(iTuTheme.ink)
                    .onSubmit(addTask)

                Menu {
                    Picker("Priority", selection: $priority) {
                        ForEach(TaskPriority.allCases, id: \.self) { value in
                            Label(priorityLabel(value), systemImage: priorityIcon(value))
                                .tag(value)
                        }
                    }
                } label: {
                    Image(systemName: priorityIcon(priority))
                        .font(.system(size: 13))
                        .foregroundStyle(priority == .none ? iTuTheme.inkFaint : priorityColor(priority))
                        .frame(width: 28, height: 28)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .help("Set priority")

                Menu {
                    Toggle("Set reminder", isOn: $hasReminder)
                    if hasReminder {
                        DatePicker("Remind at", selection: $reminderDate, in: Date()...)
                    }
                } label: {
                    Image(systemName: hasReminder ? "bell.fill" : "bell")
                        .font(.system(size: 13))
                        .foregroundStyle(hasReminder ? iTuTheme.teal : iTuTheme.inkFaint)
                        .frame(width: 28, height: 28)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .help("Set reminder")
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 46)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }

            Button(action: addTask) {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .bold))
                    Text("Add")
                        .font(.system(size: 13, weight: .semibold))
                }
            }
            .buttonStyle(iTuPrimaryButtonStyle(height: 38))
            .disabled(newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.55 : 1)
        }
        .padding(12)
        .iTuPanel(radius: 16)
    }

    // MARK: - Task Group Section

    private func taskGroupSection(
        title: String,
        tasks: [ProductivityTask],
        isExpanded: Binding<Bool>,
        onReorder: @escaping (String, String) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Group Header Button (Collapsible)
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.wrappedValue.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: isExpanded.wrappedValue ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(iTuTheme.inkFaint)

                    Text(title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)

                    Text("\(tasks.count)")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)

                    Spacer()
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 4)

            // Group List Content
            if isExpanded.wrappedValue {
                if tasks.isEmpty {
                    VStack(spacing: 8) {
                        Text("No tasks in \(title.lowercased())")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
                    .iTuPanel(radius: 14)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(tasks.enumerated()), id: \.element.id) { index, task in
                            TaskRow(task: task, onEdit: { editingTask = task })
                                .onDrag {
                                    guard model.sortOption == .manual else { return NSItemProvider() }
                                    draggedTaskId = task.id
                                    return NSItemProvider(object: task.id as NSString)
                                }
                                .onDrop(of: [UTType.text], isTargeted: nil) { providers in
                                    guard model.sortOption == .manual,
                                          let draggedTaskId,
                                          draggedTaskId != task.id
                                    else { return false }
                                    onReorder(draggedTaskId, task.id)
                                    self.draggedTaskId = nil
                                    return true
                                }

                            if index < tasks.count - 1 {
                                Rectangle()
                                    .fill(iTuTheme.borderSoft)
                                    .frame(height: 1)
                                    .padding(.leading, 48)
                            }
                        }
                    }
                    .iTuPanel(radius: 14)
                }
            }
        }
    }

    private func addTask() {
        let title = newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        newTaskTitle = ""
        Task {
            let task = await model.createTask(
                title: title,
                priority: priority,
                dueAt: section == .today ? todayDueDate() : nil,
                taskListId: taskListId
            )
            if hasReminder, let task {
                await model.createTaskReminder(
                    taskId: task.id,
                    remindAt: ISO8601DateFormatter().string(from: reminderDate)
                )
            }
            hasReminder = false
            reminderDate = Date().addingTimeInterval(3600)
        }
    }

    private func todayDueDate() -> String {
        var components = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        components.hour = 18
        let date = Calendar.current.date(from: components) ?? Date()
        return ISO8601DateFormatter().string(from: date)
    }

    private func priorityLabel(_ value: TaskPriority) -> String {
        switch value {
        case .none: "No priority"
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        }
    }

    private func priorityIcon(_ value: TaskPriority) -> String {
        value == .none ? "flag" : "flag.fill"
    }

    private func priorityColor(_ value: TaskPriority) -> Color {
        switch value {
        case .none: iTuTheme.inkFaint
        case .low: iTuTheme.teal
        case .medium: iTuTheme.amber
        case .high: iTuTheme.coral
        }
    }
}

// MARK: - Task Row with Processing Status & Full Context Menu

private struct TaskRow: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let onEdit: () -> Void
    @State private var isHovered = false
    @State private var isStatusHovered = false
    @State private var showPopoverContext = false
    @State private var popoverScreenPoint: CGPoint = .zero
    @State private var popoverWindowPoint: CGPoint?

    var body: some View {
        HStack(spacing: 12) {
            // Status Button cycling: Planned -> In Progress (blue play icon!) -> Completed -> Planned
            Button {
                Task { await model.cycleTaskStatus(task) }
            } label: {
                ZStack {
                    Circle()
                        .fill(isStatusHovered ? iTuTheme.mintTint : Color.clear)
                    Circle()
                        .stroke(isStatusHovered ? iTuTheme.teal : Color.clear, lineWidth: 1.5)
                    statusButtonIcon
                    if isStatusHovered {
                        statusButtonPreview
                    }
                }
                .frame(width: 30, height: 30)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(width: 30, height: 30)
            .contentShape(Rectangle())
            .scaleEffect(isStatusHovered ? 1.06 : 1.0)
            .animation(.easeOut(duration: 0.12), value: isStatusHovered)
            .onHover { hovering in
                isStatusHovered = hovering
            }
            .zIndex(1)
            .pointingHandCursor()
            .help("Status: \(task.status.displayName) → \(nextStatus.displayName)")
            .accessibilityLabel("Status: \(task.status.displayName). Change to \(nextStatus.displayName)")

            VStack(alignment: .leading, spacing: 5) {
                    Text(task.title)
                        .font(.system(size: 14, weight: .semibold))
                        .strikethrough(task.status == .completed)
                        .foregroundStyle(task.status == .completed ? iTuTheme.inkFaint : iTuTheme.ink)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    WrappingHStack(horizontalSpacing: 6, verticalSpacing: 5) {
                        if let dueAt = task.dueAt {
                            TaskChip(
                                title: formattedDueDate(dueAt),
                                systemImage: "calendar",
                                foreground: dueColor(dueAt),
                                background: dueBackground(dueAt)
                            )
                        }

                        if let reminder = task.reminders?.first(where: { $0.status == "SCHEDULED" || $0.status == "SNOOZED" }) {
                            TaskChip(
                                title: formattedDate(reminder.remindAt),
                                systemImage: "bell.fill",
                                foreground: iTuTheme.teal,
                                background: iTuTheme.mintTint
                            )
                        }

                        if let scheduledStartAt = task.scheduledStartAt {
                            TaskChip(
                                title: formattedDate(scheduledStartAt),
                                systemImage: "calendar.badge.clock",
                                foreground: iTuTheme.amber,
                                background: iTuTheme.amberTint
                            )
                        }

                        // Priority Badge inline
                        if task.priority != .none {
                            TaskChip(
                                title: priorityLabel(task.priority),
                                systemImage: "flag.fill",
                                foreground: priorityColor,
                                background: priorityBackground
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

                    if !task.descriptionMarkdown.isEmpty {
                        Text(task.descriptionMarkdown)
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.inkDim)
                            .lineLimit(1)
                    }
            }
            .help("Open task details")
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)

            Spacer(minLength: 0)

            // Edit Action Menu Button presenting custom web context popover
            Button {
                popoverScreenPoint = NSEvent.mouseLocation
                popoverWindowPoint = nil
                showPopoverContext.toggle()
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkFaint)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointingHandCursor()
            .help("Task Actions")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(isHovered ? iTuTheme.surface : Color.clear)
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isHovered ? iTuTheme.border : Color.clear, lineWidth: 1)
                RightClickDetector {
                    popoverWindowPoint = $0
                    showPopoverContext = true
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        )
        .shadow(
            color: iTuTheme.forest.opacity(isHovered ? 0.10 : 0),
            radius: isHovered ? 6 : 0,
            y: isHovered ? 3 : 0
        )
        .animation(.easeOut(duration: 0.15), value: isHovered)
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
        .background {
            PointerAnchoredPopover(
                isPresented: $showPopoverContext,
                screenPoint: popoverScreenPoint,
                windowPoint: popoverWindowPoint,
                onDismiss: { showPopoverContext = false }
            ) {
                TaskContextMenuPopoverView(
                    task: task,
                    onDismiss: { showPopoverContext = false },
                    onOpenDetail: onEdit
                )
                .environment(model)
            }
            .frame(width: 0, height: 0)
            .allowsHitTesting(false)
        }
        .onHover { hovering in
            isHovered = hovering
        }
        .pointingHandCursor()
    }

    // MARK: - Status Icon Rendering (Including Processing / In Progress Status)

    private var nextStatus: TaskStatus {
        switch task.status {
        case .inbox, .planned: .inProgress
        case .inProgress: .completed
        case .completed, .canceled, .archived: .planned
        }
    }

    @ViewBuilder
    private var statusButtonPreview: some View {
        switch nextStatus {
        case .inProgress:
            Image(systemName: "play.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(iTuTheme.teal)
                .opacity(0.9)
        case .completed:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(iTuTheme.mint)
                .opacity(0.9)
        case .planned, .inbox:
            Circle()
                .stroke(iTuTheme.teal.opacity(0.85), lineWidth: 2)
                .frame(width: 20, height: 20)
                .opacity(0.9)
        case .canceled, .archived:
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 22))
                .foregroundStyle(iTuTheme.coral)
                .opacity(0.9)
        }
    }

    @ViewBuilder
    private var statusButtonIcon: some View {
        switch task.status {
        case .inProgress:
            // Processing status: Blue/teal play circle icon matching Web App
            Image(systemName: "play.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(iTuTheme.teal)
                .frame(width: 26, height: 26)

        case .completed:
            // Completed status: Mint green checkmark circle
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(iTuTheme.mint)
                .frame(width: 26, height: 26)

        case .canceled:
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 22))
                .foregroundStyle(iTuTheme.coral)
                .frame(width: 26, height: 26)

        case .archived:
            Image(systemName: "archivebox.circle.fill")
                .font(.system(size: 22))
                .foregroundStyle(iTuTheme.inkFaint)
                .frame(width: 26, height: 26)

        case .inbox, .planned:
            // Empty circle for planned/inbox
            Circle()
                .stroke(iTuTheme.inkFaint.opacity(0.55), lineWidth: 1.5)
                .frame(width: 22, height: 22)
        }
    }

    private var showsMetadata: Bool {
        task.priority != .none || task.important || task.dueAt != nil || task.estimatedMinutes != nil
    }

    private var priorityColor: Color {
        switch task.priority {
        case .none, .low: iTuTheme.teal
        case .medium: iTuTheme.amber
        case .high: iTuTheme.coral
        }
    }

    private var priorityBackground: Color {
        switch task.priority {
        case .none, .low: iTuTheme.mintTint
        case .medium: iTuTheme.amberTint
        case .high: iTuTheme.coralTint
        }
    }

    private func priorityLabel(_ priority: TaskPriority) -> String {
        switch priority {
        case .high: "high"
        case .medium: "medium"
        case .low: "low"
        case .none: ""
        }
    }

    private func dueColor(_ value: String) -> Color {
        isOverdue(value) ? iTuTheme.coral : iTuTheme.teal
    }

    private func dueBackground(_ value: String) -> Color {
        isOverdue(value) ? iTuTheme.coralTint : iTuTheme.mintTint
    }

    private func isOverdue(_ value: String) -> Bool {
        guard let date = parseDate(value) else { return false }
        return date < Date() && !Calendar.current.isDateInToday(date)
    }

    private func formattedDueDate(_ value: String) -> String {
        guard task.status == .completed || task.status == .canceled else {
            return formattedDate(value)
        }

        guard let date = parseDate(value) else { return value }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "dd MMM"
        return formatter.string(from: date)
    }

    // Robust Date Formatter handling ISO8601 with/without fractional seconds
    private func formattedDate(_ value: String) -> String {
        guard let date = parseDate(value) else { return value }
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
}

struct WrappingHStack: Layout {
    var horizontalSpacing: CGFloat = 6
    var verticalSpacing: CGFloat = 6

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let availableWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var measuredWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            let candidateWidth = x == 0 ? size.width : x + horizontalSpacing + size.width
            if x > 0, candidateWidth > availableWidth {
                measuredWidth = max(measuredWidth, x)
                y += rowHeight + verticalSpacing
                x = size.width
                rowHeight = size.height
            } else {
                x = candidateWidth
                rowHeight = max(rowHeight, size.height)
            }
        }

        measuredWidth = max(measuredWidth, x)
        return CGSize(
            width: availableWidth.isFinite ? availableWidth : measuredWidth,
            height: y + rowHeight
        )
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            let candidateX = x == bounds.minX ? x : x + horizontalSpacing
            if x > bounds.minX, candidateX + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + verticalSpacing
                rowHeight = 0
            } else {
                x = candidateX
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width
            rowHeight = max(rowHeight, size.height)
        }
    }
}

private struct TaskChip: View {
    let title: String
    let systemImage: String
    let foreground: Color
    let background: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(background)
            .clipShape(Capsule())
            .overlay {
                Capsule()
                    .stroke(foreground.opacity(0.2), lineWidth: 1)
            }
            .fixedSize()
    }
}

// MARK: - Growth Reward Summary (Matching the web task list and task editor)

struct GrowthRewardSummaryView: View {
    let rule: GrowthEarningRuleDTO?
    var compact = false
    var dense = false
    var archivedSkillIDs: Set<String> = []

    private var rewardCount: Int {
        let xpCount = xpGroups.count
        let itemCount = rule?.itemAwards.filter { $0.quantity > 0 }.count ?? 0
        return xpCount + itemCount + ((rule?.accountXp ?? 0) > 0 ? 1 : 0) + ((rule?.coinReward ?? 0) > 0 ? 1 : 0)
    }

    private var xpGroups: [(amount: Int, awards: [GrowthEarningRuleSkillAwardDTO])] {
        guard let rule else { return [] }
        let selected = GrowthRewardMath.selectedAwards(rule.skillAwards, archivedSkillIDs: archivedSkillIDs)
        let allocations = GrowthRewardMath.split(
            accountXp: rule.accountXp,
            awards: selected,
            archivedSkillIDs: archivedSkillIDs
        )
        let groups = Dictionary(grouping: zip(selected, allocations).filter { $0.1 > 0 }, by: { $0.1 })
        return groups
            .map { (amount: $0.key, awards: $0.value.map { $0.0 }) }
            .sorted { $0.amount > $1.amount }
    }

    var body: some View {
        if compact {
            rewardChips
        } else {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("Growth rewards", systemImage: "gift.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color(hex: 0x7C3AED))
                    Spacer()
                    Text(rewardCount == 0 ? "No rewards" : "On completion")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                if rewardCount == 0 {
                    Text("No Growth rewards configured for this task.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    rewardChips
                }
            }
            .padding(16)
            .iTuPanel(radius: 14)
        }
    }

    @ViewBuilder
    private var rewardChips: some View {
        if rewardCount > 0 {
            Group {
                if let accountXp = rule?.accountXp, accountXp > 0 {
                    GrowthAccountRewardChipView(amount: accountXp, dense: dense)
                }
                ForEach(Array(xpGroups.enumerated()), id: \.offset) { _, group in
                    GrowthRewardChipView(
                        xpAmount: group.amount,
                        weights: group.awards.map(\.xpReward),
                        showsMultiSkillStack: group.awards.count > 1,
                        dense: dense
                    )
                }
                if let coinReward = rule?.coinReward, coinReward > 0 {
                    GrowthCoinRewardChipView(amount: coinReward, dense: dense)
                }
                ForEach(rule?.itemAwards.filter { $0.quantity > 0 } ?? [], id: \.itemId) { award in
                    GrowthItemRewardChipView(award: award)
                }
            }
        }
    }
}

private struct GrowthAccountRewardChipView: View {
    let amount: Int
    var dense = false

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "person.crop.circle.badge.plus")
                .font(.system(size: 10, weight: .bold))
            Text(dense ? "+\(amount) XP" : "+\(amount) Account XP")
        }
        .font(.system(size: 10, weight: .bold, design: .monospaced))
        .foregroundStyle(iTuTheme.teal)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(iTuTheme.mintTint)
        .clipShape(Capsule())
        .accessibilityLabel("Earn \(amount) Account XP")
    }
}

// MARK: - Growth Reward Chip View (Matching Web .itu-reward-chip__mark & .itu-reward-chip.is-xp 100%)

private struct GrowthRewardChipView: View {
    let xpAmount: Int
    let weights: [Int]
    var showsMultiSkillStack: Bool = false
    var dense = false

    var body: some View {
        HStack(spacing: 5) {
            // Overlapping circular marks stack matching Web .itu-reward-chip__mark
            HStack(spacing: -5) {
                // Circle 1: Dark teal with sparkles icon
                ZStack {
                    Circle()
                        .fill(Color(hex: 0x0D9488))
                    Image(systemName: "sparkles")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(.white)
                }
                .frame(width: 19, height: 19)
                .overlay(Circle().stroke(iTuTheme.surface, lineWidth: 1.5))

                // Circle 2 (multi-skill): Violet with brain icon
                if showsMultiSkillStack {
                    ZStack {
                        Circle()
                            .fill(Color(hex: 0x8B5CF6))
                        Image(systemName: "brain.head.profile")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 19, height: 19)
                    .overlay(Circle().stroke(iTuTheme.surface, lineWidth: 1.5))
                }
            }

            Text(dense ? "+\(xpAmount)" : "+\(xpAmount) Skill XP")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(Color(hex: 0x0D5C4D))
        }
        .padding(.leading, showsMultiSkillStack ? 3 : 4)
        .padding(.trailing, 9)
        .frame(height: 26)
        .background(Color(hex: 0xECFDF5))
        .clipShape(Capsule())
        .overlay {
            Capsule()
                .stroke(Color(hex: 0xA7F3D0), lineWidth: 1)
        }
        .accessibilityLabel("Earn \(xpAmount) Skill XP")
    }
}

private struct GrowthCoinRewardChipView: View {
    let amount: Int
    var dense = false

    var body: some View {
        TaskChip(
            title: dense ? "+\(amount)" : "+\(amount) Coins",
            systemImage: "circle.hexagongrid.fill",
            foreground: Color(hex: 0xA16207),
            background: iTuTheme.amberTint
        )
        .accessibilityLabel("Earn \(amount) coins")
    }
}

private struct GrowthItemRewardChipView: View {
    let award: GrowthEarningRuleItemDTO

    var body: some View {
        TaskChip(
            title: "×\(award.quantity) \(award.item?.name ?? "Item")",
            systemImage: "gift.fill",
            foreground: Color(hex: 0x7C3AED),
            background: Color(hex: 0xF3E8FF)
        )
    }
}

// MARK: - Custom Floating Task Context Menu Popover (Matching Web TaskContextMenu.tsx 100%)

struct TaskContextMenuPopoverView: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let onDismiss: () -> Void
    let onOpenDetail: () -> Void

    @State private var showsDatePickerPopover = false
    @State private var customDueDate: Date = Date()
    @State private var customHasDate = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // STATUS Section
            VStack(alignment: .leading, spacing: 6) {
                Text("STATUS")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)

                HStack(spacing: 5) {
                    statusPill("Plan", icon: "circle", isSelected: task.status == .planned || task.status == .inbox, activeBg: iTuTheme.mintTint, activeColor: iTuTheme.teal) {
                        setStatus(.planned)
                    }
                    statusPill("Active", icon: "play.circle", isSelected: task.status == .inProgress, activeBg: Color(hex: 0xDBEAFE), activeColor: Color(hex: 0x2563EB)) {
                        setStatus(.inProgress)
                    }
                    statusPill("Done", icon: "checkmark.circle", isSelected: task.status == .completed, activeBg: Color(hex: 0xD1FAE5), activeColor: Color(hex: 0x059669)) {
                        setStatus(.completed)
                    }
                    statusPill("Cancel", icon: "xmark.circle", isSelected: task.status == .canceled, activeBg: Color(hex: 0xF3F4F6), activeColor: Color(hex: 0x6B7280)) {
                        setStatus(.canceled)
                    }
                }
            }

            // DATE Section
            VStack(alignment: .leading, spacing: 6) {
                Text("DATE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)

                HStack(spacing: 5) {
                    dateIconButton(icon: "sun.max.fill", color: Color(hex: 0xD97706), bg: Color(hex: 0xFEF3C7), help: "Today") {
                        setDueDate(todayDate())
                    }
                    dateIconButton(icon: "sunrise.fill", color: Color(hex: 0xEA580C), bg: Color(hex: 0xFFEDD5), help: "Tomorrow") {
                        setDueDate(tomorrowDate())
                    }
                    dateIconButton(icon: "calendar.badge.clock", color: Color(hex: 0x2563EB), bg: Color(hex: 0xDBEAFE), help: "Next Week") {
                        setDueDate(nextWeekDate())
                    }
                    dateIconButton(
                        icon: "calendar",
                        color: task.dueAt != nil ? iTuTheme.teal : iTuTheme.inkDim,
                        bg: task.dueAt != nil ? iTuTheme.mintTint : iTuTheme.surfaceMuted,
                        help: "Custom Date"
                    ) {
                        customDueDate = initialCustomDate
                        customHasDate = task.dueAt != nil
                        showsDatePickerPopover.toggle()
                    }
                    .popover(isPresented: $showsDatePickerPopover, arrowEdge: .bottom) {
                        TaskDueDatePickerView(
                            date: $customDueDate,
                            hasDate: $customHasDate,
                            onDone: {
                                setDueDate(customHasDate ? ISO8601DateFormatter().string(from: customDueDate) : nil)
                                showsDatePickerPopover = false
                            }
                        )
                    }

                    dateIconButton(
                        icon: "xmark.circle",
                        color: iTuTheme.inkFaint,
                        bg: iTuTheme.surfaceMuted,
                        help: "Clear Date",
                        isDisabled: task.dueAt == nil
                    ) {
                        setDueDate(nil)
                    }
                }
            }

            // PRIORITY Section
            VStack(alignment: .leading, spacing: 6) {
                Text("PRIORITY")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)

                HStack(spacing: 5) {
                    priorityPill("High", icon: "flag.fill", isSelected: task.priority == .high, color: Color(hex: 0xF43F5E), bg: Color(hex: 0xFFE4E6)) {
                        setPriority(.high)
                    }
                    priorityPill("Med", icon: "flag.fill", isSelected: task.priority == .medium, color: Color(hex: 0xF59E0B), bg: Color(hex: 0xFEF3C7)) {
                        setPriority(.medium)
                    }
                    priorityPill("Low", icon: "flag.fill", isSelected: task.priority == .low, color: Color(hex: 0x3B82F6), bg: Color(hex: 0xDBEAFE)) {
                        setPriority(.low)
                    }
                    priorityPill("None", icon: "flag", isSelected: task.priority == .none, color: iTuTheme.teal, bg: iTuTheme.mintTint) {
                        setPriority(.none)
                    }
                }
            }

            // LIST Section (Move to List)
            VStack(alignment: .leading, spacing: 6) {
                Text("LIST")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)

                if model.taskLists.isEmpty {
                    Text("No task lists available.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 5) {
                            listPill("Inbox", icon: "tray", isSelected: task.taskListId == nil) {
                                moveToList(nil)
                            }
                            ForEach(model.taskLists) { list in
                                listPill(list.name, icon: list.icon ?? "list.bullet", isSelected: task.taskListId == list.id) {
                                    moveToList(list.id)
                                }
                            }
                        }
                    }
                }
            }

            Rectangle()
                .fill(iTuTheme.border)
                .frame(height: 1)

            // ACTIONS List
            VStack(alignment: .leading, spacing: 2) {
                Button {
                    onDismiss()
                    Task { await model.prepareFocus(for: task) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.teal)
                        Text("Start Focus")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.ink)
                        Spacer()
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(task.status == .completed || task.status == .canceled || task.status == .archived)
                .pointingHandCursor()

                Button {
                    onDismiss()
                    onOpenDetail()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.turn.down.right")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("Open Details")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.ink)
                        Spacer()
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointingHandCursor()

                Button {
                    Task { await model.deleteTask(task) }
                    onDismiss()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "trash")
                            .font(.system(size: 12))
                            .foregroundStyle(Color(hex: 0xE11D48))
                        Text("Move to Trash")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color(hex: 0xE11D48))
                        Spacer()
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
            }
        }
        .padding(14)
        .frame(width: 320)
        .background(iTuTheme.surface)
    }

    private var initialCustomDate: Date {
        if let dueAt = task.dueAt, let date = parseISO8601Date(dueAt) {
            return date
        }
        return Date()
    }

    private func parseISO8601Date(_ dateStr: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: dateStr) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: dateStr)
    }

    private func setStatus(_ status: TaskStatus) {
        Task { await model.setTaskStatus(task, status: status) }
        onDismiss()
    }

    private func setPriority(_ priority: TaskPriority) {
        let edits = TaskEdits(
            title: task.title,
            descriptionMarkdown: task.descriptionMarkdown,
            priority: priority,
            important: task.important,
            dueAt: task.dueAt,
            estimatedMinutes: task.estimatedMinutes
        )
        Task { await model.editTask(task, edits: edits) }
        onDismiss()
    }

    private func setDueDate(_ dueAt: String?) {
        let edits = TaskEdits(
            title: task.title,
            descriptionMarkdown: task.descriptionMarkdown,
            priority: task.priority,
            important: task.important,
            dueAt: dueAt,
            estimatedMinutes: task.estimatedMinutes
        )
        Task { await model.editTask(task, edits: edits) }
        onDismiss()
    }

    private func moveToList(_ listId: String?) {
        Task { await model.moveTaskToList(task, listId: listId) }
        onDismiss()
    }

    private func setReminder(_ remindAt: String) async {
        await model.createTaskReminder(taskId: task.id, remindAt: remindAt)
        onDismiss()
    }

    private func todayDate() -> String {
        var comp = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        comp.hour = 18
        return ISO8601DateFormatter().string(from: Calendar.current.date(from: comp) ?? Date())
    }

    private func tomorrowDate() -> String {
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        var comp = Calendar.current.dateComponents([.year, .month, .day], from: tomorrow)
        comp.hour = 9
        return ISO8601DateFormatter().string(from: Calendar.current.date(from: comp) ?? tomorrow)
    }

    private func nextWeekDate() -> String {
        let nextWeek = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
        var comp = Calendar.current.dateComponents([.year, .month, .day], from: nextWeek)
        comp.hour = 9
        return ISO8601DateFormatter().string(from: Calendar.current.date(from: comp) ?? nextWeek)
    }

    @ViewBuilder
    private func statusPill(_ label: String, icon: String, isSelected: Bool, activeBg: Color, activeColor: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? activeColor : iTuTheme.inkDim)
            .padding(.horizontal, 5)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(isSelected ? activeBg : iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(isSelected ? activeColor.opacity(0.4) : iTuTheme.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }

    @ViewBuilder
    private func dateIconButton(icon: String, color: Color, bg: Color, help: String, isDisabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(isDisabled ? iTuTheme.inkFaint.opacity(0.4) : color)
                .frame(maxWidth: .infinity, minHeight: 32)
                .background(isDisabled ? iTuTheme.surfaceMuted.opacity(0.5) : bg)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .pointingHandCursor()
        .help(help)
    }

    @ViewBuilder
    private func priorityPill(_ label: String, icon: String, isSelected: Bool, color: Color, bg: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? color : iTuTheme.inkDim)
            .padding(.horizontal, 5)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(isSelected ? bg : iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(isSelected ? color.opacity(0.4) : iTuTheme.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }

    @ViewBuilder
    private func listPill(_ label: String, icon: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(isSelected ? iTuTheme.mintTint : iTuTheme.surfaceMuted)
            .clipShape(Capsule())
            .overlay {
                Capsule()
                    .stroke(isSelected ? iTuTheme.teal.opacity(0.4) : iTuTheme.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }
}

// MARK: - Right-Click Interceptor Component

struct RightClickDetector: NSViewRepresentable {
    let onRightClick: (CGPoint) -> Void

    func makeNSView(context: Context) -> RightClickHostingView {
        let view = RightClickHostingView()
        view.onRightClick = onRightClick
        view.startMonitoring()
        return view
    }

    func updateNSView(_ nsView: RightClickHostingView, context: Context) {
        nsView.onRightClick = onRightClick
    }

    static func dismantleNSView(_ nsView: RightClickHostingView, coordinator: ()) {
        nsView.stopMonitoring()
    }
}

final class RightClickHostingView: NSView {
    var onRightClick: ((CGPoint) -> Void)?
    private var eventMonitor: Any?

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil {
            stopMonitoring()
        } else {
            startMonitoring()
        }
    }

    func startMonitoring() {
        guard eventMonitor == nil else { return }
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .rightMouseDown) { [weak self] event in
            guard let self, let window, event.window === window else { return event }
            let point = convert(event.locationInWindow, from: nil)
            guard bounds.contains(point) else { return event }
            onRightClick?(event.locationInWindow)
            return event
        }
    }

    func stopMonitoring() {
        guard let eventMonitor else { return }
        NSEvent.removeMonitor(eventMonitor)
        self.eventMonitor = nil
    }

}

struct PointerAnchoredPopover<Content: View>: NSViewRepresentable {
    @Binding var isPresented: Bool
    let screenPoint: CGPoint
    let windowPoint: CGPoint?
    let onDismiss: () -> Void
    @ViewBuilder let content: () -> Content

    func makeCoordinator() -> Coordinator {
        Coordinator(onDismiss: onDismiss)
    }

    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        view.isHidden = true
        context.coordinator.hostView = view
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        context.coordinator.onDismiss = onDismiss
        context.coordinator.update(
            isPresented: isPresented,
            screenPoint: screenPoint,
            windowPoint: windowPoint,
            content: content
        )
    }

    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        coordinator.close()
    }

    @MainActor
    final class Coordinator: NSObject, NSPopoverDelegate {
        weak var hostView: NSView?
        var onDismiss: () -> Void
        private var popover: NSPopover?
        private var lastPresentedPoint: CGPoint?
        private var lastPresentedWindowPoint: CGPoint?

        init(onDismiss: @escaping () -> Void) {
            self.onDismiss = onDismiss
        }

        func update<PopoverContent: View>(
            isPresented: Bool,
            screenPoint: CGPoint,
            windowPoint: CGPoint?,
            content: () -> PopoverContent
        ) {
            guard isPresented else {
                close()
                return
            }

            guard let hostView, let contentView = hostView.window?.contentView else { return }

            if let popover, popover.isShown {
                if lastPresentedPoint != screenPoint || lastPresentedWindowPoint != windowPoint {
                    close()
                } else {
                    return
                }
            }

            let hostingController = NSHostingController(rootView: content())
            let nextPopover = NSPopover()
            nextPopover.behavior = .transient
            nextPopover.delegate = self
            nextPopover.contentViewController = hostingController
            nextPopover.contentSize = NSSize(width: 320, height: 300)
            popover = nextPopover
            lastPresentedPoint = screenPoint
            lastPresentedWindowPoint = windowPoint

            let anchorWindowPoint = windowPoint ?? hostView.window?.convertPoint(fromScreen: screenPoint) ?? .zero
            let anchorPoint = contentView.convert(anchorWindowPoint, from: nil)
            nextPopover.show(
                relativeTo: pointerPopoverAnchorRect(at: anchorPoint),
                of: contentView,
                preferredEdge: .maxY
            )
        }

        func close() {
            popover?.performClose(nil)
            popover = nil
            lastPresentedPoint = nil
            lastPresentedWindowPoint = nil
        }

        func popoverDidClose(_ notification: Notification) {
            popover = nil
            lastPresentedPoint = nil
            lastPresentedWindowPoint = nil
            onDismiss()
        }
    }
}

func pointerPopoverAnchorRect(at point: NSPoint) -> NSRect {
    NSRect(origin: point, size: NSSize(width: 1, height: 1))
}
