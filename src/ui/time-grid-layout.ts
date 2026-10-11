/** A block on one day column of the time grid, in minutes from local midnight. */
export interface GridItem<T> {
  item: T;
  startMin: number;
  endMin: number;
}

export interface PlacedItem<T> extends GridItem<T> {
  /** Zero-based column inside its overlap cluster. */
  column: number;
  /** Columns in the cluster: the block is 1/columns wide. */
  columns: number;
}

/** Blocks shorter than this still get a clickable height. */
export const MIN_BLOCK_MINUTES = 20;

/**
 * Side-by-side layout for overlapping blocks: items that overlap (directly or
 * through a chain) form a cluster; each takes the first free column and the
 * cluster is split into as many columns as it needed.
 */
export function layoutDay<T>(items: GridItem<T>[]): PlacedItem<T>[] {
  const sorted = [...items]
    .map((entry) => ({
      ...entry,
      endMin: Math.max(entry.endMin, entry.startMin + MIN_BLOCK_MINUTES),
    }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const placed: PlacedItem<T>[] = [];
  let cluster: PlacedItem<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = (): void => {
    for (const entry of cluster) entry.columns = columnEnds.length;
    placed.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const entry of sorted) {
    if (entry.startMin >= clusterEnd && cluster.length > 0) closeCluster();
    let column = columnEnds.findIndex((end) => end <= entry.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(entry.endMin);
    } else {
      columnEnds[column] = entry.endMin;
    }
    cluster.push({ ...entry, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, entry.endMin);
  }
  if (cluster.length > 0) closeCluster();
  return placed;
}

/** Minutes from local midnight of `dayStart` (epoch ms), clamped to the day. */
export function minutesInDay(instant: number, dayStart: number): number {
  return Math.min(24 * 60, Math.max(0, Math.round((instant - dayStart) / 60_000)));
}
