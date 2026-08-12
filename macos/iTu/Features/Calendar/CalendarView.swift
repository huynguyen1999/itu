import SwiftUI
import UniformTypeIdentifiers

struct CalendarView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var zoom: CalendarZoom = .week
    @State private var anchor = Date()
    @State private var externalItems: [CalendarTimelineItem] = []
    @State private var arrangeTasksOpen = false
    @State private var arrangeSearch = ""
    @State private var settingsOpen = false
    @State private var detailItem: CalendarItem?
    @State private var didLoadPreferences = false

    private var range: (from: Date, to: Date) { zoom.range(for: anchor) }
    private var visibleKinds: Set<String> { Set(model.calendarPreferences.visibleKinds) }

    private var items: [CalendarItem] {
        let taskItems = model.tasks.compactMap { task -> CalendarItem? in
            if !model.calendarPreferences.showCompleted && task.status == .completed { return nil }
            if let start = task.scheduledStartAt.flatMap(iTuDateSupport.parse),
               let end = task.scheduledEndAt.flatMap(iTuDateSupport.parse) {
                return CalendarItem(
                    id: task.id, title: task.title, start: start, end: end,
                    kind: "TASK_DURATION", taskID: task.id, readOnly: false,
                    allDay: false, sourceID: taskGroupID(task), sourceName: taskGroupName(task),
                    color: taskGroupColor(task), priority: task.priority.rawValue
                )
            }
            guard let due = task.dueAt.flatMap(iTuDateSupport.parse) else { return nil }
            return CalendarItem(
                id: task.id, title: task.title, start: due, end: nil,
                kind: "TASK_DUE", taskID: task.id, readOnly: false, allDay: true,
                sourceID: taskGroupID(task), sourceName: taskGroupName(task), color: taskGroupColor(task),
                priority: task.priority.rawValue
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
                kind: item.kind, taskID: nil, readOnly: true, allDay: item.allDay,
                sourceID: "calendar:\(item.sourceId ?? item.id)", sourceName: item.sourceName ?? "Calendar Subscription",
                color: item.color, priority: nil,
                description: item.description, location: item.location, timeZone: item.timeZone
            )
        }
        return (taskItems + focusItems + imported).filter {
            visibleKinds.contains($0.kind) && $0.start < range.to && ($0.end ?? $0.start) >= range.from
        }
    }

    private var groups: [CalendarGroup] {
        let grouped = Dictionary(grouping: items) { item in
            item.sourceID ?? (item.kind == "TASK_DUE" || item.kind == "TASK_DURATION" ? "project:inbox" : item.kind.lowercased())
        }
        return grouped.keys.sorted { lhs, rhs in
            func rank(_ value: String) -> Int {
                if value == "project:inbox" { return 0 }
                if value.hasPrefix("project:") { return 1 }
                if value.hasPrefix("calendar:") { return 2 }
                return 3
            }
            func title(_ value: String) -> String {
                grouped[value]?.first?.sourceName ?? (value == "focus" ? "Focus" : "Calendar Subscription")
            }
            let leftRank = rank(lhs); let rightRank = rank(rhs)
            if leftRank != rightRank { return leftRank < rightRank }
            let comparison = title(lhs).localizedCaseInsensitiveCompare(title(rhs))
            return comparison == .orderedSame ? lhs < rhs : comparison == .orderedAscending
        }.map { id in
            let values = grouped[id] ?? []
            return CalendarGroup(
                id: id,
                title: values.first?.sourceName ?? (id == "focus" ? "Focus" : "Calendar Subscription"),
                items: values.sorted { $0.start < $1.start }
            )
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            overviewBar
            HStack(spacing: 0) {
                timeline
                if arrangeTasksOpen { arrangeTasks }
            }
        }
        .background(iTuTheme.canvas)
        .task(id: "\(range.from.timeIntervalSince1970)-\(range.to.timeIntervalSince1970)") { await loadTimeline() }
        .onAppear {
            guard !didLoadPreferences else { return }
            zoom = CalendarZoom(rawValue: model.calendarPreferences.zoom) ?? .week
            didLoadPreferences = true
        }
        .popover(item: $detailItem) { item in detailCard(item) }
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
            Button("Today") { anchor = Date() }.buttonStyle(iTuSecondaryButtonStyle(height: 28))
            Button("Next", systemImage: "chevron.right") { move(1) }.labelStyle(.iconOnly).buttonStyle(.plain).accessibilityLabel("Next range")
            Picker("Zoom", selection: $zoom) { ForEach(CalendarZoom.allCases) { Text($0.title).tag($0) } }
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

    private func legend(_ title: String, color: Color) -> some View {
        Label(title, systemImage: "circle.fill").font(.system(size: 10, weight: .medium)).foregroundStyle(.white.opacity(0.78)).symbolRenderingMode(.palette).foregroundStyle(color, .clear)
    }

    private var timeline: some View {
        let slots = zoom.slots(in: range)
        let width = CGFloat(slots.count) * zoom.slotWidth
        return ScrollView(.vertical) {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                Section {
                    ScrollView(.horizontal, showsIndicators: true) {
                        HStack(spacing: 0) {
                            Color.clear.frame(width: 142)
                            ForEach(slots) { slot in columnHeader(slot) }
                        }
                        .frame(width: 142 + width, alignment: .leading)
                    }
                    .frame(height: 58)
                } header: { EmptyView() }
                if groups.isEmpty {
                    emptyState.frame(minWidth: 600, minHeight: 340)
                } else {
                    ForEach(groups) { group in
                        Section {
                            if !model.calendarPreferences.collapsedGroupIds.contains(group.id) {
                                groupRow(group, slots: slots, width: width)
                            }
                        } header: {
                            groupHeader(group, collapsed: model.calendarPreferences.collapsedGroupIds.contains(group.id))
                        }
                    }
                }
            }
            .padding(.bottom, 18)
        }
        .background(iTuTheme.surfaceMuted)
        .accessibilityLabel("Calendar timeline")
    }

    private func columnHeader(_ slot: CalendarSlot) -> some View {
        VStack(spacing: 3) {
            Text(slot.title).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(iTuTheme.inkDim)
            if slot.isToday { Text("Today").font(.system(size: 10, weight: .semibold)).foregroundStyle(iTuTheme.teal) }
        }
        .frame(width: zoom.slotWidth, height: 58, alignment: .center)
        .overlay(alignment: .leading) { Rectangle().fill(iTuTheme.borderSoft).frame(width: 1) }
        .background(slot.isToday ? iTuTheme.mintTint.opacity(0.6) : iTuTheme.surface)
    }

    private func groupHeader(_ group: CalendarGroup, collapsed: Bool) -> some View {
        Button {
            var ids = model.calendarPreferences.collapsedGroupIds
            if collapsed { ids.removeAll { $0 == group.id } } else { ids.append(group.id) }
            Task { await model.updateCalendarPreferences(["collapsedGroupIds": .array(ids.map(JSONValue.string))]) }
        } label: {
            HStack(spacing: 9) {
                Image(systemName: collapsed ? "chevron.right" : "chevron.down").font(.system(size: 10, weight: .bold))
                Circle().fill(groupTint(group)).frame(width: 8, height: 8)
                Text(group.title).font(.system(size: 12, weight: .semibold))
                Text("\(group.items.count)").font(.system(size: 10, design: .monospaced)).foregroundStyle(iTuTheme.inkFaint)
                Spacer()
            }
            .foregroundStyle(iTuTheme.ink).padding(.horizontal, 14).frame(height: 34)
            .background(iTuTheme.surface)
            .overlay(alignment: .bottom) { Rectangle().fill(iTuTheme.border).frame(height: 1) }
        }
        .buttonStyle(.plain).accessibilityLabel("\(group.title) group").accessibilityValue(collapsed ? "Collapsed" : "Expanded")
    }

    private func groupRow(_ group: CalendarGroup, slots: [CalendarSlot], width: CGFloat) -> some View {
        let timedItems = group.items.filter { !$0.allDay }
        let (timedTops, rowHeight) = computeDynamicItemTops(items: timedItems, zoom: zoom, rangeFrom: range.from)
        return ScrollView(.horizontal, showsIndicators: true) {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(group.title).font(.system(size: 11, weight: .semibold)).foregroundStyle(iTuTheme.ink)
                    Text("\(group.items.count) items").font(.system(size: 10, design: .monospaced)).foregroundStyle(iTuTheme.inkFaint)
                }
                .padding(.horizontal, 14).frame(width: 142, height: rowHeight, alignment: .leading)
                .background(iTuTheme.surface)
                .overlay(alignment: .trailing) { Rectangle().fill(iTuTheme.border).frame(width: 1) }
                ZStack(alignment: .topLeading) {
                    gridLines(slots: slots, height: rowHeight)
                    ForEach(group.items) { item in timelineItem(item, slots: slots, topY: timedTops[item.id] ?? 10) }
                }
                .frame(width: width, height: rowHeight, alignment: .topLeading)
            }
            .frame(width: 142 + width, alignment: .leading)
        }
        .frame(height: rowHeight)
        .background(iTuTheme.surfaceMuted)
        .onDrop(of: [UTType.text], isTargeted: nil) { providers, location in
            guard let provider = providers.first else { return false }
            provider.loadObject(ofClass: NSString.self) { object, _ in
                guard let id = object as? NSString else { return }
                let taskID = String(id)
                let dropX = location.x - 142
                Task { @MainActor in scheduleTask(id: taskID, at: dropDate(x: dropX)) }
            }
            return true
        }
    }

    private func gridLines(slots: [CalendarSlot], height: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(slots) { slot in
                Rectangle().fill(slot.isToday ? iTuTheme.mintTint.opacity(0.7) : Color.clear)
                    .frame(width: zoom.slotWidth)
                    .overlay(alignment: .leading) { Rectangle().fill(iTuTheme.borderSoft).frame(width: 1) }
            }
        }
        .frame(height: height, alignment: .top)
        .overlay(alignment: .top) { Rectangle().fill(iTuTheme.borderSoft).frame(height: 1) }
    }

    private func timelineItem(_ item: CalendarItem, slots: [CalendarSlot], topY: CGFloat = 40) -> some View {
        let x = item.allDay ? 8 : xPosition(item.start)
        let width = itemWidth(item)
        let color = itemColor(item)
        let hasDuration = !item.allDay && item.end != nil
        let sameDay = hasDuration && Calendar.current.isDate(item.start, inSameDayAs: item.end!)

        let label = VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                if item.kind == "TASK_DUE" { Circle().fill(color).frame(width: 5, height: 5) }
                Text(item.title)
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            if !item.allDay {
                if let end = item.end {
                    if sameDay {
                        Text("\(formatSingleTime(item.start)) – \(formatSingleTime(end))")
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.75))
                            .lineLimit(1)
                    } else {
                        HStack(spacing: 4) {
                            Text(formatSingleTime(item.start))
                                .font(.system(size: 10, weight: .medium, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.75))
                                .lineLimit(1)
                            Spacer(minLength: 8)
                            Text(formatSingleTime(end))
                                .font(.system(size: 10, weight: .medium, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.75))
                                .lineLimit(1)
                        }
                    }
                } else {
                    Text(formatSingleTime(item.start))
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.75))
                        .lineLimit(1)
                }
            }
        }
        .padding(.leading, 12)
        .padding(.trailing, 10)
        .padding(.vertical, 6)
        .frame(width: width, height: item.allDay ? 26 : 48, alignment: .leading)
        .background(color.opacity(0.16))
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(color.opacity(0.4), lineWidth: 1) }
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(topLeadingRadius: 9, bottomLeadingRadius: 9, bottomTrailingRadius: 0, topTrailingRadius: 0)
                .fill(color)
                .frame(width: 3)
        }
        .shadow(color: .black.opacity(0.18), radius: 3, x: 0, y: 1)
        .contentShape(Rectangle())

        return Group {
            if item.readOnly {
                Button { detailItem = item } label: { label }
                    .buttonStyle(.plain).accessibilityLabel("\(item.title), read only")
            } else if let taskID = item.taskID {
                label
                    .onTapGesture { model.presentedOverlay = .taskEditor(taskID: taskID) }
                    .gesture(DragGesture(minimumDistance: 8).onEnded { value in
                        moveTask(id: taskID, by: horizontalDelta(value.translation.width))
                    })
                    .overlay(alignment: .leading) { resizeHandle(item, edge: .leading) }
                    .overlay(alignment: .trailing) { resizeHandle(item, edge: .trailing) }
                    .accessibilityAddTraits(.isButton)
                    .accessibilityLabel(item.title)
            }
        }
        .offset(x: x, y: item.allDay ? 8 : topY)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.16), value: x)
    }

    private func resizeHandle(_ item: CalendarItem, edge: HorizontalEdge) -> some View {
        Rectangle().fill(Color.clear).frame(width: 9, height: 36).contentShape(Rectangle())
            .highPriorityGesture(DragGesture(minimumDistance: 2).onEnded { value in
                resizeTask(item, edge: edge, by: horizontalDelta(value.translation.width))
            })
            .accessibilityLabel("Resize \(edge == .leading ? "start" : "end") of \(item.title)")
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
            Divider()
            Text("Connected sources are read-only and keep their source color.").font(.system(size: 10)).foregroundStyle(iTuTheme.inkFaint)
        }
        .padding(16).frame(width: 240).background(iTuTheme.surface)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "calendar.badge.clock").font(.system(size: 28)).foregroundStyle(iTuTheme.teal)
            Text("Nothing scheduled for this range").font(.system(size: 14, weight: .semibold))
            Text("Drop an unfinished task onto the timeline to give it a place.").font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
        }
    }

    private func detailCard(_ item: CalendarItem) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Label(item.kind == "FOCUS_SESSION" ? "Focus session" : item.sourceName ?? "Calendar subscription",
                      systemImage: item.kind == "FOCUS_SESSION" ? "timer" : "calendar")
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(itemColor(item))
                Text(item.title).font(.system(size: 15, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 10)

            Divider().padding(.horizontal, 14)

            // When row
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "clock").font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim).frame(width: 14)
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.start.formatted(.dateTime.weekday(.wide).month(.wide).day())).font(.system(size: 12, weight: .medium))
                    if item.allDay {
                        Text("All day").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                    } else {
                        let endStr = (item.end ?? item.start)
                        HStack(spacing: 0) {
                            Text("\(formatSingleTime(item.start)) – \(formatSingleTime(endStr))").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                            if let tz = item.timeZone, tz != TimeZone.current.identifier {
                                Text(tz).font(.system(size: 9, design: .monospaced)).foregroundStyle(iTuTheme.inkFaint)
                                    .padding(.horizontal, 4).padding(.vertical, 1)
                                    .background(iTuTheme.surfaceMuted).clipShape(RoundedRectangle(cornerRadius: 3))
                                    .padding(.leading, 5)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 8)

            // Location row
            if let loc = item.location, !loc.isEmpty {
                Divider().padding(.horizontal, 14)
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "mappin").font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim).frame(width: 14)
                    Text(loc).font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
            }

            // Description row
            if let desc = item.description, !desc.isEmpty {
                let lines = desc.components(separatedBy: CharacterSet.newlines)
                    .flatMap { $0.components(separatedBy: "\\n") }
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }
                if !lines.isEmpty {
                    Divider().padding(.horizontal, 14)
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "text.alignleft").font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim).frame(width: 14)
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                                Text(line).font(.system(size: 12)).foregroundStyle(iTuTheme.ink).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                }
            }

            Divider().padding(.horizontal, 14)

            // Footer
            Text("Read-only · synced from external calendar")
                .font(.system(size: 9, design: .monospaced)).foregroundStyle(iTuTheme.inkFaint)
                .padding(.horizontal, 14).padding(.vertical, 8)
        }
        .frame(width: 260, alignment: .leading).background(iTuTheme.surface)
    }

    private var arrangeableTasks: [ProductivityTask] {
        model.tasks.filter {
            ($0.status == .planned || $0.status == .inProgress) && $0.dueAt == nil && $0.scheduledStartAt == nil && $0.scheduledEndAt == nil && (arrangeSearch.isEmpty || $0.title.localizedCaseInsensitiveContains(arrangeSearch))
        }
    }

    private var rangeLabel: String {
        if zoom == .month { return range.from.formatted(.dateTime.month(.wide).year()) }
        if zoom == .day { return range.from.formatted(.dateTime.weekday(.wide).month(.abbreviated).day().year()) }
        let last = Calendar.current.date(byAdding: .day, value: -1, to: range.to) ?? range.to
        return "\(range.from.formatted(.dateTime.month(.abbreviated).day())) – \(last.formatted(.dateTime.month(.abbreviated).day().year()))"
    }

    private func taskGroupName(_ task: ProductivityTask) -> String {
        guard let id = task.taskListId, let list = model.taskLists.first(where: { $0.id == id }), !list.isDefault, list.name.lowercased() != "inbox" else { return "Inbox" }
        return list.name
    }

    private func taskGroupID(_ task: ProductivityTask) -> String {
        guard let id = task.taskListId, let list = model.taskLists.first(where: { $0.id == id }), !list.isDefault, list.name.lowercased() != "inbox" else { return "project:inbox" }
        return "project:\(id)"
    }

    private func taskGroupColor(_ task: ProductivityTask) -> String? {
        guard let id = task.taskListId else { return nil }
        return model.taskLists.first(where: { $0.id == id })?.color
    }

    private func groupTint(_ group: CalendarGroup) -> Color {
        if group.id == "focus" { return Color(hex: 0x8B6FC9) }
        if group.id == "project:inbox" { return iTuTheme.teal }
        return iTuTheme.mint
    }

    private func itemColor(_ item: CalendarItem) -> Color {
        if let value = item.color {
            if let hex = UInt32(value.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) { return Color(hex: hex) }
            switch value.uppercased() {
            case "TEAL": return iTuTheme.teal
            case "MINT": return iTuTheme.mint
            case "AMBER": return iTuTheme.amber
            case "CORAL": return iTuTheme.coral
            case "BLUE": return iTuTheme.syncBlue
            case "VIOLET": return Color(hex: 0x8B6FC9)
            case "ROSE": return Color(hex: 0xE11D48)
            case "EMERALD": return Color(hex: 0x059669)
            case "INDIGO": return iTuTheme.syncBlue
            case "SLATE": return iTuTheme.inkDim
            default: break
            }
        }
        switch item.kind { case "FOCUS_SESSION": return Color(hex: 0x8B6FC9); case "TASK_DUE": return iTuTheme.amber; default: return iTuTheme.teal }
    }

    private func xPosition(_ date: Date) -> CGFloat {
        let elapsed = date.timeIntervalSince(range.from)
        if zoom == .day { return CGFloat(max(0, elapsed / 3_600)) * zoom.slotWidth }
        let days = max(0, Calendar.current.dateComponents([.day], from: range.from, to: date).day ?? 0)
        return CGFloat(days) * zoom.slotWidth
    }

    private func itemWidth(_ item: CalendarItem) -> CGFloat {
        if item.kind == "TASK_DUE" || item.allDay { return max(26, zoom.slotWidth - 12) }
        if zoom == .day { return max(44, CGFloat(max(0.25, (item.end ?? item.start.addingTimeInterval(1800)).timeIntervalSince(item.start) / 3_600)) * zoom.slotWidth) }
        let days = max(1, Calendar.current.dateComponents([.day], from: item.start, to: item.end ?? item.start).day ?? 1)
        return max(54, CGFloat(days) * zoom.slotWidth - 12)
    }

    private func itemDuration(_ item: CalendarItem) -> CGFloat { max(0.25, CGFloat((item.end ?? item.start.addingTimeInterval(1800)).timeIntervalSince(item.start) / 3_600)) }
    private func horizontalDelta(_ points: CGFloat) -> TimeInterval { TimeInterval(points / zoom.slotWidth) * (zoom == .day ? 3_600 : 86_400) }

    private func dropDate(x: CGFloat) -> Date {
        let offset = max(0, x) / zoom.slotWidth
        let date = range.from.addingTimeInterval(offset * (zoom == .day ? 3_600 : 86_400))
        let interval: TimeInterval = zoom == .day ? 900 : zoom == .week ? 3_600 : 86_400
        return Date(timeIntervalSince1970: (date.timeIntervalSince1970 / interval).rounded() * interval)
    }

    private func move(_ direction: Int) {
        let component: Calendar.Component = zoom == .month ? .month : .day
        let amount = zoom == .month ? direction : direction * zoom.stepDays
        anchor = Calendar.current.date(byAdding: component, value: amount, to: anchor) ?? anchor
    }

    private func loadTimeline() async {
        await model.loadFocus()
        externalItems = (try? await model.apiClient.fetchCalendarTimeline(from: range.from, to: range.to)) ?? []
    }

    private func updateVisibleKind(_ kind: String, visible: Bool) {
        var kinds = model.calendarPreferences.visibleKinds
        if visible { if !kinds.contains(kind) { kinds.append(kind) } } else { kinds.removeAll { $0 == kind } }
        Task { await model.updateCalendarPreferences(["visibleKinds": .array(kinds.map(JSONValue.string))]) }
    }

    private func moveTask(id: String, by seconds: TimeInterval) {
        guard let task = model.tasks.first(where: { $0.id == id }) else { return }
        let formatter = ISO8601DateFormatter()
        if let start = task.scheduledStartAt.flatMap(iTuDateSupport.parse), let end = task.scheduledEndAt.flatMap(iTuDateSupport.parse) {
            let nextStart = snapped(start.addingTimeInterval(seconds)); let delta = nextStart.timeIntervalSince(start)
            Task { await model.updateTaskSchedule(task, dueAt: task.dueAt, scheduledStartAt: formatter.string(from: nextStart), scheduledEndAt: formatter.string(from: end.addingTimeInterval(delta))) }
        } else if let due = task.dueAt.flatMap(iTuDateSupport.parse) {
            let next = Calendar.current.date(bySettingHour: 21, minute: 0, second: 0, of: snapped(due.addingTimeInterval(seconds))) ?? due
            Task { await model.updateTaskSchedule(task, dueAt: formatter.string(from: next), scheduledStartAt: nil, scheduledEndAt: nil) }
        }
    }

    private func resizeTask(_ item: CalendarItem, edge: HorizontalEdge, by seconds: TimeInterval) {
        guard let id = item.taskID, let task = model.tasks.first(where: { $0.id == id }), let start = task.scheduledStartAt.flatMap(iTuDateSupport.parse), let end = task.scheduledEndAt.flatMap(iTuDateSupport.parse) else { return }
        let formatter = ISO8601DateFormatter()
        if edge == .leading {
            let next = min(snapped(start.addingTimeInterval(seconds)), end.addingTimeInterval(-900))
            Task { await model.updateTaskSchedule(task, dueAt: task.dueAt, scheduledStartAt: formatter.string(from: next), scheduledEndAt: formatter.string(from: end)) }
        } else {
            let next = max(snapped(end.addingTimeInterval(seconds)), start.addingTimeInterval(900))
            Task { await model.updateTaskSchedule(task, dueAt: task.dueAt, scheduledStartAt: formatter.string(from: start), scheduledEndAt: formatter.string(from: next)) }
        }
    }

    private func scheduleTask(id: String, at date: Date) {
        guard let task = model.tasks.first(where: { $0.id == id }) else { return }
        let formatter = ISO8601DateFormatter()
        let next = snapped(date)
        if let start = task.scheduledStartAt.flatMap(iTuDateSupport.parse), let end = task.scheduledEndAt.flatMap(iTuDateSupport.parse) {
            let delta = next.timeIntervalSince(start)
            Task { await model.updateTaskSchedule(task, dueAt: task.dueAt, scheduledStartAt: formatter.string(from: next), scheduledEndAt: formatter.string(from: end.addingTimeInterval(delta))) }
        } else {
            let due = Calendar.current.date(bySettingHour: 21, minute: 0, second: 0, of: next) ?? next
            Task { await model.updateTaskSchedule(task, dueAt: formatter.string(from: due), scheduledStartAt: nil, scheduledEndAt: nil) }
        }
    }

    private func snapped(_ date: Date) -> Date {
        let interval: TimeInterval = zoom == .day ? 900 : zoom == .week ? 3_600 : 86_400
        return Date(timeIntervalSince1970: (date.timeIntervalSince1970 / interval).rounded() * interval)
    }
}

