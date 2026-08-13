import SwiftUI

struct CalendarMonthView: View {
    let anchor: Date
    let items: [CalendarItem]
    var onSelect: (CalendarItem) -> Void

    @State private var popoverDate: Date? = nil
    @State private var popoverItems: [CalendarItem] = []

    private let maxVisibleLanes = 3
    private let dayHeaderHeight: CGFloat = 26
    private let compactCardHeight: CGFloat = 28
    private let cardGap: CGFloat = 4

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
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .overlay(alignment: .leading) {
                                Rectangle().fill(iTuTheme.borderSoft).frame(width: 1)
                            }
                    }
                }
                .background(iTuTheme.surface)

                // Month Weeks Grid
                ForEach(weeks, id: \.self) { weekDays in
                    let weekStart = Calendar.current.startOfDay(for: weekDays[0])
                    let weekEnd = Calendar.current.date(byAdding: .day, value: 7, to: weekStart)!
                    let weekItems = items.filter { item in
                        let s = item.start
                        let e = item.end ?? s.addingTimeInterval(1800)
                        return s < weekEnd && e >= weekStart
                    }

                    ZStack(alignment: .topLeading) {
                        // 7 Day Cells Background
                        HStack(spacing: 0) {
                            ForEach(weekDays, id: \.self) { date in
                                let isToday = Calendar.current.isDateInToday(date)
                                let isCurrentMonth = Calendar.current.isDate(date, equalTo: anchor, toGranularity: .month)
                                let dayItems = weekItems.filter { itemSpansDay($0, day: date) }
                                let hiddenCount = max(0, dayItems.count - maxVisibleLanes)

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

                        // Compact Cards Layer
                        VStack(spacing: 0) {
                            Color.clear.frame(height: dayHeaderHeight)

                            HStack(spacing: 0) {
                                ForEach(weekDays, id: \.self) { date in
                                    let dayItems = weekItems.filter { itemSpansDay($0, day: date) }
                                    let visible = Array(dayItems.prefix(maxVisibleLanes))

                                    VStack(spacing: cardGap) {
                                        ForEach(visible) { item in
                                            CalendarEventCard(item: item, density: .compact, onSelect: { onSelect(item) })
                                                .frame(height: compactCardHeight)
                                        }
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.horizontal, 2)
                                    .frame(maxWidth: .infinity, alignment: .top)
                                }
                            }
                        }
                    }
                    .frame(minHeight: dayHeaderHeight + CGFloat(maxVisibleLanes) * (compactCardHeight + cardGap) + 12)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(iTuTheme.borderSoft).frame(height: 1)
                    }
                }
            }
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
    }

    private func itemSpansDay(_ item: CalendarItem, day: Date) -> Bool {
        let cal = Calendar.current
        let dayStart = cal.startOfDay(for: day)
        let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart)!
        let itemStart = item.start
        let itemEnd = item.end ?? itemStart.addingTimeInterval(1800)
        return itemStart < dayEnd && itemEnd >= dayStart
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }
}
