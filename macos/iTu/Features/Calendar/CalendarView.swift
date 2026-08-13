import SwiftUI
import UniformTypeIdentifiers

enum CalendarZoom: String, CaseIterable, Identifiable {
    case day = "DAY", week = "WEEK", month = "MONTH"
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    func range(for date: Date) -> (from: Date, to: Date) {
        var cal = Calendar.current; cal.firstWeekday = 2
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

    private var zoomBinding: Binding<CalendarZoom> {
        Binding(get: { zoom }, set: { zoomRaw = $0.rawValue })
    }

    private var range: (from: Date, to: Date) { zoom.range(for: anchor) }
    private var visibleKinds: Set<String> { Set(model.calendarPreferences.visibleKinds) }

    private var sourceGroups: [CalendarGroup] {
        var groups: [String: CalendarGroup] = [:]
        for item in items {
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
        let taskItems = model.tasks.compactMap { task -> CalendarItem? in
            if !model.calendarPreferences.showCompleted && task.status == .completed { return nil }
            if let start = task.scheduledStartAt.flatMap(iTuDateSupport.parse),
               let end = task.scheduledEndAt.flatMap(iTuDateSupport.parse) {
                return CalendarItem(
                    id: task.id, title: task.title, start: start, end: end,
                    kind: "TASK_DURATION", taskID: task.id, readOnly: false,
                    allDay: false, dueAt: task.dueAt.flatMap(iTuDateSupport.parse),
                    sourceID: taskGroupID(task), sourceName: taskGroupName(task),
                    color: taskGroupColor(task), priority: task.priority.rawValue
                )
            }
            guard let due = task.dueAt.flatMap(iTuDateSupport.parse) else { return nil }
            return CalendarItem(
                id: task.id, title: task.title, start: due, end: nil,
                kind: "TASK_DUE", taskID: task.id, readOnly: false, allDay: true,
                dueAt: due, sourceID: taskGroupID(task), sourceName: taskGroupName(task),
                color: taskGroupColor(task), priority: task.priority.rawValue
            )
        }
        let focusItems = model.focusTimer.history.compactMap { session -> CalendarItem? in
            guard session.status != .abandoned,
                  let start = iTuDateSupport.parse(session.adjustedStartedAt ?? session.startedAt) else { return nil }
            let end = (session.adjustedCompletedAt ?? session.completedAt).flatMap(iTuDateSupport.parse) ?? Date()
            return CalendarItem(
                id: session.id, title: session.customTitle ?? session.taskTitleSnapshot ?? "Focus session",
                start: start, end: end, kind: "FOCUS_SESSION", taskID: session.taskId,
                readOnly: true, allDay: false, sourceID: "focus", sourceName: "Focus", color: "#8B6FC9", priority: nil
            )
        }
        let imported = externalItems.compactMap { item -> CalendarItem? in
            guard item.kind == "EXTERNAL_EVENT", let start = iTuDateSupport.parse(item.startAt) else { return nil }
            return CalendarItem(
                id: item.id, title: item.title, start: start, end: item.endAt.flatMap(iTuDateSupport.parse),
                kind: item.kind, taskID: nil, readOnly: true, allDay: item.allDay, dueAt: item.dueAt.flatMap(iTuDateSupport.parse),
                sourceID: "calendar:\(item.sourceId ?? item.id)", sourceName: item.sourceName ?? "Calendar Subscription",
                color: item.color, priority: nil,
                description: item.description, location: item.location, timeZone: item.timeZone
            )
        }
        return (taskItems + focusItems + imported).filter {
            visibleKinds.contains($0.kind) && $0.start < range.to && ($0.end ?? $0.start) >= range.from
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
            header
            overviewBar
            sourceLegend
            HStack(spacing: 0) {
                mainCalendarBody
                if arrangeTasksOpen { arrangeTasks }
            }
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
        .popover(item: $detailItem) { item in detailCard(item) }
    }

    @ViewBuilder
    private var mainCalendarBody: some View {
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
                onSelect: selectItem
            )
        case .month:
            CalendarMonthView(
                anchor: anchor,
                items: items,
                onSelect: selectItem
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "calendar").foregroundStyle(iTuTheme.teal)
            VStack(alignment: .leading, spacing: 2) {
                Text("Calendar").font(.system(size: 20, weight: .bold, design: .rounded))
                Text("See your week at a glance, then adjust plans as they change.")
                    .font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
            }
            Spacer()
            Button("Previous", systemImage: "chevron.left") { move(-1) }.labelStyle(.iconOnly).buttonStyle(.plain).accessibilityLabel("Previous range")
            Button("Today") { anchorTimestamp = Date().timeIntervalSinceReferenceDate }.buttonStyle(iTuSecondaryButtonStyle(height: 28))
            Button("Next", systemImage: "chevron.right") { move(1) }.labelStyle(.iconOnly).buttonStyle(.plain).accessibilityLabel("Next range")
            Picker("Zoom", selection: zoomBinding) { ForEach(CalendarZoom.allCases) { Text($0.title).tag($0) } }
                .pickerStyle(.segmented).frame(width: 190)
                .onChange(of: zoom) { _, value in
                    Task { await model.updateCalendarPreferences(["zoom": .string(value.rawValue)]) }
                }
            Button("Calendar settings", systemImage: "gearshape") { settingsOpen.toggle() }
                .labelStyle(.iconOnly).buttonStyle(.plain).help("Calendar settings")
                .popover(isPresented: $settingsOpen, arrowEdge: .top) { settingsPopover }
            Button("Arrange Tasks", systemImage: arrangeTasksOpen ? "sidebar.right" : "sidebar.right.closed") { arrangeTasksOpen.toggle() }
                .labelStyle(.iconOnly).buttonStyle(.plain).help("Arrange Tasks")
        }
        .padding(.horizontal, 24).padding(.vertical, 16)
    }

    private var overviewBar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("SCHEDULE OVERVIEW").font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(iTuTheme.mint)
                HStack(spacing: 10) {
                    Text(rangeLabel).font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
                    Text("\(items.count) in view").font(.system(size: 11, design: .monospaced)).foregroundStyle(.white.opacity(0.65))
                }
                Text("Tasks, Due Dates, Focus Sessions, and external events in one view.")
                    .font(.system(size: 11)).foregroundStyle(.white.opacity(0.68))
            }
            Spacer()
            legend("Tasks", color: iTuTheme.mint)
            legend("Due Dates", color: iTuTheme.amber)
            legend("Focus", color: Color(hex: 0x8B6FC9))
        }
        .padding(.horizontal, 20).padding(.vertical, 14)
        .background(LinearGradient(colors: [iTuTheme.forest, iTuTheme.forestDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
    }

    private var sourceLegend: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(sourceGroups) { group in
                    sourceChip(group)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
        }
        .background(iTuTheme.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(iTuTheme.borderSoft).frame(height: 1) }
    }

    private func sourceChip(_ group: CalendarGroup) -> some View {
        let color = Color.calendarColor(kind: group.items.first?.kind ?? "", sourceColor: group.color)
        return HStack(spacing: 7) {
            Circle().fill(color).frame(width: 9, height: 9)
            Text(group.title).lineLimit(1)
            Text("· " + String(group.items.count)).foregroundStyle(iTuTheme.inkDim)
        }
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(iTuTheme.ink)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(color.opacity(0.08), in: Capsule())
        .overlay { Capsule().stroke(color.opacity(0.75), lineWidth: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(group.title + ", " + String(group.items.count) + " items")
    }

    private func legend(_ title: String, color: Color) -> some View {
        Label(title, systemImage: "circle.fill").font(.system(size: 10, weight: .medium)).foregroundStyle(.white.opacity(0.78)).symbolRenderingMode(.palette).foregroundStyle(color, .clear)
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

        // Optimistically update model.tasks
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

    private var arrangeTasks: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Arrange tasks").font(.system(size: 14, weight: .semibold))
                Spacer()
                Text("\(arrangeableTasks.count)").font(.system(size: 11, design: .monospaced)).foregroundStyle(iTuTheme.teal)
            }
            Text("Drop unfinished work onto the timeline to give it a place.").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
            TextField("Search", text: $arrangeSearch).textFieldStyle(.roundedBorder)
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(arrangeableTasks) { task in
                        HStack(spacing: 7) {
                            Image(systemName: "line.3.horizontal").foregroundStyle(iTuTheme.inkFaint)
                            Text(task.title).font(.system(size: 11, weight: .medium)).lineLimit(2)
                            Spacer()
                        }
                        .padding(8).background(iTuTheme.surface).clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .onDrag { NSItemProvider(object: task.id as NSString) }
                        .accessibilityLabel("Drag \(task.title) to schedule it")
                    }
                }
            }
        }
        .padding(14).frame(width: 245).background(iTuTheme.surfaceMuted)
        .overlay(alignment: .leading) { Rectangle().fill(iTuTheme.border).frame(width: 1) }
    }

    private var settingsPopover: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Calendar settings").font(.system(size: 14, weight: .semibold))
            Toggle("Show completed", isOn: Binding(
                get: { model.calendarPreferences.showCompleted },
                set: { value in Task { await model.updateCalendarPreferences(["showCompleted": .bool(value)]) } }
            ))
            Divider()
            Text("Visible kinds").font(.system(size: 11, weight: .semibold)).foregroundStyle(iTuTheme.inkDim)
            ForEach(CalendarKind.allCases) { kind in
                Toggle(kind.title, isOn: Binding(
                    get: { visibleKinds.contains(kind.rawValue) },
                    set: { value in updateVisibleKind(kind.rawValue, visible: value) }
                ))
            }
        }
        .padding(16).frame(width: 220)
    }

    private func updateVisibleKind(_ kind: String, visible: Bool) {
        var kinds = model.calendarPreferences.visibleKinds
        if visible {
            if !kinds.contains(kind) { kinds.append(kind) }
        } else {
            kinds.removeAll { $0 == kind }
        }
        Task { await model.updateCalendarPreferences(["visibleKinds": .array(kinds.map(JSONValue.string))]) }
    }

    private func detailCard(_ item: CalendarItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(item.title).font(.system(size: 16, weight: .bold))
                Spacer()
                Button("Close") { detailItem = nil }.buttonStyle(.plain)
            }
            if let desc = item.description, !desc.isEmpty {
                Text(desc).font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
            }
            if let loc = item.location, !loc.isEmpty {
                Label(loc, systemImage: "mappin.and.ellipse").font(.system(size: 12))
            }
            Text("Read-only calendar item").font(.system(size: 10, design: .monospaced)).foregroundStyle(iTuTheme.inkFaint)
        }
        .padding(16).frame(width: 300)
    }
}
