import Foundation

struct PlacedItemInfo: Sendable {
    let id: String
    let lane: Int
    let laneCount: Int
    let clusterID: Int
}

struct CalendarCollisionLayout {
    struct ItemBound {
        let id: String
        let start: Double
        let end: Double
    }

    /// Interval partitioning lane allocation algorithm matching Web implementation.
    /// Items are sorted by start time asc, then longer duration first (desc end time), then id.
    /// Touching boundaries (prev.end == current.start) do NOT overlap.
    static func calculate(items: [(id: String, startAt: Date, endAt: Date?)]) -> [String: PlacedItemInfo] {
        guard !items.isEmpty else { return [:] }

        let bounds = items.map { item -> ItemBound in
            let s = item.startAt.timeIntervalSince1970
            let e = item.endAt?.timeIntervalSince1970 ?? (s + 1800)
            return ItemBound(id: item.id, start: s, end: max(s + 900, e))
        }

        let sorted = bounds.sorted { a, b in
            if a.start != b.start { return a.start < b.start }
            if a.end != b.end { return a.end > b.end }
            return a.id < b.id
        }

        // Partition into independent overlap clusters
        var clusters: [[ItemBound]] = []
        var currentCluster: [ItemBound] = []
        var clusterMaxEnd: Double = -.infinity

        for entry in sorted {
            if currentCluster.isEmpty {
                currentCluster.append(entry)
                clusterMaxEnd = entry.end
            } else if entry.start < clusterMaxEnd {
                currentCluster.append(entry)
                clusterMaxEnd = max(clusterMaxEnd, entry.end)
            } else {
                clusters.append(currentCluster)
                currentCluster = [entry]
                clusterMaxEnd = entry.end
            }
        }
        if !currentCluster.isEmpty {
            clusters.append(currentCluster)
        }

        var result: [String: PlacedItemInfo] = [:]

        for (clusterID, cluster) in clusters.enumerated() {
            var laneEnds: [Double] = []

            for entry in cluster {
                var assignedLane = -1
                for (l, laneEnd) in laneEnds.enumerated() {
                    if laneEnd <= entry.start {
                        assignedLane = l
                        laneEnds[l] = entry.end
                        break
                    }
                }
                if assignedLane < 0 {
                    assignedLane = laneEnds.count
                    laneEnds.append(entry.end)
                }

                result[entry.id] = PlacedItemInfo(
                    id: entry.id,
                    lane: assignedLane,
                    laneCount: 1, // Will update with cluster max lane count
                    clusterID: clusterID
                )
            }

            let maxLanes = laneEnds.count
            for entry in cluster {
                if let existing = result[entry.id] {
                    result[entry.id] = PlacedItemInfo(
                        id: existing.id,
                        lane: existing.lane,
                        laneCount: maxLanes,
                        clusterID: clusterID
                    )
                }
            }
        }

        return result
    }
}

struct PlacedHeaderItem: Identifiable, Sendable {
    let item: CalendarItem
    let startDay: Int
    let endDay: Int
    let span: Bool
    let row: Int

    var id: String { item.id }
}

struct CalendarWeekProjection: Sendable {
    let allDayOrSpanning: [CalendarItem]
    let placedHeaders: [PlacedHeaderItem]
    let maxHeaderRow: Int
    let timedItemsByDay: [[CalendarItem]]
    let placedItemsByDay: [[String: PlacedItemInfo]]

    static func build(days: [Date], items: [CalendarItem]) -> CalendarWeekProjection {
        let calendar = Calendar.current
        let bounds = days.map { day in
            let start = calendar.startOfDay(for: day)
            return (start, calendar.date(byAdding: .day, value: 1, to: start) ?? start)
        }
        var allDayOrSpanning: [CalendarItem] = []
        var rawHeaders: [(item: CalendarItem, startDay: Int, endDay: Int, span: Bool)] = []
        var timedItemsByDay = [[CalendarItem]](repeating: [], count: days.count)

        for item in items {
            let isSpanning = isMultiDaySpanning(item)
            if item.allDay || item.kind == "TASK_DUE" || isSpanning {
                allDayOrSpanning.append(item)

                // Calculate which days in the week this header item covers
                let itemStart = item.start
                let rawEnd = item.end ?? item.start
                let isMidnightEnd = calendar.component(.hour, from: rawEnd) == 0 &&
                                    calendar.component(.minute, from: rawEnd) == 0 &&
                                    calendar.component(.second, from: rawEnd) == 0 &&
                                    rawEnd > itemStart
                let effectiveEnd = isMidnightEnd ? rawEnd.addingTimeInterval(-1) : rawEnd

                var startDay = days.count
                for (index, bound) in bounds.enumerated() {
                    if itemStart < bound.1 {
                        startDay = index
                        break
                    }
                }

                var endDay = -1
                for (index, bound) in bounds.enumerated().reversed() {
                    if effectiveEnd >= bound.0 {
                        endDay = index
                        break
                    }
                }

                let clampedStart = max(0, startDay)
                let clampedEnd = min(days.count - 1, endDay)

                if clampedStart <= clampedEnd && clampedStart < days.count && clampedEnd >= 0 {
                    let span = clampedEnd > clampedStart || isSpanning
                    rawHeaders.append((item: item, startDay: clampedStart, endDay: clampedEnd, span: span))
                }
                continue
            }

            let itemEnd = item.end ?? item.start.addingTimeInterval(1800)
            for (index, bound) in bounds.enumerated() where item.start < bound.1 && itemEnd >= bound.0 {
                timedItemsByDay[index].append(item)
            }
        }

        // Sort headers by start day asc, then wider span desc, then title/id
        let sortedHeaders = rawHeaders.sorted { a, b in
            if a.startDay != b.startDay { return a.startDay < b.startDay }
            let spanA = a.endDay - a.startDay
            let spanB = b.endDay - b.startDay
            if spanA != spanB { return spanA > spanB }
            return a.item.id < b.item.id
        }

        // Row allocation with occupancy grid
        var occupancy: [[Bool]] = Array(repeating: [], count: days.count)
        var placedHeaders: [PlacedHeaderItem] = []
        var maxRow = 0

        for entry in sortedHeaders {
            var row = 0
            while (entry.startDay...entry.endDay).contains(where: { day in
                row < occupancy[day].count && occupancy[day][row]
            }) {
                row += 1
            }

            for day in entry.startDay...entry.endDay {
                while occupancy[day].count <= row {
                    occupancy[day].append(false)
                }
                occupancy[day][row] = true
            }

            placedHeaders.append(
                PlacedHeaderItem(
                    item: entry.item,
                    startDay: entry.startDay,
                    endDay: entry.endDay,
                    span: entry.span,
                    row: row
                )
            )
            maxRow = max(maxRow, row + 1)
        }

        let placedItemsByDay = timedItemsByDay.map { dayItems in
            CalendarCollisionLayout.calculate(
                items: dayItems.map { (id: $0.id, startAt: $0.start, endAt: $0.end) }
            )
        }
        return CalendarWeekProjection(
            allDayOrSpanning: allDayOrSpanning,
            placedHeaders: placedHeaders,
            maxHeaderRow: maxRow,
            timedItemsByDay: timedItemsByDay,
            placedItemsByDay: placedItemsByDay
        )
    }

    private static func isMultiDaySpanning(_ item: CalendarItem) -> Bool {
        guard let end = item.end else { return false }
        return !Calendar.current.isDate(item.start, inSameDayAs: end)
    }
}
