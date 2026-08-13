import SwiftUI

struct CalendarMonthView: View {
    let anchor: Date
    let items: [CalendarItem]
    var onSelect: (CalendarItem) -> Void

    @State private var popoverDate: Date? = nil
    @State private var popoverItems: [CalendarItem] = []

    private let maxVisibleLanes = 3
    private let dayHeaderHeight: CGFloat = 30
    private let compactCardHeight: CGFloat = 28
    private let cardGap: CGFloat = 4

    private struct MonthSegment: Identifiable {
        let item: CalendarItem
        let dayStart: Int
        let dayEnd: Int
        let lane: Int
        var id: String { item.id }
    }

    private var weeks: [[Date]] {
        let cal = Calendar.current
        let monthRange = cal.range(of: .day, in: .month, for: anchor)!
        let comp = cal.dateComponents([.year, .month], from: anchor)
        let firstOfMonth = cal.date(from: comp)!
        let firstWeekday = cal.component(.weekday, from: firstOfMonth)
        let offset = (firstWeekday - 1) // 0-based offset for Sunday start

        var days: [Date] = []
        for i in 0..<(offset + monthRange.count) {
            if let date = cal.date(byAdding: .day, value: i - offset, to: firstOfMonth) {
                days.append(date)
            }
        }
        // Pad to full week multiple (35 or 42)
        while days.count % 7 != 0 {
            if let last = days.last, let next = cal.date(byAdding: .day, value: 1, to: last) {
                days.append(next)
            }
        }

        var result: [[Date]] = []
        for chunk in stride(from: 0, to: days.count, by: 7) {
            result.append(Array(days[chunk..<min(chunk + 7, days.count)]))
        }
        return result
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: true) {
            VStack(spacing: 0) {
                // Month Weekday Header
                HStack(spacing: 0) {
                    ForEach(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], id: \.self) { day in
                        Text(day)
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 10)
                            .frame(height: 34, alignment: .center)
                            .overlay(alignment: .leading) {
                                Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
                            }
                    }
                }
                .background(iTuTheme.surfaceMuted)

                // Month Weeks Grid
                ForEach(weeks, id: \.self) { weekDays in
                    let weekStart = Calendar.current.startOfDay(for: weekDays[0])
                    let weekItems = items.filter { item in
                        weekDays.contains { itemSpansDay(item, day: $0) }
                    }
                    let segments = monthSegments(for: weekItems, weekStart: weekStart)

                    ZStack(alignment: .topLeading) {
                        // 7 Day Cells Background
                        HStack(spacing: 0) {
                            ForEach(weekDays, id: \.self) { date in
                                let isToday = Calendar.current.isDateInToday(date)
                                let isCurrentMonth = Calendar.current.isDate(date, equalTo: anchor, toGranularity: .month)
                                let dayItems = weekItems.filter { itemSpansDay($0, day: date) }
                                let hiddenCount = segments.filter { $0.lane >= maxVisibleLanes && $0.dayStart <= weekDays.firstIndex(of: date)! && $0.dayEnd > weekDays.firstIndex(of: date)! }.count

                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text("\(Calendar.current.component(.day, from: date))")
                                            .font(.system(size: 11, weight: .semibold))
                                            .foregroundStyle(isToday ? .white : (isCurrentMonth ? iTuTheme.ink : iTuTheme.inkFaint))
                                            .padding(3)
                                            .background(isToday ? Circle().fill(iTuTheme.teal) : nil)

                                        Spacer()

                                        if hiddenCount > 0 {
                                            Button("+\(hiddenCount) more") {
                                                popoverDate = date
                                                popoverItems = dayItems
                                            }
                                            .buttonStyle(.plain)
                                            .font(.system(size: 9, weight: .semibold, design: .monospaced))
                                            .foregroundStyle(iTuTheme.teal)
                                        }
                                    }
                                    .frame(height: dayHeaderHeight)

                                    Spacer()
                                }
                                .padding(4)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(isToday ? iTuTheme.mintTint.opacity(0.15) : (isCurrentMonth ? iTuTheme.surface : iTuTheme.surfaceMuted))
                                .overlay(alignment: .leading) {
                                    Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
                                }
                            }
                        }

