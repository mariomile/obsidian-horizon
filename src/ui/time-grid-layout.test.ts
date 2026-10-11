import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { layoutDay, spanOnDay, wallMinutes } from './time-grid-layout.ts';

const block = (id: string, startMin: number, endMin: number) => ({ item: id, startMin, endMin });

function summary(items: ReturnType<typeof layoutDay<string>>): string[] {
  return items.map((p) => `${p.item}:${p.column}/${p.columns}`);
}

describe('layoutDay', () => {
  it('keeps non-overlapping blocks full width', () => {
    assert.deepEqual(summary(layoutDay([block('a', 540, 600), block('b', 600, 660)])), [
      'a:0/1',
      'b:0/1',
    ]);
  });

  it('splits overlapping blocks into columns and reuses freed columns', () => {
    const placed = layoutDay([
      block('a', 540, 660),
      block('b', 570, 600),
      block('c', 600, 630),
      block('d', 700, 760),
    ]);
    assert.deepEqual(summary(placed), ['a:0/2', 'b:1/2', 'c:1/2', 'd:0/1']);
  });

  it('gives very short blocks a minimum height without passing midnight', () => {
    const [only] = layoutDay([block('a', 600, 600)]);
    assert.equal(only?.endMin, 620);
    const [late] = layoutDay([block('b', 1435, 1440)]);
    assert.deepEqual([late?.startMin, late?.endMin], [1420, 1440]);
  });
});

describe('spanOnDay', () => {
  const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();

  it('uses wall-clock minutes, also on the DST change day', () => {
    // 25 Oct 2026 is the 25-hour day in Europe; 10:00 must stay on the 10:00 line.
    assert.deepEqual(spanOnDay(at(25, 10, 0), at(25, 11, 0), '2026-10-25', '2026-10-25', '2026-10-25'), {
      startMin: 600,
      endMin: 660,
    });
    assert.equal(wallMinutes(new Date(2026, 9, 25, 23, 30)), 1410);
  });

  it('clamps multi-day events and treats a midnight end as end of day', () => {
    assert.deepEqual(spanOnDay(at(12, 22, 0), at(13, 2, 0), '2026-10-12', '2026-10-13', '2026-10-12'), {
      startMin: 1320,
      endMin: 1440,
    });
    assert.deepEqual(spanOnDay(at(12, 22, 0), at(13, 2, 0), '2026-10-12', '2026-10-13', '2026-10-13'), {
      startMin: 0,
      endMin: 120,
    });
    assert.deepEqual(spanOnDay(at(12, 23, 0), at(13, 0, 0), '2026-10-12', '2026-10-12', '2026-10-12'), {
      startMin: 1380,
      endMin: 1440,
    });
  });
});
