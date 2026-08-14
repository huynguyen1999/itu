import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct TaskListView: View {
    @Environment(AppModel.self) private var model
    let section: AppSection
    var filterQuery: String = ""
    var taskListId: String? = nil

    @State private var newTaskTitle = ""
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
        let _ = AppPerformanceSignposts.emitTaskListBody()
        let settings = model.settingsStore.planningSettings(for: planningViewKey)
        let projection = model.planningRenderProjection(for: section, filterQuery: filterQuery, taskListId: taskListId, settings: settings)
        let items = PlanningTaskProjector.flatten(projection, collapsedGroups: settings.collapsedGroups)
        let isEmpty = projection.overdueTasks.isEmpty
            && projection.activeGroups.isEmpty
            && (projection.completedTasks.isEmpty || model.hideCompletedTasks)

        return ScrollView {
            LazyVStack(spacing: 0) {
                if section != .completed {
                    quickCaptureBar
                        .padding(.bottom, 20)
                }

                if isEmpty {
                    VStack(spacing: 8) {
                        Text("No tasks found")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
                    .iTuPanel(radius: 14)
                    .padding(.bottom, 20)
                } else {
                    ForEach(items) { item in
                        planningListItemView(item, settings: settings, projection: projection)
                    }
                }

                if model.hasMoreTaskPages {
                    taskPageFooter
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

    @ViewBuilder
    private func planningListItemView(
        _ item: PlanningListItem,
        settings: PlanningViewSettings,
        projection: PlanningRenderProjection
    ) -> some View {
        switch item {
        case let .groupHeader(header):
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    var updated = settings
                    if header.isExpanded {
                        updated.collapsedGroups.insert(header.id)
                    } else {
                        updated.collapsedGroups.remove(header.id)
                    }
                    model.settingsStore.updatePlanningSettings(for: planningViewKey, settings: updated)
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: header.isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(iTuTheme.inkFaint)
                    Text(header.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("\(header.count)")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 4)
            .padding(.bottom, header.isExpanded ? 10 : 20)

        case let .emptyGroup(empty):
            VStack(spacing: 8) {
                Text("No tasks in \(empty.title.lowercased())")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
            .iTuPanel(radius: 14)
            .padding(.bottom, 20)

        case let .task(item):
            let row = TaskRow(
                task: item.task,
                presentation: item.presentation,
                rowPosition: item.position,
                onStatusAction: {
                    Task {
                        guard let task = model.tasks.first(where: { $0.id == item.task.id }) else { return }
                        await model.cycleTaskStatus(task)
                    }
                },
                onEdit: { openTaskEditor(item.task) }
            )
            if settings.sortMode == .manual {
                row
                    .onDrag {
                        draggedTaskId = item.task.id
                        return NSItemProvider(object: item.task.id as NSString)
                    }
                    .onDrop(of: [UTType.text], isTargeted: nil) { _ in
                        guard let draggedTaskId, draggedTaskId != item.task.id else { return false }
                        reorderTask(
                            draggedTaskId: draggedTaskId,
                            beforeTaskId: item.task.id,
                            groupID: item.groupID,
                            projection: projection
                        )
                        self.draggedTaskId = nil
                        return true
                    }
            } else {
                row
            }
        }
    }

    private func reorderTask(
        draggedTaskId: String,
        beforeTaskId: String,
        groupID: String,
        projection: PlanningRenderProjection
    ) {
        let tasks: [ProductivityTask]
        switch groupID {
        case "overdue-group": tasks = projection.overdueTasks
        case "completed-wont-do": tasks = projection.completedTasks
        default: tasks = projection.activeGroups.first(where: { $0.id == groupID })?.tasks ?? []
        }
        let ordered = reorderedVisibleIds(
            pending: groupID == "completed-wont-do" ? [] : tasks.map(\.id),
            completed: groupID == "completed-wont-do" ? tasks.map(\.id) : [],
            draggedId: draggedTaskId,
            beforeId: beforeTaskId
        )
        Task { await model.reorderTasks(ordered) }
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

    private var taskPageFooter: some View {
        HStack {
            if model.isLoadingMoreTasks {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 32)
        .onAppear {
            Task { await model.loadMoreTasks() }
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
    let task: ProductivityTask
    let presentation: TaskRowPresentation
    let rowPosition: PlanningRowPosition
    var onStatusAction: (() -> Void)? = nil
    var statusActionDescription: String? = nil
    let onEdit: () -> Void

    init(
        task: ProductivityTask,
        presentation: TaskRowPresentation,
        rowPosition: PlanningRowPosition = .only,
        onStatusAction: (() -> Void)? = nil,
        statusActionDescription: String? = nil,
        onEdit: @escaping () -> Void
    ) {
        self.task = task
        self.presentation = presentation
        self.rowPosition = rowPosition
        self.onStatusAction = onStatusAction
        self.statusActionDescription = statusActionDescription
        self.onEdit = onEdit
    }

    init(
        task: ProductivityTask,
        growthRule: GrowthEarningRuleDTO?,
        archivedSkillIDs: Set<String>,
        hideDetails: Bool,
        onStatusAction: (() -> Void)? = nil,
        statusActionDescription: String? = nil,
        onEdit: @escaping () -> Void
    ) {
        self.init(
            task: task,
            presentation: TaskRowPresenter.make(
                task: task,
                growthRule: growthRule,
                archivedSkillIDs: archivedSkillIDs,
                day: Date(),
                hideDetails: hideDetails
            ),
            onStatusAction: onStatusAction,
            statusActionDescription: statusActionDescription,
            onEdit: onEdit
        )
    }

    var body: some View {
        let _ = AppPerformanceSignposts.recordTaskRowBody()
        TaskRowInteractionContainer(position: rowPosition) {
            HStack(spacing: 12) {
                TaskStatusButton(
                    status: presentation.status,
                    onAction: onStatusAction,
                    actionDescription: statusActionDescription
                )

                TaskRowStaticContent(presentation: presentation)

                TaskActionMenuButton(task: task, onOpenDetails: onEdit)
                    .layoutPriority(0)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
        .taskActionMenu(for: task, onOpenDetails: onEdit)
        .onAppear { AppPerformanceSignposts.recordTaskRowAppear() }
        .onDisappear { AppPerformanceSignposts.recordTaskRowDisappear() }
    }
}

private struct TaskRowInteractionContainer<Content: View>: View {
    let position: PlanningRowPosition
    let content: Content
    @State private var isHovered = false

    init(position: PlanningRowPosition, @ViewBuilder content: () -> Content) {
        self.position = position
        self.content = content()
    }

    var body: some View {
        content
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background {
                rowShape
                    .fill(isHovered ? iTuTheme.surfaceMuted : iTuTheme.surface)
            }
            .overlay {
                rowShape
                    .stroke(isHovered ? iTuTheme.border : iTuTheme.borderSoft, lineWidth: 1)
            }
            .overlay(alignment: .bottom) {
                if position != .last && position != .only {
                    Rectangle()
                        .fill(iTuTheme.borderSoft)
                        .frame(height: 1)
                        .padding(.leading, 48)
                }
            }
            .onHover { isHovered = $0 }
    }

    private var rowShape: UnevenRoundedRectangle {
        let top = position == .first || position == .only ? 14.0 : 0.0
        let bottom = position == .last || position == .only ? 14.0 : 0.0
        return UnevenRoundedRectangle(
            topLeadingRadius: top,
            bottomLeadingRadius: bottom,
            bottomTrailingRadius: bottom,
            topTrailingRadius: top
        )
    }
}

struct TaskRowStaticContent: View, Equatable {
    let presentation: TaskRowPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(presentation.title)
                .font(.system(size: 14, weight: .semibold))
                .strikethrough(presentation.isCompleted)
                .foregroundStyle(presentation.isCompleted ? iTuTheme.inkFaint : iTuTheme.ink)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)

            if presentation.metadataCount > 0 {
                metadata
            }

            if let description = presentation.description {
                Text(description)
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
                    .lineLimit(1)
            }
        }
        .help("Open task details")
        .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        .layoutPriority(1)
    }

    @ViewBuilder
    private var metadata: some View {
        if presentation.metadataCount <= 3 {
            HStack(spacing: 6) {
                metadataContent
            }
        } else {
            WrappingHStack(horizontalSpacing: 6, verticalSpacing: 5) {
                metadataContent
            }
        }
    }

    @ViewBuilder
    private var metadataContent: some View {
        if let due = presentation.due {
            taskChip(due)
        }
        if let reminder = presentation.reminder {
            taskChip(reminder)
        }
        if let priority = presentation.priority {
            taskChip(priority)
        }
        ForEach(presentation.rewards) { reward in
            rewardChip(reward)
        }
    }

    @ViewBuilder
    private func taskChip(_ chip: TaskChipPresentation) -> some View {
        TaskChip(
            title: chip.title,
            systemImage: chip.systemImage,
            foreground: chipForeground(chip.kind),
            background: chipBackground(chip.kind)
        )
    }

    @ViewBuilder
    private func rewardChip(_ reward: TaskRewardPresentation) -> some View {
        switch reward {
        case let .accountXP(amount):
            GrowthAccountRewardChipView(amount: amount, dense: true)
        case let .skillXP(amount, awards):
            GrowthRewardChipView(xpAmount: amount, awards: awards, dense: true)
        case let .coins(amount):
            GrowthCoinRewardChipView(amount: amount, dense: true)
        case let .item(award):
            GrowthItemRewardChipView(award: award)
        }
    }

    private func chipForeground(_ kind: TaskChipKind) -> Color {
        switch kind {
        case .due, .reminder, .lowPriority: iTuTheme.teal
        case .overdueDue, .highPriority: iTuTheme.coral
        case .mediumPriority: iTuTheme.amber
        }
    }

    private func chipBackground(_ kind: TaskChipKind) -> Color {
        switch kind {
        case .due, .reminder, .lowPriority: iTuTheme.mintTint
        case .overdueDue, .highPriority: iTuTheme.coralTint
        case .mediumPriority: iTuTheme.amberTint
        }
    }
}

private struct TaskStatusButton: View {
    let status: TaskStatus
    let onAction: (() -> Void)?
    let actionDescription: String?
    @State private var isHovered = false

    var body: some View {
        Button {
            onAction?()
        } label: {
            ZStack {
                if isHovered {
                    Circle()
                        .fill(iTuTheme.mintTint)
                    Circle()
                        .stroke(iTuTheme.teal, lineWidth: 1.5)
                    statusIcon
                    statusPreview
                } else {
                    statusIcon
                }
            }
            .frame(width: 30, height: 30)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(width: 30, height: 30)
        .contentShape(Rectangle())
        .scaleEffect(isHovered ? 1.06 : 1.0)
        .animation(.easeOut(duration: 0.12), value: isHovered)
        .onHover { isHovered = $0 }
        .zIndex(1)
        .pointingHandCursor()
        .help(actionDescription ?? "Status: \(status.displayName) → \(nextStatus.displayName)")
        .accessibilityLabel("Status: \(status.displayName). \(actionDescription ?? "Change to \(nextStatus.displayName)")")
    }

    private var nextStatus: TaskStatus {
        switch status {
        case .inbox, .planned: .inProgress
        case .inProgress: .completed
        case .completed, .canceled, .archived: .planned
        }
    }

    @ViewBuilder
    private var statusPreview: some View {
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
    private var statusIcon: some View {
        switch status {
        case .inProgress:
            Image(systemName: "play.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(iTuTheme.teal)
                .frame(width: 26, height: 26)
        case .completed:
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
            Circle()
                .stroke(iTuTheme.inkFaint.opacity(0.55), lineWidth: 1.5)
                .frame(width: 22, height: 22)
        }
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

struct GrowthRewardPresentation {
    let accountXp: Int
    let coinReward: Int
    let xpGroups: [(amount: Int, awards: [GrowthEarningRuleSkillAwardDTO])]
    let itemAwards: [GrowthEarningRuleItemDTO]

    var rewardCount: Int {
        xpGroups.count + itemAwards.count + (accountXp > 0 ? 1 : 0) + (coinReward > 0 ? 1 : 0)
    }

    init(rule: GrowthEarningRuleDTO?, archivedSkillIDs: Set<String>) {
        accountXp = rule?.accountXp ?? 0
        coinReward = rule?.coinReward ?? 0
        itemAwards = rule?.itemAwards.filter { $0.quantity > 0 } ?? []
        guard let rule else {
            xpGroups = []
            return
        }
        let selected = GrowthRewardMath.selectedAwards(rule.skillAwards, archivedSkillIDs: archivedSkillIDs)
        let allocations = GrowthRewardMath.split(
            accountXp: rule.accountXp,
            awards: selected,
            archivedSkillIDs: archivedSkillIDs
        )
        xpGroups = Dictionary(grouping: zip(selected, allocations).filter { $0.1 > 0 }, by: { $0.1 })
            .map { (amount: $0.key, awards: $0.value.map { $0.0 }) }
            .sorted { $0.amount > $1.amount }
    }
}

struct GrowthRewardSummaryView: View {
    let rule: GrowthEarningRuleDTO?
    var compact = false
    var dense = false
    var archivedSkillIDs: Set<String> = []
    private let presentation: GrowthRewardPresentation

    init(
        rule: GrowthEarningRuleDTO?,
        compact: Bool = false,
        dense: Bool = false,
        archivedSkillIDs: Set<String> = []
    ) {
        self.rule = rule
        self.compact = compact
        self.dense = dense
        self.archivedSkillIDs = archivedSkillIDs
        presentation = GrowthRewardPresentation(rule: rule, archivedSkillIDs: archivedSkillIDs)
    }

    var body: some View {
        if compact {
            rewardChips(presentation)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("Growth rewards", systemImage: "gift.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color(hex: 0x7C3AED))
                    Spacer()
                    Text(presentation.rewardCount == 0 ? "No rewards" : "On completion")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                if presentation.rewardCount == 0 {
                    Text("No Growth rewards configured for this task.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    rewardChips(presentation)
                }
            }
            .padding(16)
            .iTuPanel(radius: 14)
        }
    }

    @ViewBuilder
    private func rewardChips(_ presentation: GrowthRewardPresentation) -> some View {
        if presentation.rewardCount > 0 {
            Group {
                if presentation.accountXp > 0 {
                    GrowthAccountRewardChipView(amount: presentation.accountXp, dense: dense)
                }
                ForEach(Array(presentation.xpGroups.enumerated()), id: \.offset) { _, group in
                    GrowthRewardChipView(
                        xpAmount: group.amount,
                        awards: group.awards,
                        dense: dense
                    )
                }
                if presentation.coinReward > 0 {
                    GrowthCoinRewardChipView(amount: presentation.coinReward, dense: dense)
                }
                ForEach(presentation.itemAwards, id: \.itemId) { award in
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