                        GeometryReader { geometry in
                            ForEach(segments.filter { $0.lane < maxVisibleLanes }) { segment in
                                let width = geometry.size.width * CGFloat(segment.dayEnd - segment.dayStart) / 7
                                let x = geometry.size.width * CGFloat(segment.dayStart) / 7
                                CalendarEventCard(
                                    item: segment.item,
                                    density: .compact,
                                    showsMetadata: false,
                                    onSelect: { onSelect(segment.item) }
                                )
                                .frame(width: width - 4, height: compactCardHeight)
                                .position(x: x + width / 2, y: dayHeaderHeight + CGFloat(segment.lane) * (compactCardHeight + cardGap) + compactCardHeight / 2)
                            }
                        }
                    }
                    .frame(minHeight: dayHeaderHeight + CGFloat(maxVisibleLanes) * (compactCardHeight + cardGap) + 12)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .popover(isPresented: Binding(get: { popoverDate != nil }, set: { if !$0 { popoverDate = nil } })) {
            if let popoverDate {
                VStack(alignment: .leading, spacing: 8) {
                    Text(formatDate(popoverDate))
                        .font(.system(size: 13, weight: .bold))

                    ScrollView {
                        VStack(spacing: 6) {
                            ForEach(popoverItems) { item in
                                CalendarEventCard(item: item, density: .compact, onSelect: {
                                    self.popoverDate = nil
                                    onSelect(item)
                                })
                            }
                        }
                    }
                }
                .padding(12)
                .frame(width: 260, height: 280)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func itemSpansDay(_ item: CalendarItem, day: Date) -> Bool {
        let cal = Calendar.current
        let dayStart = cal.startOfDay(for: day)
        let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart)!
        let itemStart = item.start
        let itemEnd = item.end ?? itemStart.addingTimeInterval(1800)
        return itemStart < dayEnd && itemEnd > dayStart
    }

    private func monthSegments(for items: [CalendarItem], weekStart: Date) -> [MonthSegment] {
        let cal = Calendar.current
        let weekEnd = cal.date(byAdding: .day, value: 7, to: weekStart)!
        var lanes: [[Bool]] = []
        var segments: [MonthSegment] = []

        let ordered = items.sorted {
            let leftLength = spanLength($0, weekStart: weekStart, weekEnd: weekEnd)
            let rightLength = spanLength($1, weekStart: weekStart, weekEnd: weekEnd)
            return leftLength == rightLength ? $0.id < $1.id : leftLength > rightLength
        }

        for item in ordered {
            let (itemStart, itemEnd) = monthDayBounds(for: item)
            let start = max(weekStart, itemStart)
            let end = min(weekEnd, itemEnd)
            let dayStart = max(0, cal.dateComponents([.day], from: weekStart, to: start).day ?? 0)
            let dayEnd = min(7, max(dayStart + 1, cal.dateComponents([.day], from: weekStart, to: end).day ?? dayStart + 1))

            var lane = 0
            while lanes.indices.contains(lane) && (dayStart..<dayEnd).contains(where: { lanes[lane][$0] }) {
                lane += 1
            }
            if !lanes.indices.contains(lane) { lanes.append(Array(repeating: false, count: 7)) }
            for day in dayStart..<dayEnd { lanes[lane][day] = true }
            segments.append(MonthSegment(item: item, dayStart: dayStart, dayEnd: dayEnd, lane: lane))
        }
        return segments
    }

    private func spanLength(_ item: CalendarItem, weekStart: Date, weekEnd: Date) -> Int {
        let cal = Calendar.current
        let (itemStart, itemEnd) = monthDayBounds(for: item)
        let start = max(weekStart, itemStart)
        let end = min(weekEnd, itemEnd)
        return max(1, cal.dateComponents([.day], from: start, to: end).day ?? 1)
    }

    private func monthDayBounds(for item: CalendarItem) -> (Date, Date) {
        let cal = Calendar.current
        let start = cal.startOfDay(for: item.start)
        guard let end = item.end else {
            return (start, cal.date(byAdding: .day, value: 1, to: start)!)
        }
        let endDay = cal.startOfDay(for: end)
        let lastDay = end == endDay
            ? cal.date(byAdding: .day, value: -1, to: endDay)!
            : endDay
        return (start, cal.date(byAdding: .day, value: 1, to: max(start, lastDay))!)
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }
}