private func calendarOverlapLanes(_ items: [CalendarItem], zoom: CalendarZoom, rangeFrom: Date) -> [Int] {
    func itemBounds(_ item: CalendarItem) -> (left: CGFloat, right: CGFloat) {
        let elapsed = item.start.timeIntervalSince(rangeFrom)
        let left: CGFloat
        let width: CGFloat
        if zoom == .day {
            left = CGFloat(max(0, elapsed / 3_600)) * zoom.slotWidth
            let durationHours = max(0.25, CGFloat((item.end ?? item.start.addingTimeInterval(1800)).timeIntervalSince(item.start) / 3_600))
            width = max(64, durationHours * zoom.slotWidth)
        } else {
            let days = max(0, Calendar.current.dateComponents([.day], from: rangeFrom, to: item.start).day ?? 0)
            left = CGFloat(days) * zoom.slotWidth
            let spanDays = max(1, Calendar.current.dateComponents([.day], from: item.start, to: item.end ?? item.start).day ?? 1)
            width = max(54, CGFloat(spanDays) * zoom.slotWidth - 12)
        }
        return (left, left + width)
    }

    let minHorizontalGap: CGFloat = 0
    let bounds = items.map(itemBounds)
    let sortedIndices = items.indices.sorted { lhs, rhs in
        if bounds[lhs].left != bounds[rhs].left { return bounds[lhs].left < bounds[rhs].left }
        return bounds[lhs].right < bounds[rhs].right
    }

    var lanes = Array(repeating: 0, count: items.count)
    var laneEndsX: [CGFloat] = []

    for index in sortedIndices {
        let rect = bounds[index]
        if let lane = laneEndsX.firstIndex(where: { $0 + minHorizontalGap <= rect.left }) {
            laneEndsX[lane] = rect.right
            lanes[index] = lane
        } else {
            lanes[index] = laneEndsX.count
            laneEndsX.append(rect.right)
        }
    }
    return lanes
}

