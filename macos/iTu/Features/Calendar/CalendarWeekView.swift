import SwiftUI

struct CalendarWeekView: View {
    let days: [Date]
    let items: [CalendarItem]
    var onSelect: (CalendarItem) -> Void
    var onScheduleUpdate: ((String, Date, Date) -> Void)? = nil

    @State private var resizingItemID: String? = nil
    @State private var resizingEdge: VerticalEdge? = nil
    @State private var previewStart: Date? = nil
    @State private var previewEnd: Date? = nil

    private let hourHeight: CGFloat = 60
    private let rulerWidth: CGFloat = 56
    private let dayColumnWidth: CGFloat = 168

    private var effectiveItems: [CalendarItem] {
        guard let resizingItemID, let previewStart, let previewEnd else {
            return items
        }
        return items.map { item in
            if item.id == resizingItemID {
                return CalendarItem(
                    id: item.id, title: item.title, start: previewStart, end: previewEnd,
                    kind: item.kind, taskID: item.taskID, readOnly: item.readOnly,
                    allDay: item.allDay, dueAt: item.dueAt, sourceID: item.sourceID,
                    sourceName: item.sourceName, color: item.color, priority: item.priority,
                    description: item.description, location: item.location, timeZone: item.timeZone
                )
            }
            return item
        }
    }

