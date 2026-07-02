import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import realMoment from 'moment';

import type { MomentLike } from '../index/periodic.ts';
import { applyTemplate } from './template.ts';

const moment = realMoment as unknown as MomentLike;

describe('applyTemplate', () => {
  it('fills {{date:FMT}} with the TARGET day, not today (real vault template)', () => {
    const source = [
      '---',
      'type: log',
      'tags:',
      '  - type/log',
      'date: {{date:YYYY-MM-DD}}',
      '---',
    ].join('\n');
    const result = applyTemplate(source, moment, '2026-07-10', '10-07-2026');
    assert.ok(result.includes('date: 2026-07-10'));
    assert.ok(!result.includes('{{'));
  });

  it('fills {{date}} with the default format', () => {
    assert.equal(applyTemplate('{{date}}', moment, '2026-07-10', 't'), '2026-07-10');
  });

  it('fills {{title}} with the note basename', () => {
    assert.equal(
      applyTemplate('# {{title}}', moment, '2026-07-10', '10-07-2026'),
      '# 10-07-2026',
    );
  });

  it('supports repeated and mixed-case tokens', () => {
    const result = applyTemplate(
      '{{DATE:YYYY}} / {{date:MM}} / {{Title}}',
      moment,
      '2026-07-10',
      'X',
    );
    assert.equal(result, '2026 / 07 / X');
  });

  it('fills {{time}} tokens from the provided clock', () => {
    const result = applyTemplate('{{time}} {{time:HH}}', moment, '2026-07-10', 't', () => '09:30');
    assert.equal(result, '09:30 09:30');
  });

  it('leaves unknown tokens untouched', () => {
    assert.equal(
      applyTemplate('{{unknown}} {{date}}', moment, '2026-07-10', 't'),
      '{{unknown}} 2026-07-10',
    );
  });

  it('returns empty for empty source', () => {
    assert.equal(applyTemplate('', moment, '2026-07-10', 't'), '');
  });

  it('fills caller-supplied data tokens lazily', () => {
    let rendered = 0;
    const tokens = {
      agenda: () => {
        rendered += 1;
        return '- 09:30 · [[Standup]]';
      },
    };
    assert.equal(
      applyTemplate('## Agenda\n{{agenda}}', moment, '2026-07-10', 't', undefined, tokens),
      '## Agenda\n- 09:30 · [[Standup]]',
    );
    assert.equal(rendered, 1);
    // Token absent from the source → renderer never invoked.
    applyTemplate('no tokens here', moment, '2026-07-10', 't', undefined, tokens);
    assert.equal(rendered, 1);
  });

  it('supports hyphenated token names like week-digest', () => {
    assert.equal(
      applyTemplate('{{week-digest}}', moment, '2026-07-10', 't', undefined, {
        'week-digest': () => '### Fatto',
      }),
      '### Fatto',
    );
  });
});
