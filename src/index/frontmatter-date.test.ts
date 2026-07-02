import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Offset-aware cases assert local wall-clock values; pin the zone so the
// suite is deterministic on any machine.
process.env.TZ = 'Europe/Rome';

import { normalizeFrontmatterDate } from './frontmatter-date.ts';

describe('normalizeFrontmatterDate', () => {
  it('accepts plain ISO dates with null time', () => {
    assert.deepEqual(normalizeFrontmatterDate('2026-07-02'), { day: '2026-07-02', time: null });
  });

  it('captures the time from datetime strings', () => {
    assert.deepEqual(normalizeFrontmatterDate('2026-07-02T10:00'), {
      day: '2026-07-02',
      time: '10:00',
    });
    assert.deepEqual(normalizeFrontmatterDate('2026-07-02 14:30'), {
      day: '2026-07-02',
      time: '14:30',
    });
    assert.deepEqual(normalizeFrontmatterDate('2026-07-02T09:15:30'), {
      day: '2026-07-02',
      time: '09:15',
    });
  });

  it('converts offset timestamps to local wall-clock (Granola writes UTC)', () => {
    // Rome is UTC+2 in summer: 11:58Z → 13:58 local.
    assert.deepEqual(normalizeFrontmatterDate('2026-06-23T11:58:49.190Z'), {
      day: '2026-06-23',
      time: '13:58',
    });
    // Late-evening UTC crosses local midnight: the DAY shifts too.
    assert.deepEqual(normalizeFrontmatterDate('2026-06-23T22:30:00Z'), {
      day: '2026-06-24',
      time: '00:30',
    });
    // Explicit numeric offset.
    assert.deepEqual(normalizeFrontmatterDate('2026-06-23T10:00:00+02:00'), {
      day: '2026-06-23',
      time: '10:00',
    });
  });

  it('keeps the day but drops an invalid time suffix', () => {
    assert.deepEqual(normalizeFrontmatterDate('2026-07-02T99:99'), {
      day: '2026-07-02',
      time: null,
    });
    assert.deepEqual(normalizeFrontmatterDate('2026-07-02Tgarbage'), {
      day: '2026-07-02',
      time: null,
    });
  });

  it('trims surrounding whitespace', () => {
    assert.deepEqual(normalizeFrontmatterDate(' 2026-07-02 '), { day: '2026-07-02', time: null });
  });

  it('rejects non-ISO formats and garbage', () => {
    assert.equal(normalizeFrontmatterDate('02-07-2026'), null);
    assert.equal(normalizeFrontmatterDate('2026-13-01'), null);
    assert.equal(normalizeFrontmatterDate('2026-05-0'), null);
    assert.equal(normalizeFrontmatterDate('domani'), null);
    assert.equal(normalizeFrontmatterDate(''), null);
  });

  it('rejects non-string values', () => {
    assert.equal(normalizeFrontmatterDate(null), null);
    assert.equal(normalizeFrontmatterDate(undefined), null);
    assert.equal(normalizeFrontmatterDate(42), null);
    assert.equal(normalizeFrontmatterDate(['2026-07-02']), null);
  });
});