    var body: some View {
        let allDayOrSpanning = effectiveItems.filter { item in
            item.allDay || item.kind == "TASK_DUE" || isMultiDaySpanning(item)
        }
        let timedItems = effectiveItems.filter { item in
            !item.allDay && item.kind != "TASK_DUE" && !isMultiDaySpanning(item)
        }

        let totalGridHeight = 24 * hourHeight
        let canvasWidth = CGFloat(days.count) * dayColumnWidth
        let isAnyToday = days.contains { Calendar.current.isDateInToday($0) }

        VStack(spacing: 0) {
            // All-day & Spanning Header Strip
            if !allDayOrSpanning.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text("ALL-DAY & SPANNING")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("\(allDayOrSpanning.count)")
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(iTuTheme.teal.opacity(0.15))
                            .foregroundStyle(iTuTheme.teal)
                            .clipShape(Capsule())
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(allDayOrSpanning, id: \.id) { item in
                                CalendarEventCard(item: item, density: .compact, onSelect: { onSelect(item) })
                                    .frame(width: 180, height: 38)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(iTuTheme.surface)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
                }
            }

            // Main Vertical 7-Column Schedule Canvas
            ScrollViewReader { proxy in
                ScrollView([.vertical, .horizontal], showsIndicators: true) {
                    HStack(alignment: .top, spacing: 0) {
                        // Sticky Time Ruler
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(0..<24, id: \.self) { hour in
                                VStack(alignment: .trailing, spacing: 0) {
                                    Text(formatHour(hour))
                                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                                        .foregroundStyle(iTuTheme.inkDim)
                                        .padding(.trailing, 8)
                                        .padding(.top, 2)
                                    Spacer(minLength: 0)
                                }
                                .frame(width: rulerWidth, height: hourHeight)
                                .id(hour)
                            }
                        }
                        .background(iTuTheme.surface.opacity(0.95))
                        .overlay(alignment: .trailing) {
                            Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
                        }

                        // 7 Day Columns Canvas
                        ZStack(alignment: .topLeading) {
                            // Hour and Half-Hour horizontal grid lines
                            VStack(spacing: 0) {
                                ForEach(0..<24, id: \.self) { _ in
                                    VStack(spacing: 0) {
                                        Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
                                        Spacer()
                                        Rectangle().fill(iTuTheme.borderSoft.opacity(0.4)).frame(height: 1)
                                        Spacer()
                                    }
                                    .frame(height: hourHeight)
                                }
                            }

                            // Day Column Backgrounds & Vertical Dividers
                            HStack(spacing: 0) {
                                ForEach(days, id: \.self) { date in
                                    let isToday = Calendar.current.isDateInToday(date)
                                    VStack(spacing: 0) {
                                        Spacer()
                                    }
                                    .frame(width: dayColumnWidth, height: totalGridHeight)
                                    .background(isToday ? iTuTheme.mintTint.opacity(0.08) : Color.clear)
                                    .overlay(alignment: .leading) {
                                        Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
                                    }
                                }
                            }

                            // Current Time Line Indicator for Today
                            if isAnyToday {
                                let cal = Calendar.current
                                if let todayIdx = days.firstIndex(where: { cal.isDateInToday($0) }) {
                                    let nowMinutes = cal.component(.hour, from: Date()) * 60 + cal.component(.minute, from: Date())
                                    let nowTop = (CGFloat(nowMinutes) / 60.0) * hourHeight
                                    let todayLeft = CGFloat(todayIdx) * dayColumnWidth

                                    HStack(spacing: 0) {
                                        Circle()
                                            .fill(Color.red)
                                            .frame(width: 7, height: 7)
                                        Rectangle()
                                            .fill(Color.red)
                                            .frame(height: 1.5)
                                    }
                                    .frame(width: dayColumnWidth)
                                    .offset(x: todayLeft, y: nowTop - 3.5)
                                }
                            }

                            // Timed Items placed per day column
                            ForEach(days.indices, id: \.self) { dayIdx in
                                let day = days[dayIdx]
                                let cal = Calendar.current
                                let dayStart = cal.startOfDay(for: day)
                                let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart)!

                                let dayTimedItems = timedItems.filter { item in
                                    let itemEnd = item.end ?? item.start.addingTimeInterval(1800)
                                    return item.start < dayEnd && itemEnd >= dayStart
                                }

                                let collisionInput = dayTimedItems.map { (id: $0.id, startAt: $0.start, endAt: $0.end) }
                                let placedItems = CalendarCollisionLayout.calculate(items: collisionInput)

                                ForEach(dayTimedItems, id: \.id) { item in
                                    timedItemCell(
                                        item: item,
                                        info: placedItems[item.id],
                                        dayStart: dayStart,
                                        dayEnd: dayEnd,
                                        dayLeft: CGFloat(dayIdx) * dayColumnWidth,
                                        columnWidth: dayColumnWidth
                                    )
                                }
                            }
                        }
                        .frame(width: canvasWidth, height: totalGridHeight, alignment: .topLeading)
                    }
                }
                .onAppear {
                    let targetHour = isAnyToday ? max(0, Calendar.current.component(.hour, from: Date()) - 1) : 8
                    proxy.scrollTo(targetHour, anchor: .top)
                }
            }
        }
    }

    @ViewBuilder
    private func timedItemCell(item: CalendarItem, info: PlacedItemInfo?, dayStart: Date, dayEnd: Date, dayLeft: CGFloat, columnWidth: CGFloat) -> some View {
        let lane = CGFloat(info?.lane ?? 0)
        let laneCount = CGFloat(max(1, info?.laneCount ?? 1))

        let effStart = max(dayStart, item.start)
        let effEnd = min(dayEnd, item.end ?? item.start.addingTimeInterval(1800))
        let startMinutes = effStart.timeIntervalSince(dayStart) / 60
        let durationMinutes = max(15, effEnd.timeIntervalSince(effStart) / 60)

        let top = (CGFloat(startMinutes) / 60.0) * hourHeight
        let height = max(22, (CGFloat(durationMinutes) / 60.0) * hourHeight)

        let cardWidth = max(30, (columnWidth / laneCount) - 4)
        let x = dayLeft + (lane * (columnWidth / laneCount)) + 2

        ZStack(alignment: .top) {
            CalendarEventCard(item: item, density: height < 36 ? .compact : .regular, onSelect: { onSelect(item) })
                .frame(width: cardWidth, height: height)

            // Resizing Handles if editable
            if let onScheduleUpdate, !item.readOnly, item.kind == "TASK_DURATION", let taskID = item.taskID {
                VStack {
                    Rectangle()
                        .fill(Color.clear)
                        .frame(width: cardWidth, height: 8)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 2)
                                .onChanged { value in
                                    let deltaMinutes = (value.translation.height / hourHeight) * 60
                                    let rawStart = item.start.addingTimeInterval(deltaMinutes * 60)
                                    let snapped = snapTo15Minutes(rawStart)
                                    let currentEnd = item.end ?? item.start.addingTimeInterval(1800)
                                    if snapped < currentEnd {
                                        resizingItemID = item.id
                                        resizingEdge = .top
                                        previewStart = snapped
                                        previewEnd = currentEnd
                                    }
                                }
                                .onEnded { _ in
                                    if let pStart = previewStart, let pEnd = previewEnd {
                                        onScheduleUpdate(taskID, pStart, pEnd)
                                    }
                                    resizingItemID = nil
                                    resizingEdge = nil
                                    previewStart = nil
                                    previewEnd = nil
                                }
                        )

                    Spacer()

                    Rectangle()
                        .fill(Color.clear)
                        .frame(width: cardWidth, height: 8)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 2)
                                .onChanged { value in
                                    let deltaMinutes = (value.translation.height / hourHeight) * 60
                                    let rawEnd = (item.end ?? item.start.addingTimeInterval(1800)).addingTimeInterval(deltaMinutes * 60)
                                    let snapped = snapTo15Minutes(rawEnd)
                                    if snapped > item.start {
                                        resizingItemID = item.id
                                        resizingEdge = .bottom
                                        previewStart = item.start
                                        previewEnd = snapped
                                    }
                                }
                                .onEnded { _ in
                                    if let pStart = previewStart, let pEnd = previewEnd {
                                        onScheduleUpdate(taskID, pStart, pEnd)
                                    }
                                    resizingItemID = nil
                                    resizingEdge = nil
                                    previewStart = nil
                                    previewEnd = nil
                                }
                        )
                }
                .frame(width: cardWidth, height: height)
            }
        }
        .offset(x: x, y: top)
    }

    private func isMultiDaySpanning(_ item: CalendarItem) -> Bool {
        guard let end = item.end else { return false }
        return !Calendar.current.isDate(item.start, inSameDayAs: end)
    }

    private func formatHour(_ hour: Int) -> String {
        let h = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour)
        let ampm = hour < 12 ? "AM" : "PM"
        return "\(h) \(ampm)"
    }

    private func snapTo15Minutes(_ date: Date) -> Date {
        let cal = Calendar.current
        let minutes = cal.component(.minute, from: date)
        let roundedMinutes = Int((Double(minutes) / 15.0).rounded()) * 15
        var components = cal.dateComponents([.year, .month, .day, .hour], from: date)
        components.minute = roundedMinutes
        components.second = 0
        return cal.date(from: components) ?? date
    }
}
