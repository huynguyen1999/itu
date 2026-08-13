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
