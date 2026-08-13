import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct TaskListView: View {
    @Environment(AppModel.self) private var model
    let section: AppSection
    var filterQuery: String = ""
    var taskListId: String? = nil

    @State private var newTaskTitle = ""
    @State private var groupExpandedStates: [String: Bool] = [:]
    @State private var draggedTaskId: String?

    private var planningViewKey: PlanningViewKey {
        switch section {
        case .today: return .today
        case .upcoming: return .upcoming
        case .inbox: return .inbox
        default: return .all
        }
    }

    var body: some View {
        let settings = model.settingsStore.planningSettings(for: planningViewKey)
        let archivedSkillIDs = Set(model.skills.filter { $0.archivedAt != nil }.map(\.id))

        let allSectionTasks = model.planningTasks(for: section, filterQuery: filterQuery, taskListId: taskListId)
        let pendingSectionTasks: [ProductivityTask]
        let overdueTasks: [ProductivityTask]

        if section == .today {
            let startOfToday = Calendar.current.startOfDay(for: Date())
            overdueTasks = allSectionTasks.filter { task in
                guard ![.completed, .canceled, .archived].contains(task.status),
                      let dateValue = task.scheduledStartAt ?? task.dueAt,
                      let date = iTuDateSupport.parse(dateValue) else {
                    return false
                }
                return date < startOfToday
            }
            let overdueIDs = Set(overdueTasks.map(\.id))
            pendingSectionTasks = allSectionTasks.filter { ![.completed, .canceled].contains($0.status) && !overdueIDs.contains($0.id) }
        } else {
            overdueTasks = []
            pendingSectionTasks = allSectionTasks.filter { ![.completed, .canceled].contains($0.status) }
        }

        let completedSectionTasks = allSectionTasks.filter { [.completed, .canceled].contains($0.status) }

        let activeGroups = PlanningTaskProjector.project(
            tasks: pendingSectionTasks,
            sections: model.sections,
            lists: model.taskLists,
            tags: model.tags,
            tagIdsByTaskID: model.tagIdsByTaskID,
            settings: settings
        )

        return ScrollView {
            VStack(spacing: 20) {
                // Quick Capture Bar matching Web Plan page
                if section != .completed {
                    quickCaptureBar
                }

                if overdueTasks.isEmpty && activeGroups.isEmpty && (completedSectionTasks.isEmpty || model.hideCompletedTasks) {
                    VStack(spacing: 8) {
                        Text("No tasks found")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
                    .iTuPanel(radius: 14)
                } else {
                    // Pinned Overdue Group for Today View
                    if !overdueTasks.isEmpty {
                        let groupId = "overdue-group"
                        taskGroupSection(
                            title: "Overdue",
                            tasks: PlanningTaskProjector.sort(overdueTasks, by: settings.sortMode),
                            archivedSkillIDs: archivedSkillIDs,
                            hideDetails: settings.hideDetails,
                            isExpanded: Binding(
                                get: { !settings.collapsedGroups.contains(groupId) },
                                set: { isExpanded in
                                    var updated = settings
                                    if isExpanded {
                                        updated.collapsedGroups.remove(groupId)
                                    } else {
                                        updated.collapsedGroups.insert(groupId)
                                    }
                                    model.settingsStore.updatePlanningSettings(for: planningViewKey, settings: updated)
                                }
                            ),
                            onReorder: { draggedId, beforeId in
                                let allIds = overdueTasks.map(\.id)
                                let ordered = reorderedVisibleIds(
                                    pending: allIds,
                                    completed: [],
                                    draggedId: draggedId,
                                    beforeId: beforeId
                                )
                                Task { await model.reorderTasks(ordered) }
                            }
                        )
                    }

                    // Active Tasks Groups
                    ForEach(activeGroups) { group in
                        let groupId = group.id
                        taskGroupSection(
                            title: group.title,
                            tasks: group.tasks,
                            archivedSkillIDs: archivedSkillIDs,
                            hideDetails: settings.hideDetails,
                            isExpanded: Binding(
                                get: { !settings.collapsedGroups.contains(groupId) },
                                set: { isExpanded in
                                    var updated = settings
                                    if isExpanded {
                                        updated.collapsedGroups.remove(groupId)
                                    } else {
                                        updated.collapsedGroups.insert(groupId)
                                    }
                                    model.settingsStore.updatePlanningSettings(for: planningViewKey, settings: updated)
                                }
                            ),
                            onReorder: { draggedId, beforeId in
                                let allIds = group.tasks.map(\.id)
                                let ordered = reorderedVisibleIds(
                                    pending: allIds,
                                    completed: [],
                                    draggedId: draggedId,
                                    beforeId: beforeId
                                )
                                Task { await model.reorderTasks(ordered) }
                            }
                        )
                    }

                    // Completed & Won't Do Group (Separated like Web version)
                    if !completedSectionTasks.isEmpty && !model.hideCompletedTasks {
                        let groupId = "completed-wont-do"
                        taskGroupSection(
                            title: "Completed & Won’t Do",
                            tasks: PlanningTaskProjector.sort(completedSectionTasks, by: settings.sortMode),
                            archivedSkillIDs: archivedSkillIDs,
                            hideDetails: settings.hideDetails,
                            isExpanded: Binding(
                                get: { !settings.collapsedGroups.contains(groupId) },
                                set: { isExpanded in
                                    var updated = settings
                                    if isExpanded {
                                        updated.collapsedGroups.remove(groupId)
                                    } else {
                                        updated.collapsedGroups.insert(groupId)
                                    }
                                    model.settingsStore.updatePlanningSettings(for: planningViewKey, settings: updated)
                                }
                            ),
                            onReorder: { draggedId, beforeId in
                                let allIds = completedSectionTasks.map(\.id)
                                let ordered = reorderedVisibleIds(
                                    pending: [],
                                    completed: allIds,
                                    draggedId: draggedId,
                                    beforeId: beforeId
                                )
                                Task { await model.reorderTasks(ordered) }
                            }
                        )
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(
            LinearGradient(
                colors: [iTuTheme.canvas, iTuTheme.mintTint.opacity(0.3)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }

    private func openTaskEditor(_ task: ProductivityTask) {
        model.presentedOverlay = .taskEditor(taskID: task.id)
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
        archivedSkillIDs: Set<String>,
        hideDetails: Bool,
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
                    LazyVStack(spacing: 0) {
                        ForEach(tasks) { task in
                            taskRow(task, archivedSkillIDs: archivedSkillIDs, hideDetails: hideDetails, onReorder: onReorder)

                            if task.id != tasks.last?.id {
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

    @ViewBuilder
    private func taskRow(
        _ task: ProductivityTask,
        archivedSkillIDs: Set<String>,
        hideDetails: Bool,
        onReorder: @escaping (String, String) -> Void
    ) -> some View {
        let row = TaskRow(
            task: task,
            growthRule: model.growthEarningRules[task.id],
            archivedSkillIDs: archivedSkillIDs,
            hideDetails: hideDetails,
            onEdit: { openTaskEditor(task) }
        )
        if model.sortOption == .manual {
            row
                .onDrag {
                    draggedTaskId = task.id
                    return NSItemProvider(object: task.id as NSString)
                }
                .onDrop(of: [UTType.text], isTargeted: nil) { _ in
                    guard let draggedTaskId, draggedTaskId != task.id else { return false }
                    onReorder(draggedTaskId, task.id)
                    self.draggedTaskId = nil
                    return true
                }
        } else {
            row
        }
    }

    private func addTask() {
        let title = newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        newTaskTitle = ""
        Task {
            await model.createTask(
                title: title,
                priority: .none,
                dueAt: section == .today ? todayDueDate() : nil,
                taskListId: taskListId
            )
        }
    }

    private func todayDueDate() -> String {
        let date = model.settingsStore.taskDefaults.dateByApplyingDefaultDueTime(to: Date())
        return ISO8601DateFormatter().string(from: date)
    }
}

// MARK: - Task Row with Processing Status & Full Context Menu

struct TaskRow: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    let growthRule: GrowthEarningRuleDTO?
    let archivedSkillIDs: Set<String>
    let hideDetails: Bool
    var onStatusAction: (() -> Void)? = nil
    var statusActionDescription: String? = nil
    let onEdit: () -> Void
    @State private var isHovered = false
    @State private var isStatusHovered = false

    var body: some View {
        HStack(spacing: 12) {
            // Status Button cycling: Planned -> In Progress (blue play icon!) -> Completed -> Planned
            Button {
                if let onStatusAction {
                    onStatusAction()
                } else {
                    Task { await model.cycleTaskStatus(task) }
                }
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
            .help(statusActionDescription ?? "Status: \(task.status.displayName) → \(nextStatus.displayName)")
            .accessibilityLabel("Status: \(task.status.displayName). \(statusActionDescription ?? "Change to \(nextStatus.displayName)")")

            VStack(alignment: .leading, spacing: 5) {
                    Text(task.title)
                        .font(.system(size: 14, weight: .semibold))
                        .strikethrough(task.status == .completed)
                        .foregroundStyle(task.status == .completed ? iTuTheme.inkFaint : iTuTheme.ink)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if !hideDetails {
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

                            if let growthRule {
                                GrowthRewardSummaryView(
                                    rule: growthRule,
                                    compact: true,
                                    dense: true,
                                    archivedSkillIDs: archivedSkillIDs
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
            }
            .help("Open task details")
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)

            // Edit Action Menu Button presenting the shared web context popover
            TaskActionMenuButton(task: task, onOpenDetails: onEdit)
                .layoutPriority(0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(isHovered ? iTuTheme.surface : Color.clear)
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isHovered ? iTuTheme.border : Color.clear, lineWidth: 1)
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
        .taskActionMenu(for: task, onOpenDetails: onEdit)
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
        return date.formatted(iTuDateSupport.dueDay)
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
        iTuDateSupport.parse(value)
    }
}

struct WrappingHStack: Layout {
    var horizontalSpacing: CGFloat = 6
    var verticalSpacing: CGFloat = 6

    struct Cache {
        var sizes: [CGSize]
    }

    func makeCache(subviews: Subviews) -> Cache {
        Cache(sizes: subviews.map { $0.sizeThatFits(.unspecified) })
    }

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout Cache
    ) -> CGSize {
        let availableWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var measuredWidth: CGFloat = 0

        for size in cache.sizes {
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
        cache: inout Cache
    ) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for (subview, size) in zip(subviews, cache.sizes) {
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
                        awards: group.awards,
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
    let awards: [GrowthEarningRuleSkillAwardDTO]
    var dense = false

    private var showsMultiSkillStack: Bool { awards.count > 1 }

    private static let chipColors: [UInt32] = [0x0D9488, 0x8B5CF6, 0x2563EB]

    var body: some View {
        HStack(spacing: 5) {
            // Overlapping circular marks stack matching Web .itu-reward-chip__mark
            HStack(spacing: -5) {
                let visibleAwards = Array(awards.prefix(showsMultiSkillStack ? 3 : 1))
                ForEach(Array(visibleAwards.enumerated()), id: \.offset) { index, award in
                    skillCircle(award: award, index: index)
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

    private func skillCircle(award: GrowthEarningRuleSkillAwardDTO, index: Int) -> some View {
        let bgColor = Color(hex: Self.chipColors[min(index, Self.chipColors.count - 1)])
        return ZStack {
            Circle()
                .fill(bgColor)
            GrowthIconView(icon: award.skill?.icon ?? "sparkles", size: 9, color: .white)
        }
        .frame(width: 19, height: 19)
        .overlay(Circle().stroke(iTuTheme.surface, lineWidth: 1.5))
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

// MARK: - Preview

#Preview("Growth Reward Chips") {
    let skill = { (id: String, name: String, icon: String?, archived: Bool) in
        GrowthSkillDTO(
            id: id, key: nil, name: name, level: 1, maxLevel: 5,
            currentXp: 0, nextLevelXp: 100,
            levelStartXp: nil, progressXp: nil, requiredXp: nil,
            category: nil, kind: "SKILL", description: nil,
            icon: icon, color: nil, baseXp: 100, version: 1,
            archivedAt: archived ? "2026-01-01" : nil
        )
    }
    let award = { (skillId: String, xp: Int, s: GrowthSkillDTO?) in
        GrowthEarningRuleSkillAwardDTO(skillId: skillId, xpReward: xp, skill: s)
    }
    let rule = { (id: String, awards: [GrowthEarningRuleSkillAwardDTO]) in
        GrowthEarningRuleDTO(
            id: id, sourceType: .task, sourceId: id, coinReward: 0,
            accountXp: 0, enabled: true, scalingMode: .fixed,
            maxRewardCap: nil, version: 1, skillAwards: awards, itemAwards: []
        )
    }

    VStack(alignment: .leading, spacing: 12) {
        // One reward
        GrowthRewardSummaryView(rule: rule("one", [
            award("dex", 30, skill("dex", "Dexterity", "TARGET", false))
        ]), compact: true, dense: true)

        // Three rewards
        GrowthRewardSummaryView(rule: rule("three", [
            award("dex", 30, skill("dex", "Dexterity", "TARGET", false)),
            award("res", 30, skill("res", "Resilience", "SHIELD", false)),
            award("str", 40, skill("str", "Strength", "DUMBBELL", false))
        ]), compact: true, dense: true)

        // Duplicated XP amounts
        GrowthRewardSummaryView(rule: rule("dup", [
            award("a", 30, skill("a", "Alpha", "STAR", false)),
            award("b", 30, skill("b", "Beta", "ZAP", false))
        ]), compact: true, dense: true)

        // Missing icon metadata -> deterministic sparkles fallback
        GrowthRewardSummaryView(rule: rule("missing", [
            award("m", 30, nil)
        ]), compact: true, dense: true)

        // Archived skill excluded from the chip
        GrowthRewardSummaryView(
            rule: rule("archived", [
                award("arch", 30, skill("arch", "Archived", "BRAIN", true))
            ]),
            compact: true, dense: true,
            archivedSkillIDs: ["arch"]
        )
    }
    .padding(20)
    .frame(width: 420)
}
