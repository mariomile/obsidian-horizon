import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { layoutDay, minutesInDay } from './time-grid-layout.ts';

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

  it('gives very short blocks a minimum height', () => {
    const [only] = layoutDay([block('a', 600, 600)]);
    assert.equal(only?.endMin, 620);
  });
});

describe('minutesInDay', () => {
  it('clamps to the day', () => {
    const midnight = new Date(2026, 9, 12).getTime();
    assert.equal(minutesInDay(midnight + 90 * 60_000, midnight), 90);
    assert.equal(minutesInDay(midnight - 60_000, midnight), 0);
    assert.equal(minutesInDay(midnight + 30 * 3600_000, midnight), 1440);
  });
});
