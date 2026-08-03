import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import realMoment from 'moment';

import type { MomentLike } from '../index/periodic.ts';
import { weeklyHeading } from './period-preview-core.ts';

const moment = realMoment as unknown as MomentLike;

describe('weeklyHeading', () => {
  it('formats the ISO week spanning a Monday key', () => {
    // 2026-08-03 is a Monday — its own week's first day.
    assert.equal(weeklyHeading(moment, '2026-08-03'), 'W32 · 3 Aug – 9 Aug');
  });

  it('formats the ISO week spanning a mid-week key', () => {
    // 2026-07-28 is a Tuesday inside the W31 week (27 Jul – 2 Aug).
    assert.equal(weeklyHeading(moment, '2026-07-28'), 'W31 · 27 Jul – 2 Aug');
  });

  it('is stable for any day inside the same week', () => {
    assert.equal(weeklyHeading(moment, '2026-08-05'), weeklyHeading(moment, '2026-08-03'));
  });
});
