import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseTaskLine, rewriteDate, toggleDone } from './task-line.ts';

describe('parseTaskLine', () => {
  it('parses a plain due task', () => {
    const parsed = parseTaskLine('- [ ] Preparare demo Horizon 📅 2026-07-10');
    assert.ok(parsed);
    assert.equal(parsed.status, ' ');
    assert.equal(parsed.done, false);
    assert.equal(parsed.due, '2026-07-10');
    assert.equal(parsed.description, 'Preparare demo Horizon');
  });

  it('parses tab-indented sub-tasks', () => {
    const parsed = parseTaskLine('\t- [ ] Sotto-task indentato ⏳ 2026-07-05');
    assert.ok(parsed);
    assert.equal(parsed.scheduled, '2026-07-05');
    assert.equal(parsed.description, 'Sotto-task indentato');
  });

  it('parses a completed task with done date and created date', () => {
    const parsed = parseTaskLine('- [x] Review settimanale ➕ 2026-06-01 📅 2026-06-28 ✅ 2026-06-29');
    assert.ok(parsed);
    assert.equal(parsed.done, true);
    assert.equal(parsed.due, '2026-06-28');
    assert.equal(parsed.doneDate, '2026-06-29');
    assert.equal(parsed.description, 'Review settimanale');
  });

  it('keeps wikilinks and priorities out of dates but strips priority from description', () => {
    const parsed = parseTaskLine('- [ ] ⏫ Sistemare [[Horizon Plugin]] 📅 2026-07-03');
    assert.ok(parsed);
    assert.equal(parsed.due, '2026-07-03');
    assert.equal(parsed.description, 'Sistemare [[Horizon Plugin]]');
  });

  it('detects recurrence', () => {
    const parsed = parseTaskLine('- [ ] Weekly review 🔁 every week 📅 2026-07-06');
    assert.ok(parsed);
    assert.equal(parsed.recurring, true);
    assert.equal(parsed.due, '2026-07-06');
    assert.equal(parsed.description, 'Weekly review');
  });

  it('ignores corrupt dates but keeps valid ones', () => {
    // A malformed source line ends with a truncated done date.
    const parsed = parseTaskLine('- [x] Fix onboarding copy 📅 2026-01-18 ✅ 2026-05-0');
    assert.ok(parsed);
    assert.equal(parsed.due, '2026-01-18');
    assert.equal(parsed.doneDate, undefined);
  });

  it('parses custom statuses without marking them done', () => {
    const inProgress = parseTaskLine('- [/] Task in corso 📅 2026-07-04');
    assert.ok(inProgress);
    assert.equal(inProgress.status, '/');
    assert.equal(inProgress.done, false);

    const cancelled = parseTaskLine('- [-] Task annullato ❌ 2026-06-20');
    assert.ok(cancelled);
    assert.equal(cancelled.cancelledDate, '2026-06-20');
  });

  it('supports * and numbered list markers', () => {
    assert.ok(parseTaskLine('* [ ] Task con asterisco 📅 2026-07-08'));
    assert.ok(parseTaskLine('3. [ ] Task numerato 📅 2026-07-08'));
  });

  it('returns null for non-task lines', () => {
    assert.equal(parseTaskLine('- normale bullet senza checkbox'), null);
    assert.equal(parseTaskLine('# Heading'), null);
    assert.equal(parseTaskLine(''), null);
  });

  it('returns a task even with no dates at all', () => {
    const parsed = parseTaskLine('- [ ] Task senza date');
    assert.ok(parsed);
    assert.equal(parsed.due, undefined);
    assert.equal(parsed.scheduled, undefined);
  });
});

describe('rewriteDate', () => {
  it('replaces the due date in place', () => {
    const line = '- [ ] Preparare demo Horizon 📅 2026-07-10';
    assert.equal(rewriteDate(line, 'due', '2026-07-15'), '- [ ] Preparare demo Horizon 📅 2026-07-15');
  });

  it('replaces only the requested kind', () => {
    const line = '- [ ] Task doppio ⏳ 2026-07-05 📅 2026-07-10';
    assert.equal(
      rewriteDate(line, 'scheduled', '2026-07-06'),
      '- [ ] Task doppio ⏳ 2026-07-06 📅 2026-07-10',
    );
  });

  it('is idempotent', () => {
    const line = '- [ ] Preparare demo Horizon 📅 2026-07-10';
    assert.equal(rewriteDate(line, 'due', '2026-07-10'), line);
  });

  it('appends the field when missing', () => {
    assert.equal(
      rewriteDate('- [ ] Task senza date', 'due', '2026-07-15'),
      '- [ ] Task senza date 📅 2026-07-15',
    );
  });

  it('preserves indentation and trailing block ids', () => {
    assert.equal(
      rewriteDate('\t- [ ] Sub 📅 2026-07-10 ^abc123', 'due', '2026-07-11'),
      '\t- [ ] Sub 📅 2026-07-11 ^abc123',
    );
  });
});

describe('toggleDone', () => {
  it('completes a todo appending the done date', () => {
    const result = toggleDone('- [ ] Preparare demo 📅 2026-07-10', '2026-07-02');
    assert.equal(result.changed, true);
    assert.equal(result.line, '- [x] Preparare demo 📅 2026-07-10 ✅ 2026-07-02');
  });

  it('un-completes a done task stripping the done date', () => {
    const result = toggleDone('- [x] Preparare demo 📅 2026-07-10 ✅ 2026-07-02', '2026-07-02');
    assert.equal(result.changed, true);
    assert.equal(result.line, '- [ ] Preparare demo 📅 2026-07-10');
  });

  it('inserts the done date before a trailing block id', () => {
    const result = toggleDone('- [ ] Task 📅 2026-07-10 ^abc123', '2026-07-02');
    assert.equal(result.changed, true);
    assert.equal(result.line, '- [x] Task 📅 2026-07-10 ✅ 2026-07-02 ^abc123');
  });

  it('refuses recurring tasks', () => {
    const line = '- [ ] Weekly review 🔁 every week 📅 2026-07-06';
    const result = toggleDone(line, '2026-07-02');
    assert.equal(result.changed, false);
    assert.equal(result.line, line);
  });

  it('refuses custom statuses', () => {
    const line = '- [/] Task in corso 📅 2026-07-04';
    const result = toggleDone(line, '2026-07-02');
    assert.equal(result.changed, false);
    assert.equal(result.line, line);
  });

  it('refuses non-task lines', () => {
    const result = toggleDone('- bullet qualunque', '2026-07-02');
    assert.equal(result.changed, false);
  });
});
