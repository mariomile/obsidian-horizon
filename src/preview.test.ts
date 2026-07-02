import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createScanText, normalizeCoverCandidate, stripFrontmatter } from './preview.ts';

describe('stripFrontmatter', () => {
  it('removes a leading YAML block', () => {
    assert.equal(stripFrontmatter('---\ntags: x\n---\nBody'), 'Body');
  });

  it('leaves content without frontmatter untouched', () => {
    assert.equal(stripFrontmatter('Body only'), 'Body only');
  });
});

describe('createScanText', () => {
  it('strips structure and keeps prose', () => {
    const source = [
      '---',
      'tags: [type/log]',
      '---',
      '# Weekly sync',
      '',
      '- [ ] task da NON mostrare come checkbox',
      '> [!note] callout',
      '> Quoted line',
      '```js',
      'code();',
      '```',
      'Discussione sul **pricing** con [[Andrea Rossi|Andrea]].',
      '![[image.png]]',
    ].join('\n');
    const result = createScanText(source, 'Weekly sync', 400);
    assert.ok(result.includes('Discussione sul pricing con Andrea'));
    assert.ok(!result.includes('code()'));
    assert.ok(!result.includes('['));
    assert.ok(!result.includes('#'));
    // The H1 that duplicates the note title is dropped.
    assert.ok(!result.startsWith('Weekly sync'));
  });

  it('truncates on a word boundary with ellipsis', () => {
    const result = createScanText('una frase piuttosto lunga che va tagliata', 't', 20);
    assert.ok(result.endsWith('…'));
    assert.ok(result.length <= 22);
    assert.ok(!result.includes('tagliata'));
  });
});

describe('normalizeCoverCandidate', () => {
  it('unwraps wikilinks and markdown images', () => {
    assert.equal(normalizeCoverCandidate('[[cover.png]]'), 'cover.png');
    assert.equal(normalizeCoverCandidate('![[cover.png|alt]]'), 'cover.png');
    assert.equal(normalizeCoverCandidate('![alt](https://x.io/i.png "t")'), 'https://x.io/i.png');
  });

  it('takes the first usable entry from arrays and strips quotes', () => {
    assert.equal(normalizeCoverCandidate([null, ' "img.png" ']), 'img.png');
  });

  it('rejects non-strings and empties', () => {
    assert.equal(normalizeCoverCandidate(42), undefined);
    assert.equal(normalizeCoverCandidate('   '), undefined);
    assert.equal(normalizeCoverCandidate(undefined), undefined);
  });
});