private func computeDynamicItemTops(
    items: [CalendarItem],
    zoom: CalendarZoom,
    rangeFrom: Date,
    baseTop: CGFloat = 10,
    gap: CGFloat = 7
) -> (tops: [String: CGFloat], rowHeight: CGFloat) {
    func itemRect(_ item: CalendarItem) -> (left: CGFloat, right: CGFloat, height: CGFloat) {
        let elapsed = item.start.timeIntervalSince(rangeFrom)
        let left: CGFloat
        let width: CGFloat
        if zoom == .day {
            left = CGFloat(max(0, elapsed / 3_600)) * zoom.slotWidth
            let durationHours = max(0.25, CGFloat((item.end ?? item.start.addingTimeInterval(1800)).timeIntervalSince(item.start) / 3_600))
            width = max(64, durationHours * zoom.slotWidth)
        } else {
            let days = max(0, Calendar.current.dateComponents([.day], from: rangeFrom, to: item.start).day ?? 0)
            left = CGFloat(days) * zoom.slotWidth
            let spanDays = max(1, Calendar.current.dateComponents([.day], from: item.start, to: item.end ?? item.start).day ?? 1)
            width = max(54, CGFloat(spanDays) * zoom.slotWidth - 12)
        }
        let height: CGFloat = item.allDay ? 26 : 48
        return (left, left + width, height)
    }

    let rects = items.map(itemRect)
    let lanes = calendarOverlapLanes(items, zoom: zoom, rangeFrom: rangeFrom)
    let count = items.count
    var itemTops = Array(repeating: baseTop, count: count)

    let sortedIndices = items.indices.sorted { lanes[$0] < lanes[$1] }

    for i in sortedIndices {
        let laneI = lanes[i]
        let rectI = rects[i]
        var maxY = baseTop
        for j in 0..<count {
            if lanes[j] < laneI {
                let rectJ = rects[j]
                if rectI.left < rectJ.right && rectI.right > rectJ.left {
                    let bottomJ = itemTops[j] + rectJ.height + gap
                    if bottomJ > maxY { maxY = bottomJ }
                }
            }
        }
        itemTops[i] = maxY
    }

    var dict: [String: CGFloat] = [:]
    var maxBottom: CGFloat = baseTop
    for (index, item) in items.enumerated() {
        dict[item.id] = itemTops[index]
        let bottom = itemTops[index] + rects[index].height
        if bottom > maxBottom { maxBottom = bottom }
    }
    let calculatedRowHeight = max(90, maxBottom + 16)
    return (dict, calculatedRowHeight)
}

