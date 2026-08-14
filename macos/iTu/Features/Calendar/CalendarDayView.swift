import SwiftUI

struct CalendarDayView: View {
    let day: Date
    let items: [CalendarItem]
    var onSelect: (CalendarItem) -> Void
    var onScheduleUpdate: (String, Date, Date) -> Void

    @State private var resizingItemID: String? = nil
    @State private var resizingEdge: VerticalEdge? = nil
    @State private var previewStart: Date? = nil
    @State private var previewEnd: Date? = nil

    private let hourHeight: CGFloat = 60
    private let rulerWidth: CGFloat = 56

    private var dayStart: Date {
        Calendar.current.startOfDay(for: day)
    }

    private var dayEnd: Date {
        Calendar.current.date(byAdding: .day, value: 1, to: dayStart)!
    }

    private var isToday: Bool {
        Calendar.current.isDate(day, inSameDayAs: Date())
    }

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

    var body: some View {
        let dueTodayItems = effectiveItems.filter { $0.allDay || $0.kind == "TASK_DUE" }
        let timedItems = effectiveItems.filter { !$0.allDay && $0.kind != "TASK_DUE" }

        // Interval partitioning collision layout
        let collisionInput = timedItems.map { (id: $0.id, startAt: $0.start, endAt: $0.end) }
        let placedItems = CalendarCollisionLayout.calculate(items: collisionInput)
        let totalGridHeight = 24 * hourHeight

        VStack(spacing: 0) {
            // Day Header Axis
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

                dayHeader(date: day, isToday: isToday)
                    .frame(height: 50)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(isToday ? iTuTheme.mintTint.opacity(0.12) : iTuTheme.surfaceMuted)
                    .overlay(alignment: .leading) {
                        Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
                    }
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(formatWeekday(day)), \(Calendar.current.component(.day, from: day)) \(formatMonth(day)) \(formatYear(day))\(isToday ? ", Today" : "")")
            }
            .background(iTuTheme.surfaceMuted)

            // Due Today Strip
            if !dueTodayItems.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text("DUE TODAY")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("\(dueTodayItems.count)")
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(iTuTheme.teal.opacity(0.15))
                            .foregroundStyle(iTuTheme.teal)
                            .clipShape(Capsule())
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(dueTodayItems, id: \.id) { item in
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

            // Main Vertical Schedule Canvas
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: true) {
                    GeometryReader { geo in
                        let canvasWidth = max(200, geo.size.width - rulerWidth)

                        HStack(alignment: .top, spacing: 0) {
                            // Sticky Vertical Time Ruler
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

                            // Interactive Timeline Grid
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

                                // Current Time Line Indicator
                                if isToday {
                                    let nowMinutes = Calendar.current.component(.hour, from: Date()) * 60 + Calendar.current.component(.minute, from: Date())
                                    let nowTop = (CGFloat(nowMinutes) / 60.0) * hourHeight

                                    HStack(spacing: 0) {
                                        Circle()
                                            .fill(Color.red)
                                            .frame(width: 7, height: 7)
                                        Rectangle()
                                            .fill(Color.red)
                                            .frame(height: 1.5)
                                    }
                                    .offset(y: nowTop - 3.5)
                                }

                                // Timed Items placed side-by-side
                                ForEach(timedItems, id: \.id) { item in
                                    timedItemCell(item: item, info: placedItems[item.id], canvasWidth: canvasWidth)
                                }
                            }
                            .frame(width: canvasWidth, height: totalGridHeight, alignment: .topLeading)
                            .background(iTuTheme.surface.opacity(0.3))
                        }
                    }
                    .frame(height: totalGridHeight)
                }
                .onAppear {
                    let targetHour = isToday ? max(0, Calendar.current.component(.hour, from: Date()) - 1) : 8
                    proxy.scrollTo(targetHour, anchor: .top)
                }
            }
        }
    }

    @ViewBuilder
    private func timedItemCell(item: CalendarItem, info: PlacedItemInfo?, canvasWidth: CGFloat) -> some View {
        let lane = CGFloat(info?.lane ?? 0)
        let laneCount = CGFloat(max(1, info?.laneCount ?? 1))

        let effStart = max(dayStart, item.start)
        let effEnd = min(dayEnd, item.end ?? item.start.addingTimeInterval(1800))
        let startMinutes = effStart.timeIntervalSince(dayStart) / 60
        let durationMinutes = max(15, effEnd.timeIntervalSince(effStart) / 60)

        let top = (CGFloat(startMinutes) / 60.0) * hourHeight
        let height = max(22, (CGFloat(durationMinutes) / 60.0) * hourHeight)

        let cardWidth = max(40, (canvasWidth / laneCount) - 4)
        let x = (lane * (canvasWidth / laneCount)) + 2

        ZStack(alignment: .top) {
            CalendarEventCard(item: item, density: height < 36 ? .compact : .regular, onSelect: { onSelect(item) })
                .frame(width: cardWidth, height: height)

            // Vertical resize handles for editable task duration
            if !item.readOnly, item.kind == "TASK_DURATION", let taskID = item.taskID {
                VStack {
                    // Top Edge Handle (Start Time)
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

                    // Bottom Edge Handle (End Time)
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

            // Floating Tooltip during active drag
            if resizingItemID == item.id, let edge = resizingEdge, let pTime = edge == .top ? previewStart : previewEnd {
                Text(formatTime(pTime))
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(iTuTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .shadow(radius: 2)
                    .offset(y: edge == .top ? -20 : height - 10)
            }
        }
        .offset(x: x, y: top)
    }

    private func dayHeader(date: Date, isToday: Bool) -> some View {
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

                Text(formatYear(date))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
            }
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func formatWeekday(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return formatter.string(from: date).uppercased()
    }

    private func formatMonth(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM"
        return formatter.string(from: date)
    }

    private func formatYear(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy"
        return formatter.string(from: date)
    }

    private func formatHour(_ hour: Int) -> String {
        let h = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour)
        let ampm = hour < 12 ? "AM" : "PM"
        return "\(h) \(ampm)"
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
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

