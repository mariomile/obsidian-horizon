import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractTasks } from './task-scanner.ts';

const CONTENT = [
  '# Daily note',           // 0
  '',                       // 1
  '- [ ] Task con due 📅 2026-07-10',                    // 2
  '- [ ] Task senza date',                               // 3
  '\t- [x] Sub completato ⏳ 2026-07-01 ✅ 2026-07-02',  // 4
  '- normale bullet',                                    // 5
  '- [ ] Weekly review 🔁 every week 📅 2026-07-06',     // 6
].join('\n');

const LIST_ITEMS = [
  { line: 2, task: ' ' },
  { line: 3, task: ' ' },
  { line: 4, task: 'x' },
  { line: 6, task: ' ' },
];

describe('extractTasks', () => {
  it('keeps only tasks that carry at least one date', () => {
    const tasks = extractTasks('Journal/Daily/02-07-2026.md', CONTENT, LIST_ITEMS);
    assert.equal(tasks.length, 3);
    assert.deepEqual(
      tasks.map((t) => t.line),
      [2, 4, 6],
    );
  });

  it('fills entry fields from the parsed line', () => {
    const tasks = extractTasks('note.md', CONTENT, LIST_ITEMS);
    const first = tasks[0];
    assert.ok(first);
    assert.equal(first.path, 'note.md');
    assert.equal(first.rawText, '- [ ] Task con due 📅 2026-07-10');
    assert.equal(first.due, '2026-07-10');
    assert.equal(first.description, 'Task con due');
    const sub = tasks[1];
    assert.ok(sub);
    assert.equal(sub.done, true);
    assert.equal(sub.scheduled, '2026-07-01');
    assert.equal(sub.doneDate, '2026-07-02');
    const recurring = tasks[2];
    assert.ok(recurring);
    assert.equal(recurring.recurring, true);
  });

  it('ignores list items whose line is out of range or not a task line', () => {
    const tasks = extractTasks('note.md', CONTENT, [
      { line: 99, task: ' ' },
      { line: 5, task: ' ' }, // cache says task but the text is a plain bullet
    ]);
    assert.equal(tasks.length, 0);
  });

  it('returns empty for empty inputs', () => {
    assert.deepEqual(extractTasks('note.md', '', []), []);
  });
});
