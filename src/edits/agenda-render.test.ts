import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import realMoment from 'moment';

import type { MomentLike } from '../index/periodic.ts';
import type { DayBucket, TaskEntry } from '../types.ts';
import { renderDayAgenda, renderWeekDigest } from './agenda-render.ts';

const moment = realMoment as unknown as MomentLike;

function task(overrides: Partial<TaskEntry> & { description: string }): TaskEntry {
  return {
    path: 'Journal/Daily/01-07-2026.md',
    line: 0,
    rawText: '- [ ] x',
    status: ' ',
    done: false,
    recurring: false,
    ...overrides,
  };
}

function bucket(partial: Partial<DayBucket>): DayBucket {
  return { due: [], scheduled: [], done: [], notes: [], ...partial };
}

describe('renderDayAgenda', () => {
  it('lists timed meetings first, then due and scheduled tasks as plain bullets', () => {
    const result = renderDayAgenda(
      bucket({
        notes: [
          { path: 'Resources/M.md', title: 'Weekly sync', time: '14:00' },
          { path: 'Resources/S.md', title: 'Standup', time: '09:30' },
        ],
        due: [task({ description: 'Preparare demo' })],
        scheduled: [task({ description: 'Rivedere PRD' })],
      }),
    );
    const lines = result.split('\n');
    assert.deepEqual(lines, [
      '- 09:30 · [[Standup]]',
      '- 14:00 · [[Weekly sync]]',
      '- 📅 Preparare demo ([[01-07-2026]])',
      '- ⏳ Rivedere PRD ([[01-07-2026]])',
    ]);
  });

  it('skips done and cancelled tasks and renders task lines as NON-task bullets', () => {
    const result = renderDayAgenda(
      bucket({
        due: [
          task({ description: 'fatta', done: true, status: 'x' }),
          task({ description: 'annullata', status: '-' }),
          task({ description: 'aperta' }),
        ],
      }),
    );
    assert.equal(result, '- 📅 aperta ([[01-07-2026]])');
    assert.ok(!result.includes('- [ ]'), 'must not duplicate real task lines');
  });

  it('returns empty string for an empty day', () => {
    assert.equal(renderDayAgenda(bucket({})), '');
    assert.equal(renderDayAgenda(null), '');
  });
});

describe('renderWeekDigest', () => {
  it('renders done-by-day, meetings, and upcoming sections', () => {
    const days = [
      {
        key: '2026-06-29',
        bucket: bucket({
          done: [task({ description: 'Shipped feature', done: true, status: 'x' })],
          notes: [{ path: 'M.md', title: 'Kickoff', time: '10:00' }],
        }),
      },
      { key: '2026-06-30', bucket: null },
    ];
    const upcoming = [task({ description: 'Prossimo task', due: '2026-07-06' })];
    const result = renderWeekDigest(moment, days, upcoming);
    assert.ok(result.includes('### Fatto'));
    assert.ok(result.includes('Shipped feature'));
    assert.ok(result.includes('### Meeting e note'));
    assert.ok(result.includes('10:00 · [[Kickoff]]'));
    assert.ok(result.includes('### In arrivo'));
    assert.ok(result.includes('Prossimo task'));
  });

  it('omits empty sections and returns empty for an empty week', () => {
    const result = renderWeekDigest(moment, [{ key: '2026-06-29', bucket: null }], []);
    assert.equal(result, '');
  });
});