private enum CalendarZoom: String, CaseIterable, Identifiable {
    case day = "DAY", week = "WEEK", month = "MONTH"
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var stepDays: Int { self == .day ? 1 : 7 }
    var slotWidth: CGFloat { self == .day ? 72 : self == .week ? 150 : 58 }
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
    func slots(in range: (from: Date, to: Date)) -> [CalendarSlot] {
        if self == .day { return (0..<24).map { index in CalendarSlot(id: index, date: Calendar.current.date(byAdding: .hour, value: index, to: range.from) ?? range.from, title: Calendar.current.date(byAdding: .hour, value: index, to: range.from)?.formatted(.dateTime.hour()) ?? "", isToday: true) } }
        let count = Calendar.current.dateComponents([.day], from: range.from, to: range.to).day ?? 1
        return (0..<max(1, count)).map { index in
            let date = Calendar.current.date(byAdding: .day, value: index, to: range.from) ?? range.from
            return CalendarSlot(id: index, date: date, title: date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()), isToday: Calendar.current.isDateInToday(date))
        }
    }
}

private struct CalendarSlot: Identifiable { let id: Int; let date: Date; let title: String; let isToday: Bool }
private struct CalendarGroup: Identifiable { let id: String; let title: String; var items: [CalendarItem] = [] }
private struct CalendarItem: Identifiable {
    let id: String; let title: String; let start: Date; let end: Date?; let kind: String; let taskID: String?; let readOnly: Bool; let allDay: Bool; let sourceID: String?; let sourceName: String?; let color: String?; let priority: String?
    var description: String? = nil
    var location: String? = nil
    var timeZone: String? = nil
}
private enum CalendarKind: String, CaseIterable, Identifiable {
    case taskDuration = "TASK_DURATION", taskDue = "TASK_DUE", focus = "FOCUS_SESSION", external = "EXTERNAL_EVENT"
    var id: String { rawValue }
    var title: String { switch self { case .taskDuration: "Tasks"; case .taskDue: "Due Dates"; case .focus: "Focus Sessions"; case .external: "External Events" } }
}

private func formatSingleTime(_ date: Date) -> String {
    let cal = Calendar.current
    let components = cal.dateComponents([.hour, .minute], from: date)
    let hour = components.hour ?? 0
    let min = components.minute ?? 0
    let ampm = hour >= 12 ? "PM" : "AM"
    let formattedHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour)
    return String(format: "%d:%02d %@", formattedHour, min, ampm)
}
