import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAuthUrl,
  codeExchangeBody,
  parseRedirect,
  parseTokenResponse,
  pkceChallenge,
  randomToken,
} from './oauth.ts';

describe('pkceChallenge', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    assert.equal(
      await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('produces url-safe random verifiers', () => {
    const token = randomToken();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(token, randomToken());
  });
});

describe('buildAuthUrl', () => {
  it('asks for offline read-only calendar access with PKCE', () => {
    const url = new URL(
      buildAuthUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:4321',
        challenge: 'chal',
        state: 'st',
      }),
    );
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.readonly');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:4321');
  });

  it('encodes the code exchange as a form body', () => {
    const body = new URLSearchParams(
      codeExchangeBody({
        clientId: 'cid',
        clientSecret: 'sec',
        code: 'a/b',
        verifier: 'v',
        redirectUri: 'http://127.0.0.1:1',
      }),
    );
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('code'), 'a/b');
    assert.equal(body.get('code_verifier'), 'v');
  });
});

describe('parseTokenResponse', () => {
  it('computes an early expiry and keeps the refresh token when present', () => {
    const tokens = parseTokenResponse(
      { access_token: 'at', expires_in: 3599, refresh_token: 'rt' },
      1_000_000,
    );
    assert.deepEqual(tokens, {
      accessToken: 'at',
      expiresAt: 1_000_000 + (3599 - 60) * 1000,
      refreshToken: 'rt',
    });
    assert.equal(parseTokenResponse({ access_token: 'at' }, 0)?.refreshToken, undefined);
    assert.equal(parseTokenResponse({ error: 'invalid_grant' }, 0), null);
  });
});

describe('parseRedirect', () => {
  it('accepts the code only with the expected state', () => {
    assert.deepEqual(parseRedirect('/?code=abc&state=s1', 's1'), { kind: 'code', code: 'abc' });
    assert.deepEqual(parseRedirect('/?code=abc&state=zz', 's1'), {
      kind: 'error',
      message: 'state mismatch',
    });
    assert.deepEqual(parseRedirect('/?error=access_denied&state=s1', 's1'), {
      kind: 'error',
      message: 'access_denied',
    });
    assert.deepEqual(parseRedirect('/favicon.ico', 's1'), { kind: 'ignore' });
  });
});
