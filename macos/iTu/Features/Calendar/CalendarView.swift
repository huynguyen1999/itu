import SwiftUI
import UniformTypeIdentifiers

enum CalendarZoom: String, CaseIterable, Identifiable {
    case day = "DAY", week = "WEEK", month = "MONTH"
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    func range(for date: Date, weekStart: String = "MONDAY") -> (from: Date, to: Date) {
        var cal = Calendar.current
        cal.firstWeekday = (weekStart.uppercased() == "SUNDAY") ? 1 : 2
        let day = cal.startOfDay(for: date)
        switch self {
        case .day: return (day, cal.date(byAdding: .day, value: 1, to: day) ?? day)
        case .week:
            let weekday = cal.component(.weekday, from: day)
            let start = cal.date(byAdding: .day, value: -(weekday - cal.firstWeekday + 7) % 7, to: day) ?? day
            return (start, cal.date(byAdding: .day, value: 7, to: start) ?? start)
        case .month:
            let start = cal.date(from: cal.dateComponents([.year, .month], from: day)) ?? day
            return (start, cal.date(byAdding: .month, value: 1, to: start) ?? start)
        }
    }
}

enum CalendarKind: String, CaseIterable, Identifiable {
    case taskDuration = "TASK_DURATION", taskDue = "TASK_DUE", focus = "FOCUS_SESSION", external = "EXTERNAL_EVENT"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .taskDuration: return "Tasks"
        case .taskDue: return "Due Dates"
        case .focus: return "Focus Sessions"
        case .external: return "External Events"
        }
    }
}

struct CalendarGroup: Identifiable {
    let id: String
    let title: String
    var color: String?
    var items: [CalendarItem] = []
}

