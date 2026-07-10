import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import moment from 'moment';

import { cleanJournalMarkdown, createJournalPreview, listJournalEntries } from './journal.ts';

const daily = { enabled: true, folder: 'Journal/Daily', format: 'DD-MM-YYYY', template: '' };

describe('listJournalEntries', () => {
  it('keeps configured daily notes through today in descending order', () => {
    const entries = listJournalEntries(
      [
        { path: 'Journal/Daily/09-07-2026.md', basename: '09-07-2026' },
        { path: 'Journal/Daily/10-07-2026.md', basename: '10-07-2026' },
        { path: 'Journal/Daily/12-07-2026.md', basename: '12-07-2026' },
        { path: 'Elsewhere/08-07-2026.md', basename: '08-07-2026' },
        { path: 'Journal/Daily/08-07-2026 (Conflicted copy).md', basename: '08-07-2026 (Conflicted copy)' },
      ],
      daily,
      moment,
      '2026-07-10',
    );

    assert.deepEqual(entries.map((entry) => entry.key), ['2026-07-10', '2026-07-09']);
  });

  it('returns no entries when daily notes are disabled', () => {
    assert.deepEqual(
      listJournalEntries([{ path: 'Journal/Daily/10-07-2026.md', basename: '10-07-2026' }], { ...daily, enabled: false }, moment, '2026-07-10'),
      [],
    );
  });
});

describe('journal preview', () => {
  it('removes frontmatter, embeds, and fenced code while preserving Markdown text', () => {
    const result = cleanJournalMarkdown('---\ntags: [type/log]\n---\n# Oggi\n\n![[chart.html]]\n\n- [ ] Scrivere [[nota]]\n\n```ts\nsecret()\n```');
    assert.equal(result, '# Oggi\n\n- [ ] Scrivere [[nota]]');
  });

  it('truncates only at a line boundary', () => {
    const preview = createJournalPreview('# Titolo\n\nUna prima riga.\nUna seconda riga molto lunga.', 28);
    assert.equal(preview.markdown, '# Titolo\n\nUna prima riga.');
    assert.equal(preview.truncated, true);
  });
});
