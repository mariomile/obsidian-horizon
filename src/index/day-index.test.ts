import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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

describe('DayIndexCore', () => {
  it('buckets tasks by their date kind', () => {
    const core = new DayIndexCore();
    core.setFile('a.md', {
      tasks: [task({ path: 'a.md', line: 0, due: '2026-07-10' })],
      note: null,
    });
    const bucket = core.getBucket('2026-07-10');
    assert.ok(bucket);
    assert.equal(bucket.due.length, 1);
    assert.equal(bucket.scheduled.length, 0);
  });

  it('places a multi-date task in every matching bucket', () => {
    const core = new DayIndexCore();
    core.setFile('a.md', {
      tasks: [
        task({
          path: 'a.md',
          line: 0,
          due: '2026-07-10',
          scheduled: '2026-07-08',
          doneDate: '2026-07-09',
        }),
      ],
      note: null,
    });
    assert.equal(core.getBucket('2026-07-10')?.due.length, 1);
    assert.equal(core.getBucket('2026-07-08')?.scheduled.length, 1);
    assert.equal(core.getBucket('2026-07-09')?.done.length, 1);
  });

  it('stores frontmatter notes', () => {
    const core = new DayIndexCore();
    core.setFile('Atlas/People/Meeting.md', {
      tasks: [],
      note: { path: 'Atlas/People/Meeting.md', title: 'Meeting', date: '2026-07-02' },
    });
    assert.deepEqual(core.getBucket('2026-07-02')?.notes, [
      { path: 'Atlas/People/Meeting.md', title: 'Meeting' },
    ]);
  });

  it('replaces a file contribution on re-set', () => {
    const core = new DayIndexCore();
    core.setFile('a.md', { tasks: [task({ path: 'a.md', line: 0, due: '2026-07-10' })], note: null });
    core.setFile('a.md', { tasks: [task({ path: 'a.md', line: 2, due: '2026-07-11' })], note: null });
    assert.equal(core.getBucket('2026-07-10'), null);
    assert.equal(core.getBucket('2026-07-11')?.due.length, 1);
  });

  it('drops empty contributions and removed files', () => {
    const core = new DayIndexCore();
    core.setFile('a.md', { tasks: [task({ path: 'a.md', line: 0, due: '2026-07-10' })], note: null });
    core.setFile('a.md', { tasks: [], note: null });
    assert.equal(core.getBucket('2026-07-10'), null);

    core.setFile('b.md', { tasks: [task({ path: 'b.md', line: 0, due: '2026-07-12' })], note: null });
    core.removeFile('b.md');
    assert.equal(core.getBucket('2026-07-12'), null);
  });

  it('re-keys contributions on rename', () => {
    const core = new DayIndexCore();
    core.setFile('old.md', {
      tasks: [task({ path: 'old.md', line: 0, due: '2026-07-10' })],
      note: { path: 'old.md', title: 'old', date: '2026-07-10' },
    });
    core.renameFile('old.md', 'new.md');
    const bucket = core.getBucket('2026-07-10');
    assert.ok(bucket);
    assert.equal(bucket.due[0]?.path, 'new.md');
    assert.equal(bucket.notes[0]?.path, 'new.md');
    core.removeFile('new.md');
    assert.equal(core.getBucket('2026-07-10'), null);
  });

  it('sorts tasks by path then line, notes by title', () => {
    const core = new DayIndexCore();
    core.setFile('b.md', {
      tasks: [
        task({ path: 'b.md', line: 5, due: '2026-07-10' }),
        task({ path: 'b.md', line: 1, due: '2026-07-10' }),
      ],
      note: { path: 'b.md', title: 'Zeta', date: '2026-07-10' },
    });
    core.setFile('a.md', {
      tasks: [task({ path: 'a.md', line: 9, due: '2026-07-10' })],
      note: { path: 'a.md', title: 'Alpha', date: '2026-07-10' },
    });
    const bucket = core.getBucket('2026-07-10');
    assert.ok(bucket);
    assert.deepEqual(
      bucket.due.map((t) => [t.path, t.line]),
      [['a.md', 9], ['b.md', 1], ['b.md', 5]],
    );
    assert.deepEqual(
      bucket.notes.map((n) => n.title),
      ['Alpha', 'Zeta'],
    );
  });

  it('sorts timed notes chronologically before untimed ones', () => {
    const core = new DayIndexCore();
    core.setFile('c.md', {
      tasks: [],
      note: { path: 'c.md', title: 'Senza orario', date: '2026-07-02' },
    });
    core.setFile('b.md', {
      tasks: [],
      note: { path: 'b.md', title: 'Standup', date: '2026-07-02', time: '09:30' },
    });
    core.setFile('a.md', {
      tasks: [],
      note: { path: 'a.md', title: 'Weekly sync', date: '2026-07-02', time: '14:00' },
    });
    const bucket = core.getBucket('2026-07-02');
    assert.ok(bucket);
    assert.deepEqual(
      bucket.notes.map((n) => n.title),
      ['Standup', 'Weekly sync', 'Senza orario'],
    );
  });

  it('openDueBefore collects open due tasks from past days, sorted by due date', () => {
    const core = new DayIndexCore();
    core.setFile('a.md', {
      tasks: [
        task({ path: 'a.md', line: 0, due: '2026-06-20' }),
        task({ path: 'a.md', line: 1, due: '2026-07-01' }),
        task({ path: 'a.md', line: 2, due: '2026-07-02' }), // today: not overdue
        task({ path: 'a.md', line: 3, due: '2026-07-10' }), // future
        task({ path: 'a.md', line: 4, due: '2026-06-25', done: true, status: 'x' }),
        task({ path: 'a.md', line: 5, due: '2026-06-25', status: '-' }), // cancelled
      ],
      note: null,
    });
    const overdue = core.openDueBefore('2026-07-02');
    assert.deepEqual(
      overdue.map((t) => [t.due, t.line]),
      [
        ['2026-06-20', 0],
        ['2026-07-01', 1],
      ],
    );
  });

  it('openDueBefore returns empty when nothing is overdue', () => {
    const core = new DayIndexCore();
    core.setFile('a.md', {
      tasks: [task({ path: 'a.md', line: 0, due: '2026-07-10' })],
      note: null,
    });
    assert.deepEqual(core.openDueBefore('2026-07-02'), []);
  });

  it('notifies subscribers only when notify() is called', () => {
    const core = new DayIndexCore();
    let calls = 0;
    const unsubscribe = core.subscribe(() => {
      calls += 1;
    });
    core.setFile('a.md', { tasks: [task({ path: 'a.md', line: 0, due: '2026-07-10' })], note: null });
    assert.equal(calls, 0); // mutations are silent; the service decides when to emit
    core.notify();
    assert.equal(calls, 1);
    unsubscribe();
    core.notify();
    assert.equal(calls, 1);
  });
});
