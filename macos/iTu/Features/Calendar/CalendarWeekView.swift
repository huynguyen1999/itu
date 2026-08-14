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
                    description: item.description, location: item.location, timeZone: item.timeZone,
                    status: item.status
                )
            }
            return item
        }
    }

    private let allDayCardHeight: CGFloat = 46
    private let allDayGap: CGFloat = 4
    private let allDayPadding: CGFloat = 6

    var body: some View {
        let projection = CalendarWeekProjection.build(days: days, items: effectiveItems)

        let totalGridHeight = 24 * hourHeight
        let canvasWidth = CGFloat(days.count) * dayColumnWidth
        let totalWidth = rulerWidth + canvasWidth
        let isAnyToday = days.contains { Calendar.current.isDateInToday($0) }

        ScrollView([.horizontal], showsIndicators: true) {
            VStack(alignment: .leading, spacing: 0) {
                // Sticky Weekday / Date Column Headers
                HStack(alignment: .center, spacing: 0) {
                    Text("TIME")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: rulerWidth, height: 50)
                        .background(iTuTheme.surfaceMuted)
                        .overlay(alignment: .trailing) {
                            Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
                        }
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
                        }

                    ForEach(days, id: \.self) { date in
                        CalendarDayHeaderView(date: date, columnWidth: dayColumnWidth)
                    }
                }
                .frame(width: totalWidth, alignment: .leading)
                .background(iTuTheme.surfaceMuted)

                // Sticky All-Day & Spanning Header Row
                if !projection.placedHeaders.isEmpty {
                    allDaySection(projection: projection, canvasWidth: canvasWidth)
                        .frame(width: totalWidth, alignment: .leading)
                }

                // Main Vertical 7-Column Schedule Canvas
                ScrollViewReader { proxy in
                    ScrollView([.vertical], showsIndicators: true) {
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

                                    let dayTimedItems = projection.timedItemsByDay[dayIdx]
                                    let placedItems = projection.placedItemsByDay[dayIdx]

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
                        .frame(width: totalWidth, height: totalGridHeight, alignment: .topLeading)
                    }
                    .onAppear {
                        let targetHour = isAnyToday ? max(0, Calendar.current.component(.hour, from: Date()) - 1) : 8
                        proxy.scrollTo(targetHour, anchor: .top)
                    }
                }
            }
            .frame(width: totalWidth)
        }
    }

    @ViewBuilder
    private func allDaySection(projection: CalendarWeekProjection, canvasWidth: CGFloat) -> some View {
        let rowCount = max(1, projection.maxHeaderRow)
        let contentHeight = CGFloat(rowCount) * allDayCardHeight + CGFloat(rowCount - 1) * allDayGap + (allDayPadding * 2)

        HStack(alignment: .top, spacing: 0) {
            // Left ALL-DAY gutter
            VStack(spacing: 4) {
                VStack(spacing: 0) {
                    Text("ALL-")
                    Text("DAY")
                }
                .font(.system(size: 8.5, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)
                .multilineTextAlignment(.center)

                Text("\(projection.placedHeaders.count)")
                    .font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(iTuTheme.teal.opacity(0.15))
                    .foregroundStyle(iTuTheme.teal)
                    .clipShape(Capsule())
            }
            .frame(width: rulerWidth, height: contentHeight)
            .background(iTuTheme.surfaceMuted)
            .overlay(alignment: .trailing) {
                Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
            }
            .overlay(alignment: .bottom) {
                Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
            }

            // 7-day all-day grid canvas
            ZStack(alignment: .topLeading) {
                // Day Column Backgrounds & Vertical Dividers
                HStack(spacing: 0) {
                    ForEach(days, id: \.self) { date in
                        let isToday = Calendar.current.isDateInToday(date)
                        VStack(spacing: 0) {
                            Spacer()
                        }
                        .frame(width: dayColumnWidth, height: contentHeight)
                        .background(isToday ? iTuTheme.mintTint.opacity(0.08) : iTuTheme.surface.opacity(0.5))
                        .overlay(alignment: .leading) {
                            Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
                        }
                    }
                }

                // Placed Header Items
                ForEach(projection.placedHeaders) { header in
                    let cardX = CGFloat(header.startDay) * dayColumnWidth + 2
                    let cardWidth = CGFloat(header.endDay - header.startDay + 1) * dayColumnWidth - 4
                    let cardY = allDayPadding + CGFloat(header.row) * (allDayCardHeight + allDayGap)

                    CalendarEventCard(
                        item: header.item,
                        density: .compact,
                        titleLineLimit: 1,
                        showsMetadata: true,
                        onSelect: { onSelect(header.item) }
                    )
                    .frame(width: cardWidth, height: allDayCardHeight)
                    .offset(x: cardX, y: cardY)
                }
            }
            .frame(width: canvasWidth, height: contentHeight, alignment: .topLeading)
            .overlay(alignment: .bottom) {
                Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
            }
        }
        .background(iTuTheme.surface)
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

private struct CalendarDayHeaderView: View {
    let date: Date
    let columnWidth: CGFloat

    var body: some View {
        let isToday = Calendar.current.isDateInToday(date)
        VStack(alignment: .leading, spacing: 2) {
            Text(formatWeekday(date))
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(isToday ? iTuTheme.teal : iTuTheme.inkDim)

            HStack(alignment: .center, spacing: 4) {
                Text("\(Calendar.current.component(.day, from: date))")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(isToday ? .white : iTuTheme.ink)
                    .frame(width: 22, height: 22)
                    .background(isToday ? Circle().fill(iTuTheme.teal) : nil)

                Text(formatMonth(date))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(isToday ? iTuTheme.teal : iTuTheme.inkDim)
            }
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(width: columnWidth, height: 50, alignment: .leading)
        .background(isToday ? iTuTheme.mintTint.opacity(0.12) : iTuTheme.surfaceMuted)
        .overlay(alignment: .leading) {
            Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(formatWeekday(date)), \(Calendar.current.component(.day, from: date)) \(formatMonth(date))\(isToday ? ", Today" : "")")
    }

    private func formatWeekday(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        return formatter.string(from: date).uppercased()
    }

    private func formatMonth(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM"
        return formatter.string(from: date)
    }
}
