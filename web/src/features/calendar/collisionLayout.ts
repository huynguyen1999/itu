export interface CollisionItem {
  id: string;
  startAt: Date | string;
  endAt?: Date | string | null;
  left?: number;
  width?: number;
}

interface PlacedCollisionItem<T extends CollisionItem = CollisionItem> {
  item: T;
  lane: number;
  laneCount: number; // total concurrent lanes in this item's overlap cluster
  clusterId: number;
}

export interface DayCollisionResult<T extends CollisionItem = CollisionItem> {
  placedItems: Map<string, PlacedCollisionItem<T>>;
  clusterMaxLanes: Map<number, number>;
}

/**
 * Calculates collision lanes and overlap clusters using interval partitioning.
 * - Items with start/end bounds are clustered into overlapping groups.
 * - Within each cluster, items are assigned to the lowest available lane where prev.end <= current.start.
 * - Touching boundaries (prev.end === current.start) do NOT overlap.
 */
export function calculateDayCollisions<T extends CollisionItem>(
  items: T[],
  minHorizontalGap: number = 0,
): DayCollisionResult<T> {
  const placedItems = new Map<string, PlacedCollisionItem<T>>();
  const clusterMaxLanes = new Map<number, number>();

  if (items.length === 0) {
    return { placedItems, clusterMaxLanes };
  }

  // Calculate numeric start & end bounds for each item
  const itemBounds = items.map((item) => {
    let start: number;
    let end: number;
    if (item.left !== undefined && item.width !== undefined) {
      start = item.left;
      end = item.left + item.width;
    } else {
      start = new Date(item.startAt).getTime();
      const rawEnd = item.endAt ? new Date(item.endAt).getTime() : start + 30 * 60_000;
      end = Math.max(start + 15 * 60_000, rawEnd);
    }
    return { item, start, end };
  });

  // Sort items by start time asc, then longer duration first (desc end time), then id
  const sorted = [...itemBounds].sort(
    (a, b) => a.start - b.start || b.end - a.end || a.item.id.localeCompare(b.item.id),
  );

  // Partition into independent overlap clusters
  // Two items belong to the same cluster if they overlap (item2.start < clusterMaxEnd)
  const clusters: Array<typeof itemBounds> = [];
  let currentCluster: typeof itemBounds = [];
  let clusterMaxEnd = -Infinity;

  for (const entry of sorted) {
    if (currentCluster.length === 0) {
      currentCluster.push(entry);
      clusterMaxEnd = entry.end;
    } else if (entry.start < clusterMaxEnd - minHorizontalGap) {
      // Overlaps with current cluster
      currentCluster.push(entry);
      if (entry.end > clusterMaxEnd) {
        clusterMaxEnd = entry.end;
      }
    } else {
      // New cluster
      clusters.push(currentCluster);
      currentCluster = [entry];
      clusterMaxEnd = entry.end;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // Process each cluster independently
  clusters.forEach((cluster, clusterId) => {
    const laneEnds: number[] = [];

    cluster.forEach(({ item, start, end }) => {
      let assignedLane = -1;
      for (let l = 0; l < laneEnds.length; l += 1) {
        if (laneEnds[l] + minHorizontalGap <= start) {
          assignedLane = l;
          laneEnds[l] = end;
          break;
        }
      }
      if (assignedLane < 0) {
        assignedLane = laneEnds.length;
        laneEnds.push(end);
      }

      placedItems.set(item.id, {
        item,
        lane: assignedLane,
        laneCount: 1, // Will update with final cluster lane count
        clusterId,
      });
    });

    const maxLanes = laneEnds.length;
    clusterMaxLanes.set(clusterId, maxLanes);

    // Update laneCount for all items in this cluster
    cluster.forEach(({ item }) => {
      const existing = placedItems.get(item.id)!;
      placedItems.set(item.id, { ...existing, laneCount: maxLanes });
    });
  });

  return { placedItems, clusterMaxLanes };
}
