import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runwayTaskToEntry } from './indexer.ts';

describe('runwayTaskToEntry', () => {
  it('maps the shared Runway task contract to Horizon without reparsing text', () => {
    const entry = runwayTaskToEntry({
      path: 'Journal/Daily/18-07-2026.md',
      line: 12,
      rawText: '- [/] Ship it ⏳ 2026-07-18 📅 2026-07-19 🔁 every week',
      description: 'Ship it',
      statusChar: '/',
      done: false,
      recurring: true,
      scheduled: '2026-07-18',
      due: '2026-07-19',
    });

    assert.deepEqual(entry, {
      path: 'Journal/Daily/18-07-2026.md',
      line: 12,
      rawText: '- [/] Ship it ⏳ 2026-07-18 📅 2026-07-19 🔁 every week',
      description: 'Ship it',
      status: '/',
      done: false,
      recurring: true,
      scheduled: '2026-07-18',
      due: '2026-07-19',
      doneDate: undefined,
      cancelledDate: undefined,
    });
  });

  it('skips undated tasks because Horizon has no day bucket for them', () => {
    assert.equal(runwayTaskToEntry({
      path: 'Tasks.md',
      line: 0,
      rawText: '- [ ] Later',
      description: 'Later',
      statusChar: ' ',
      done: false,
      recurring: false,
    }), null);
  });
});
