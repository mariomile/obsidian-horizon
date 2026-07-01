import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFrontmatterDate } from './frontmatter-date.ts';

describe('normalizeFrontmatterDate', () => {
  it('accepts plain ISO dates', () => {
    assert.equal(normalizeFrontmatterDate('2026-07-02'), '2026-07-02');
  });

  it('accepts datetime strings, keeping the day part', () => {
    assert.equal(normalizeFrontmatterDate('2026-07-02T10:00'), '2026-07-02');
    assert.equal(normalizeFrontmatterDate('2026-07-02 10:00'), '2026-07-02');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(normalizeFrontmatterDate(' 2026-07-02 '), '2026-07-02');
  });

  it('rejects non-ISO formats and garbage', () => {
    assert.equal(normalizeFrontmatterDate('02-07-2026'), null);
    assert.equal(normalizeFrontmatterDate('2026-13-01'), null);
    assert.equal(normalizeFrontmatterDate('2026-05-0'), null);
    assert.equal(normalizeFrontmatterDate('domani'), null);
    assert.equal(normalizeFrontmatterDate(''), null);
  });

  it('rejects non-string values', () => {
    assert.equal(normalizeFrontmatterDate(null), null);
    assert.equal(normalizeFrontmatterDate(undefined), null);
    assert.equal(normalizeFrontmatterDate(42), null);
    assert.equal(normalizeFrontmatterDate(['2026-07-02']), null);
  });
});
