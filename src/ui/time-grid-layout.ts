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

const DAY_MINUTES = 24 * 60;

/** Blocks shorter than this still get a clickable height. */
export const MIN_BLOCK_MINUTES = 20;

/**
 * Side-by-side layout for overlapping blocks: items that overlap (directly or
 * through a chain) form a cluster; each takes the first free column and the
 * cluster is split into as many columns as it needed.
 */
export function layoutDay<T>(items: GridItem<T>[]): PlacedItem<T>[] {
  const sorted = [...items]
    .map((entry) => {
      // Keep a clickable height without running past midnight.
      const endMin = Math.min(DAY_MINUTES, Math.max(entry.endMin, entry.startMin + MIN_BLOCK_MINUTES));
      return { ...entry, startMin: Math.min(entry.startMin, endMin - MIN_BLOCK_MINUTES), endMin };
    })
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

/** Local wall-clock minutes since midnight. */
export function wallMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * The part of [start, end) drawn on `key`, in wall-clock minutes. Wall clock,
 * not elapsed time: on a 23 or 25 hour DST day a 10:00 meeting still sits on
 * the 10:00 line. Multi-day events clamp to the day's edges.
 */
export function spanOnDay(
  start: number,
  end: number,
  startDay: string,
  endDay: string,
  key: string,
): { startMin: number; endMin: number } {
  const startMin = startDay < key ? 0 : wallMinutes(new Date(start));
  let endMin = endDay > key ? DAY_MINUTES : wallMinutes(new Date(end));
  // Ending exactly at midnight means the end of this day, not its start.
  if (endMin === 0 && end > start) endMin = DAY_MINUTES;
  return { startMin, endMin: Math.max(startMin, endMin) };
}
