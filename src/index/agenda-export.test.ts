import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { agendaExportUnchanged, buildAgendaExport } from './agenda-export.ts';
import { DayIndexCore } from './day-index.ts';
import type { TaskEntry } from '../types.ts';

function task(overrides: Partial<TaskEntry> & { path: string; line: number }): TaskEntry {
  return {
    rawText: '- [ ] task',
    description: 'task',
    status: ' ',
    done: false,
    recurring: false,
    ...overrides,
  };
}

function coreWithData(): DayIndexCore {
  const core = new DayIndexCore();
  core.setFile('a.md', {
    tasks: [
      task({ path: 'a.md', line: 0, description: 'scaduto', due: '2026-06-28' }),
      task({ path: 'a.md', line: 1, description: 'oggi', due: '2026-07-02' }),
      task({ path: 'a.md', line: 2, description: 'futuro', due: '2026-07-05' }),
    ],
    note: { path: 'meeting.md', title: 'Standup', date: '2026-07-03', time: '09:30' },
  });
  return core;
}

describe('buildAgendaExport', () => {
  it('serializes the window with overdue set and non-empty days only', () => {
    const core = coreWithData();
    const result = buildAgendaExport(core, {
      today: '2026-07-02',
      from: '2026-06-25',
      to: '2026-07-09',
      generatedAt: '2026-07-02T10:00:00.000Z',
    });
    assert.equal(result.generatedAt, '2026-07-02T10:00:00.000Z');
    assert.equal(result.from, '2026-06-25');
    assert.equal(result.to, '2026-07-09');
    assert.deepEqual(
      result.overdue.map((t) => t.description),
      ['scaduto'],
    );
    assert.deepEqual(
      result.days.map((d) => d.day),
      ['2026-06-28', '2026-07-02', '2026-07-03', '2026-07-05'],
    );
    const day3 = result.days.find((d) => d.day === '2026-07-03');
    assert.deepEqual(day3?.notes, [{ path: 'meeting.md', title: 'Standup', time: '09:30' }]);
  });

  it('carries the guarded-edit fields on task exports', () => {
    const core = coreWithData();
    const result = buildAgendaExport(core, {
      today: '2026-07-02',
      from: '2026-07-02',
      to: '2026-07-02',
      generatedAt: 'x',
    });
    const entry = result.days[0]?.due[0];
    assert.ok(entry);
    assert.equal(entry.path, 'a.md');
    assert.equal(entry.line, 1);
    assert.equal(entry.rawText, '- [ ] task');
  });

  it('returns empty days array when the window has no content', () => {
    const result = buildAgendaExport(new DayIndexCore(), {
      today: '2026-07-02',
      from: '2026-07-01',
      to: '2026-07-03',
      generatedAt: 'x',
    });
    assert.deepEqual(result.days, []);
    assert.deepEqual(result.overdue, []);
  });
});

describe('agendaExportUnchanged', () => {
  const options = { today: '2026-07-02', from: '2026-06-25', to: '2026-07-09' };
  const previous = buildAgendaExport(coreWithData(), { ...options, generatedAt: '2026-07-02T10:00:00.000Z' });
  const previousText = JSON.stringify(previous, null, 2);

  it('ignores a different generatedAt', () => {
    const next = buildAgendaExport(coreWithData(), { ...options, generatedAt: '2026-07-02T10:05:00.000Z' });
    assert.equal(agendaExportUnchanged(previousText, next), true);
  });

  it('detects a change in days, overdue, from or to', () => {
    const base = { ...previous, generatedAt: 'later' };
    assert.equal(agendaExportUnchanged(previousText, { ...base, days: base.days.slice(1) }), false);
    assert.equal(agendaExportUnchanged(previousText, { ...base, overdue: [] }), false);
    assert.equal(agendaExportUnchanged(previousText, { ...base, from: '2026-06-26' }), false);
    assert.equal(agendaExportUnchanged(previousText, { ...base, to: '2026-07-10' }), false);
  });

  it('asks for a write when the previous file is missing or unparsable', () => {
    assert.equal(agendaExportUnchanged(null, previous), false);
    assert.equal(agendaExportUnchanged('{ not json', previous), false);
  });
});
