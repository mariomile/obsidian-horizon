import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import realMoment from 'moment';

import { basenameToDate, dateToBasename, dateToPath } from './periodic.ts';
import type { MomentLike } from './periodic.ts';

const moment = realMoment as unknown as MomentLike;

describe('dateToBasename', () => {
  it('formats daily basenames in the vault format', () => {
    assert.equal(dateToBasename(moment, '2026-07-02', 'DD-MM-YYYY'), '02-07-2026');
  });

  it('formats weekly basenames with ISO week-year', () => {
    // 2026-04-06 is the Monday of ISO week 15 — matches Journal/Weekly/2026-W15.md
    assert.equal(dateToBasename(moment, '2026-04-06', 'GGGG-[W]WW'), '2026-W15');
    // Any day of the same week maps to the same basename.
    assert.equal(dateToBasename(moment, '2026-04-12', 'GGGG-[W]WW'), '2026-W15');
  });

  it('uses ISO week-year at year boundaries', () => {
    assert.equal(dateToBasename(moment, '2024-12-30', 'GGGG-[W]WW'), '2025-W01');
    assert.equal(dateToBasename(moment, '2027-01-01', 'GGGG-[W]WW'), '2026-W53');
  });

  it('formats monthly and yearly basenames', () => {
    assert.equal(dateToBasename(moment, '2026-07-02', 'YYYY-MM'), '2026-07');
    assert.equal(dateToBasename(moment, '2026-07-02', 'YYYY'), '2026');
  });
});

describe('basenameToDate', () => {
  it('parses daily basenames strictly', () => {
    assert.equal(basenameToDate(moment, '02-07-2026', 'DD-MM-YYYY'), '2026-07-02');
  });

  it('parses weekly basenames to the Monday of the week', () => {
    assert.equal(basenameToDate(moment, '2026-W15', 'GGGG-[W]WW'), '2026-04-06');
  });

  it('parses monthly and yearly basenames to the first day', () => {
    assert.equal(basenameToDate(moment, '2026-07', 'YYYY-MM'), '2026-07-01');
    assert.equal(basenameToDate(moment, '2026', 'YYYY'), '2026-01-01');
  });

  it('rejects sync-conflict copies via strict round-trip', () => {
    assert.equal(
      basenameToDate(moment, '25-06-2026 (Conflicted copy)', 'DD-MM-YYYY'),
      null,
    );
  });

  it('rejects unpadded and impossible values', () => {
    assert.equal(basenameToDate(moment, '2-7-2026', 'DD-MM-YYYY'), null);
    assert.equal(basenameToDate(moment, '2026-13', 'YYYY-MM'), null);
    assert.equal(basenameToDate(moment, 'garbage', 'DD-MM-YYYY'), null);
  });
});

describe('dateToPath', () => {
  it('joins folder and basename', () => {
    assert.equal(
      dateToPath(moment, '2026-07-02', { enabled: true, folder: 'Journal/Daily', format: 'DD-MM-YYYY', template: '' }),
      'Journal/Daily/02-07-2026.md',
    );
  });

  it('handles empty and slash-terminated folders', () => {
    assert.equal(
      dateToPath(moment, '2026-07-02', { enabled: true, folder: '', format: 'DD-MM-YYYY', template: '' }),
      '02-07-2026.md',
    );
    assert.equal(
      dateToPath(moment, '2026-07-02', { enabled: true, folder: 'Journal/Daily/', format: 'DD-MM-YYYY', template: '' }),
      'Journal/Daily/02-07-2026.md',
    );
  });
});
