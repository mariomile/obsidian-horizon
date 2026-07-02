import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyLineEdit } from './line-edit.ts';

const CONTENT = ['# Note', '- [ ] task uno 📅 2026-07-10', 'testo', '- [ ] task due 📅 2026-07-11'].join(
  '\n',
);

describe('applyLineEdit', () => {
  it('edits the line when text matches at the expected index', () => {
    const result = applyLineEdit(
      CONTENT,
      { line: 1, rawText: '- [ ] task uno 📅 2026-07-10' },
      (line) => line.replace('2026-07-10', '2026-07-15'),
    );
    assert.equal(result.changed, true);
    assert.ok(result.content.includes('task uno 📅 2026-07-15'));
    assert.ok(result.content.includes('task due 📅 2026-07-11'));
  });

  it('falls back to a unique exact-text search when the line drifted', () => {
    const result = applyLineEdit(
      CONTENT,
      { line: 0, rawText: '- [ ] task due 📅 2026-07-11' }, // stale index
      (line) => line.replace('due', 'DUE'),
    );
    assert.equal(result.changed, true);
    assert.ok(result.content.includes('task DUE'));
  });

  it('aborts when the text appears more than once', () => {
    const dup = ['- [ ] stesso task', '- [ ] stesso task'].join('\n');
    const result = applyLineEdit(dup, { line: 5, rawText: '- [ ] stesso task' }, (l) => l + ' X');
    assert.equal(result.changed, false);
    assert.equal(result.content, dup);
  });

  it('aborts when the text is gone', () => {
    const result = applyLineEdit(CONTENT, { line: 1, rawText: '- [ ] sparito' }, (l) => l + ' X');
    assert.equal(result.changed, false);
    assert.equal(result.content, CONTENT);
  });

  it('reports unchanged when the transform is a no-op', () => {
    const result = applyLineEdit(
      CONTENT,
      { line: 1, rawText: '- [ ] task uno 📅 2026-07-10' },
      (line) => line,
    );
    assert.equal(result.changed, false);
  });
});
