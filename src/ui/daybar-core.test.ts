import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import realMoment from 'moment';

import type { MomentLike } from '../index/periodic.ts';
import { resolveDailyKey, formatDayLabel, buildPickerCells } from './daybar-core.ts';

const moment = realMoment as unknown as MomentLike;

describe('resolveDailyKey', () => {
  it('resolves a file in the daily folder with matching format', () => {
    assert.equal(
      resolveDailyKey(moment, 'Journal/Daily', 'DD-MM-YYYY', 'Journal/Daily/21-07-2026.md'),
      '2026-07-21',
    );
  });

  it('resolves with an empty (vault-root) folder', () => {
    assert.equal(resolveDailyKey(moment, '', 'YYYY-MM-DD', '2026-07-21.md'), '2026-07-21');
  });

  it('rejects a file in a different folder', () => {
    assert.equal(
      resolveDailyKey(moment, 'Journal/Daily', 'DD-MM-YYYY', 'Notes/21-07-2026.md'),
      null,
    );
  });

  it('rejects a non-matching basename', () => {
    assert.equal(
      resolveDailyKey(moment, 'Journal/Daily', 'DD-MM-YYYY', 'Journal/Daily/Groceries.md'),
      null,
    );
  });

  it('tolerates a trailing slash on the folder', () => {
    assert.equal(
      resolveDailyKey(moment, 'Journal/Daily/', 'DD-MM-YYYY', 'Journal/Daily/21-07-2026.md'),
      '2026-07-21',
    );
  });
});

describe('formatDayLabel', () => {
  it('formats a DayKey as "D MMM YYYY"', () => {
    assert.equal(formatDayLabel(moment, '2026-07-21'), '21 Jul 2026');
  });
});

describe('buildPickerCells', () => {
  it('returns 42 cells flagging month membership, today, current and notes', () => {
    const cells = buildPickerCells('2026-07-21', {
      currentKey: '2026-07-21',
      todayKey: '2026-07-23',
      hasNote: (k) => k === '2026-07-15' || k === '2026-07-21',
    });
    assert.equal(cells.length, 42);
    const jul21 = cells.find((c) => c.key === '2026-07-21');
    assert.ok(jul21);
    assert.equal(jul21?.isCurrent, true);
    assert.equal(jul21?.hasNote, true);
    assert.equal(jul21?.inMonth, true);
    const jul23 = cells.find((c) => c.key === '2026-07-23');
    assert.equal(jul23?.isToday, true);
    const jun29 = cells.find((c) => c.key === '2026-06-29');
    assert.equal(jun29?.inMonth, false);
  });
});