struct CalendarView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @SceneStorage("calendar.zoom") private var zoomRaw = CalendarZoom.week.rawValue
    @SceneStorage("calendar.anchor") private var anchorTimestamp = Date().timeIntervalSinceReferenceDate
    @State private var externalItems: [CalendarTimelineItem] = []
    @State private var arrangeTasksOpen = false
    @State private var arrangeSearch = ""
    @State private var settingsOpen = false
    @State private var detailItem: CalendarItem?
    @SceneStorage("calendar.didHydratePreferences") private var didHydratePreferences = false

    private var zoom: CalendarZoom {
        CalendarZoom(rawValue: zoomRaw) ?? .week
    }

    private var anchor: Date {
        Date(timeIntervalSinceReferenceDate: anchorTimestamp)
    }

    private var range: (from: Date, to: Date) { zoom.range(for: anchor, weekStart: model.calendarPreferences.weekStart) }
    private var visibleKinds: Set<String> { Set(model.calendarPreferences.visibleKinds) }

    private var allRawItems: [CalendarItem] {
        let taskItems = model.tasks.compactMap { task -> CalendarItem? in
            if task.status == .canceled || task.status == .archived { return nil }
            if !model.calendarPreferences.showCompleted && task.status == .completed { return nil }
            let groupID = taskGroupID(task)
            if let start = task.scheduledStartAt.flatMap(iTuDateSupport.parse),
               let end = task.scheduledEndAt.flatMap(iTuDateSupport.parse) {
                return CalendarItem(
                    id: task.id, title: task.title, start: start, end: end,
                    kind: "TASK_DURATION", taskID: task.id, readOnly: false,
                    allDay: false, dueAt: task.dueAt.flatMap(iTuDateSupport.parse),
                    sourceID: groupID, sourceName: taskGroupName(task),
                    color: taskGroupColor(task), priority: task.priority.rawValue,
                    description: task.descriptionMarkdown, location: nil, timeZone: nil,
                    status: task.status.rawValue
                )
            }
            guard let due = task.dueAt.flatMap(iTuDateSupport.parse) else { return nil }
            return CalendarItem(
                id: task.id, title: task.title, start: due, end: nil,
                kind: "TASK_DUE", taskID: task.id, readOnly: false, allDay: true,
                dueAt: due, sourceID: groupID, sourceName: taskGroupName(task),
                color: taskGroupColor(task), priority: task.priority.rawValue,
                description: task.descriptionMarkdown, location: nil, timeZone: nil,
                status: task.status.rawValue
            )
        }
        let focusItems = model.focusTimer.history.compactMap { session -> CalendarItem? in
            guard session.status != .abandoned,
                  let start = iTuDateSupport.parse(session.adjustedStartedAt ?? session.startedAt) else { return nil }
            let end = (session.adjustedCompletedAt ?? session.completedAt).flatMap(iTuDateSupport.parse) ?? Date()
            return CalendarItem(
                id: session.id, title: session.customTitle ?? session.taskTitleSnapshot ?? "Focus session",
                start: start, end: end, kind: "FOCUS_SESSION", taskID: session.taskId,
                readOnly: true, allDay: false, sourceID: "focus", sourceName: "Focus", color: "#8B6FC9", priority: nil,
                description: session.reflection, location: nil, timeZone: nil,
                status: session.status.rawValue
            )
        }
        let imported = externalItems.compactMap { item -> CalendarItem? in
            let sourceID = "calendar:\(item.sourceId ?? item.id)"
            guard item.kind == "EXTERNAL_EVENT", let start = iTuDateSupport.parse(item.startAt) else { return nil }
            return CalendarItem(
                id: item.id, title: item.title, start: start, end: item.endAt.flatMap(iTuDateSupport.parse),
                kind: item.kind, taskID: nil, readOnly: true, allDay: item.allDay, dueAt: item.dueAt.flatMap(iTuDateSupport.parse),
                sourceID: sourceID, sourceName: item.sourceName ?? "Calendar Subscription",
                color: item.color, priority: nil,
                description: item.description, location: item.location, timeZone: item.timeZone,
                status: item.status
            )
        }
        return (taskItems + focusItems + imported).filter {
            visibleKinds.contains($0.kind) && $0.start < range.to && ($0.end ?? $0.start) >= range.from
        }
    }

    private var sourceGroups: [CalendarGroup] {
        var groups: [String: CalendarGroup] = [:]
        for item in allRawItems {
            let id = item.sourceID ?? "project:inbox"
            let title = item.sourceName?.isEmpty == false
                ? item.sourceName!
                : item.kind == "FOCUS_SESSION" ? "Focus" : item.kind == "EXTERNAL_EVENT" ? "Calendar Subscription" : "Inbox"
            let sourceColor = item.color ?? (item.kind == "FOCUS_SESSION" ? "VIOLET" : item.kind == "TASK_DUE" ? "TEAL" : nil)
            if var group = groups[id] {
                group.items.append(item)
                if group.color == nil { group.color = sourceColor }
                groups[id] = group
            } else {
                groups[id] = CalendarGroup(id: id, title: title, color: sourceColor, items: [item])
            }
        }
        return groups.values.sorted { lhs, rhs in
            sourceRank(lhs.id) == sourceRank(rhs.id)
                ? lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
                : sourceRank(lhs.id) < sourceRank(rhs.id)
        }
    }

    private var items: [CalendarItem] {
        let collapsed = Set(model.calendarPreferences.collapsedGroupIds)
        return allRawItems.filter { item in
            let sourceID = item.sourceID ?? "project:inbox"
            return !collapsed.contains(sourceID)
        }
    }

    private var days: [Date] {
        let cal = Calendar.current
        var result: [Date] = []
        var curr = cal.startOfDay(for: range.from)
        while curr < range.to {
            result.append(curr)
            curr = cal.date(byAdding: .day, value: 1, to: curr)!
        }
        return result
    }

    var body: some View {
        VStack(spacing: 0) {
            pageHeader

            HStack(alignment: .top, spacing: 16) {
                timelineCard
                    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)

                if arrangeTasksOpen {
                    arrangeTasksDrawer
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
        }
        .background(iTuTheme.canvas)
        .task(id: "\(range.from.timeIntervalSince1970)-\(range.to.timeIntervalSince1970)") {
            let rangeKey = "\(range.from.timeIntervalSince1970)-\(range.to.timeIntervalSince1970)"
            await model.refreshCoordinator.run(.calendar(rangeKey)) { await loadTimeline() }
        }
        .onAppear {
            guard !didHydratePreferences else { return }
            zoomRaw = (CalendarZoom(rawValue: model.calendarPreferences.zoom) ?? .week).rawValue
            didHydratePreferences = true
        }
        .popover(item: $detailItem) { item in
            CalendarEventDetailView(item: item, onClose: { detailItem = nil })
        }
        .animation(.snappy(duration: 0.22), value: arrangeTasksOpen)
    }

    // MARK: - Page Header (Web Parity)

    private var pageHeader: some View {
        HStack(alignment: .bottom, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                iTuSectionLabel(title: "PRODUCTIVITY", color: iTuTheme.teal)
                Text("Calendar")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
                Text("A calm, source-first view of what has your attention.")
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            Spacer(minLength: 16)

            HStack(spacing: 10) {
                // Arrange tasks button
                Button {
                    withAnimation(.snappy(duration: 0.22)) {
                        arrangeTasksOpen.toggle()
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .bold))
                        Text("Arrange tasks")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .background(arrangeTasksOpen ? iTuTheme.mintTint : iTuTheme.surface)
                    .foregroundStyle(arrangeTasksOpen ? iTuTheme.teal : iTuTheme.ink)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(arrangeTasksOpen ? iTuTheme.teal.opacity(0.5) : iTuTheme.border, lineWidth: 1)
                    }
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
                .accessibilityLabel("Arrange tasks")
                .accessibilityAddTraits(arrangeTasksOpen ? .isSelected : [])

                // Navigation & Zoom Segmented Pill Container
                HStack(spacing: 2) {
                    Button {
                        move(-1)
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                            .frame(width: 28, height: 28)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()
                    .accessibilityLabel("Previous range")

                    Button {
                        anchorTimestamp = Date().timeIntervalSinceReferenceDate
                    } label: {
                        Text("Today")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                            .padding(.horizontal, 9)
                            .frame(height: 26)
                            .background(iTuTheme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .stroke(iTuTheme.borderSoft, lineWidth: 1)
                            }
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()

                    Button {
                        move(1)
                    } label: {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                            .frame(width: 28, height: 28)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()
                    .accessibilityLabel("Next range")

                    Rectangle()
                        .fill(iTuTheme.borderSoft)
                        .frame(width: 1, height: 16)
                        .padding(.horizontal, 2)

                    HStack(spacing: 2) {
                        ForEach(CalendarZoom.allCases) { z in
                            let isSelected = zoom == z
                            Button {
                                zoomRaw = z.rawValue
                                Task { await model.updateCalendarPreferences(["zoom": .string(z.rawValue)]) }
                            } label: {
                                Text(z.title)
                                    .font(.system(size: 12, weight: isSelected ? .semibold : .medium))
                                    .foregroundStyle(isSelected ? Color.white : iTuTheme.inkDim)
                                    .padding(.horizontal, 10)
                                    .frame(height: 26)
                                    .background(isSelected ? iTuTheme.teal : Color.clear)
                                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .pointingHandCursor()
                            .accessibilityLabel("\(z.title) view")
                        }
                    }

                    Rectangle()
                        .fill(iTuTheme.borderSoft)
                        .frame(width: 1, height: 16)
                        .padding(.horizontal, 2)

                    Button {
                        settingsOpen.toggle()
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                            .frame(width: 28, height: 28)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()
                    .help("Calendar settings")
                    .accessibilityLabel("Calendar settings")
                    .popover(isPresented: $settingsOpen, arrowEdge: .bottom) {
                        CalendarSettingsPopover()
                    }
                }
                .padding(3)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                }
                .shadow(color: iTuTheme.forest.opacity(0.04), radius: 2, y: 1)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 20)
        .padding(.bottom, 14)
    }

    // MARK: - Main Timeline Card (Web Parity)

    private var timelineCard: some View {
        VStack(spacing: 0) {
            if zoom != .day {
                cardHeaderBanner
            }

            if !sourceGroups.isEmpty {
                sourceChipsBar
            }

            mainCalendarBody
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)

            cardFooter
        }
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
        .shadow(color: iTuTheme.forest.opacity(0.06), radius: 6, y: 2)
    }

    private var cardHeaderBanner: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("SCHEDULE OVERVIEW · SOURCE TIMELINE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(iTuTheme.mint)
                Text(rangeLabel)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.white)
            }
            Spacer()
            Text("\(items.count) items · \(sourceGroups.count) sources")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Color.white.opacity(0.7))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            LinearGradient(
                colors: [iTuTheme.forest, iTuTheme.forestDeep],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1)
        }
    }

    private var sourceChipsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(sourceGroups) { group in
                    let isCollapsed = model.calendarPreferences.collapsedGroupIds.contains(group.id)
                    let chipColor = Color.calendarColor(kind: group.items.first?.kind ?? "", sourceColor: group.color)

                    Button {
                        toggleGroupCollapse(group.id)
                    } label: {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(isCollapsed ? chipColor.opacity(0.35) : chipColor)
                                .frame(width: 6, height: 6)
                            Text(group.title)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(isCollapsed ? iTuTheme.inkDim.opacity(0.6) : iTuTheme.ink)
                            Text("· \(group.items.count)")
                                .font(.system(size: 11, weight: .regular))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(isCollapsed ? iTuTheme.surfaceMuted : chipColor.opacity(0.08))
                        .clipShape(Capsule())
                        .overlay {
                            Capsule()
                                .stroke(isCollapsed ? iTuTheme.borderSoft : chipColor.opacity(0.7), lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()
                    .accessibilityLabel("\(group.title), \(group.items.count) items\(isCollapsed ? ", hidden" : "")")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
        }
        .background(iTuTheme.surface)
        .overlay(alignment: .bottom) {
            Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
        }
    }

    private var cardFooter: some View {
        HStack {
            Text("Tasks can move and resize. Focus Sessions and subscriptions are read-only.")
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(iTuTheme.surface)
        .overlay(alignment: .top) {
            Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
        }
    }

    // MARK: - Calendar Grid Views

    @ViewBuilder
    private var mainCalendarBody: some View {
        Group {
            switch zoom {
            case .day:
                CalendarDayView(
                    day: days.first ?? anchor,
                    items: items,
                    onSelect: selectItem,
                    onScheduleUpdate: handleScheduleUpdate
                )
            case .week:
                CalendarWeekView(
                    days: days,
                    items: items,
                    onSelect: selectItem,
                    onScheduleUpdate: handleScheduleUpdate
                )
            case .month:
                CalendarMonthView(
                    anchor: anchor,
                    items: items,
                    weekStartDay: model.calendarPreferences.weekStart,
                    onSelect: selectItem
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
    }

    // MARK: - Arrange Tasks Drawer (Web Parity)

    private var arrangeTasksDrawer: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    iTuSectionLabel(title: "ARRANGE TASKS", color: iTuTheme.teal)
                    Text("Give unfinished work a place")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Drag-only: drop a task onto the timeline.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                Text("\(arrangeableTasks.count)")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(iTuTheme.mintTint)
                    .foregroundStyle(iTuTheme.teal)
                    .clipShape(Capsule())
            }

            // Search
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
                TextField("Search tasks…", text: $arrangeSearch)
                    .font(.system(size: 12))
                    .textFieldStyle(.plain)
                if !arrangeSearch.isEmpty {
                    Button {
                        arrangeSearch = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(iTuTheme.borderSoft, lineWidth: 1)
            }

            // Task List
            ScrollView {
                LazyVStack(spacing: 6) {
                    if arrangeableTasks.isEmpty {
                        VStack(spacing: 6) {
                            Text("No unscheduled tasks")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(iTuTheme.inkDim)
                            Text("All planned tasks have dates assigned.")
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                    } else {
                        ForEach(arrangeableTasks) { task in
                            HStack(spacing: 8) {
                                Image(systemName: "line.3.horizontal")
                                    .font(.system(size: 10))
                                    .foregroundStyle(iTuTheme.inkDim)
                                Text(task.title)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(iTuTheme.ink)
                                    .lineLimit(1)
                                Spacer()
                                if let minutes = task.estimatedMinutes {
                                    Text("\(minutes)m")
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundStyle(iTuTheme.inkDim)
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(iTuTheme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 7, style: .continuous)
                                    .stroke(iTuTheme.borderSoft, lineWidth: 1)
                            }
                            .onDrag { NSItemProvider(object: task.id as NSString) }
                            .accessibilityLabel("Drag \(task.title) to schedule it")
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(width: 260)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
        .shadow(color: iTuTheme.forest.opacity(0.06), radius: 6, y: 2)
    }

    // MARK: - Actions & Helpers

    private func toggleGroupCollapse(_ id: String) {
        var collapsed = model.calendarPreferences.collapsedGroupIds
        if collapsed.contains(id) {
            collapsed.removeAll { $0 == id }
        } else {
            collapsed.append(id)
        }
        Task {
            await model.updateCalendarPreferences(["collapsedGroupIds": .array(collapsed.map(JSONValue.string))])
        }
    }

    private func sourceRank(_ id: String) -> Int {
        if id == "project:inbox" { return 0 }
        if id.hasPrefix("project:") { return 1 }
        if id.hasPrefix("calendar:") { return 2 }
        return 3
    }

    private func selectItem(_ item: CalendarItem) {
        if item.readOnly {
            detailItem = item
        } else if let taskID = item.taskID {
            model.presentedOverlay = .taskEditor(taskID: taskID)
        }
    }

    private func handleScheduleUpdate(taskID: String, newStart: Date, newEnd: Date) {
        guard let task = model.tasks.first(where: { $0.id == taskID }) else { return }
        let formatter = ISO8601DateFormatter()
        let isoStart = formatter.string(from: newStart)
        let isoEnd = formatter.string(from: newEnd)

        if let index = model.tasks.firstIndex(where: { $0.id == taskID }) {
            var updated = model.tasks[index]
            updated.scheduledStartAt = isoStart
            updated.scheduledEndAt = isoEnd
            model.tasks[index] = updated
        }

        Task {
            await model.updateTaskSchedule(task, dueAt: task.dueAt, scheduledStartAt: isoStart, scheduledEndAt: isoEnd)
        }
    }

    private func move(_ direction: Int) {
        let cal = Calendar.current
        switch zoom {
        case .day:
            anchorTimestamp = (cal.date(byAdding: .day, value: direction, to: anchor) ?? anchor).timeIntervalSinceReferenceDate
        case .week:
            anchorTimestamp = (cal.date(byAdding: .day, value: direction * 7, to: anchor) ?? anchor).timeIntervalSinceReferenceDate
        case .month:
            anchorTimestamp = (cal.date(byAdding: .month, value: direction, to: anchor) ?? anchor).timeIntervalSinceReferenceDate
        }
    }

    private var rangeLabel: String {
        let cal = Calendar.current
        let formatter = DateFormatter()
        switch zoom {
        case .day:
            formatter.dateFormat = "EEEE, MMM d, yyyy"
            return formatter.string(from: anchor)
        case .week:
            let last = cal.date(byAdding: .day, value: 6, to: range.from) ?? range.to
            formatter.dateFormat = "MMM d"
            let startStr = formatter.string(from: range.from)
            formatter.dateFormat = "MMM d, yyyy"
            let endStr = formatter.string(from: last)
            return "\(startStr) – \(endStr)"
        case .month:
            formatter.dateFormat = "MMMM yyyy"
            return formatter.string(from: anchor)
        }
    }

    private func taskGroupID(_ task: ProductivityTask) -> String {
        if let listID = task.taskListId, !listID.isEmpty { return "project:\(listID)" }
        if let projID = task.projectId, !projID.isEmpty { return "project:\(projID)" }
        return "project:inbox"
    }

    private func taskGroupName(_ task: ProductivityTask) -> String {
        if let listID = task.taskListId, let list = model.taskLists.first(where: { $0.id == listID }) {
            return list.name
        }
        if let projID = task.projectId, let proj = model.taskLists.first(where: { $0.id == projID }) {
            return proj.name
        }
        return "Inbox"
    }

    private func taskGroupColor(_ task: ProductivityTask) -> String? {
        if let listID = task.taskListId, let list = model.taskLists.first(where: { $0.id == listID }) {
            return list.color
        }
        return nil
    }

    private func loadTimeline() async {
        let api = model.apiClient
        do {
            let res = try await api.fetchCalendarTimeline(from: range.from, to: range.to)
            externalItems = res
        } catch {
            // Keep existing loaded items on network failure
        }
    }

    private var arrangeableTasks: [ProductivityTask] {
        model.tasks.filter { task in
            (task.status == .planned || task.status == .inProgress) &&
            task.dueAt == nil && task.scheduledStartAt == nil && task.scheduledEndAt == nil &&
            (arrangeSearch.isEmpty || task.title.localizedCaseInsensitiveContains(arrangeSearch))
        }
    }
}
