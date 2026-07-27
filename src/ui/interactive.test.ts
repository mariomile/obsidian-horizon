import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isActivationKey } from './interactive.ts';

describe('isActivationKey', () => {
  it('accepts Enter and Space', () => {
    assert.equal(isActivationKey('Enter'), true);
    assert.equal(isActivationKey(' '), true);
  });

  it('rejects non-activation keys', () => {
    for (const key of ['Escape', 'Space', 'Tab', 'ArrowRight']) {
      assert.equal(isActivationKey(key), false);
    }
  });
});
