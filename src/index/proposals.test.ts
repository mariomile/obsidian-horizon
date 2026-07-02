import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseProposals, removeProposal } from './proposals.ts';

const VALID = JSON.stringify({
  proposals: [
    {
      id: 'p1',
      kind: 'reschedule',
      path: 'note.md',
      line: 3,
      rawText: '- [ ] task 📅 2026-07-01',
      dateKind: 'due',
      targetKey: '2026-07-04',
      reason: 'slot libero venerdì',
    },
    { id: 'p2', kind: 'new-task', text: 'Preparare demo', targetKey: '2026-07-06' },
  ],
});

describe('parseProposals', () => {
  it('parses both proposal kinds', () => {
    const proposals = parseProposals(VALID);
    assert.equal(proposals.length, 2);
    assert.equal(proposals[0]?.kind, 'reschedule');
    assert.equal(proposals[0]?.kind === 'reschedule' && proposals[0].targetKey, '2026-07-04');
    assert.equal(proposals[1]?.kind, 'new-task');
  });

  it('skips invalid entries but keeps valid ones', () => {
    const mixed = JSON.stringify({
      proposals: [
        { id: 'ok', kind: 'new-task', text: 'valida', targetKey: '2026-07-06' },
        { id: 'bad1', kind: 'new-task', text: 'data rotta', targetKey: '2026-99-99' },
        { id: 'bad2', kind: 'reschedule', path: 'x.md', targetKey: '2026-07-06' }, // missing fields
        { kind: 'new-task', text: 'senza id', targetKey: '2026-07-06' },
        'garbage',
      ],
    });
    const proposals = parseProposals(mixed);
    assert.deepEqual(
      proposals.map((p) => p.id),
      ['ok'],
    );
  });

  it('returns empty on garbage or missing structure', () => {
    assert.deepEqual(parseProposals('not json'), []);
    assert.deepEqual(parseProposals('{}'), []);
    assert.deepEqual(parseProposals('{"proposals": "nope"}'), []);
  });
});

describe('removeProposal', () => {
  it('removes the entry by id preserving the rest', () => {
    const next = removeProposal(VALID, 'p1');
    const proposals = parseProposals(next);
    assert.deepEqual(
      proposals.map((p) => p.id),
      ['p2'],
    );
  });

  it('leaves unknown ids untouched', () => {
    assert.deepEqual(parseProposals(removeProposal(VALID, 'nope')).length, 2);
  });

  it('tolerates a corrupt file', () => {
    assert.equal(removeProposal('not json', 'p1'), 'not json');
  });
});
