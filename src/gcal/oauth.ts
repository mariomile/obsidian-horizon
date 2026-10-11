/**
 * Google OAuth for an installed ("Desktop app") client: authorization code
 * with PKCE and a loopback redirect. Pure helpers here; the loopback listener
 * and HTTP calls live in the service so this file stays testable under Node.
 */

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

export interface TokenSet {
  accessToken: string;
  /** Epoch ms after which the access token must be refreshed. */
  expiresAt: number;
  /** Only present on the first exchange; refreshes reuse the stored one. */
  refreshToken?: string;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** RFC 7636 S256 challenge for a code verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    state: params.state,
    // A refresh token is only issued with offline access, and only on consent.
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH_ENDPOINT}?${query.toString()}`;
}

export function codeExchangeBody(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): string {
  return new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    code_verifier: params.verifier,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  }).toString();
}

export function refreshBody(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): string {
  return new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: 'refresh_token',
  }).toString();
}

/** Parse a token endpoint response; `now` is injected for tests. */
export function parseTokenResponse(json: unknown, now: number): TokenSet | null {
  if (typeof json !== 'object' || json === null) return null;
  const data = json as Record<string, unknown>;
  if (typeof data.access_token !== 'string' || data.access_token === '') return null;
  const lifetime = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  const tokens: TokenSet = {
    accessToken: data.access_token,
    // Refresh a minute early so a request never races the expiry.
    expiresAt: now + (lifetime - 60) * 1000,
  };
  if (typeof data.refresh_token === 'string' && data.refresh_token !== '') {
    tokens.refreshToken = data.refresh_token;
  }
  return tokens;
}

/** Outcome of the redirect hitting the loopback listener. */
export type RedirectResult =
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'ignore' };

/** Interpret a loopback request path like `/?code=...&state=...`. */
export function parseRedirect(pathWithQuery: string, expectedState: string): RedirectResult {
  const url = new URL(pathWithQuery, 'http://127.0.0.1');
  // Browsers also ask for /favicon.ico and the like.
  if (url.pathname !== '/') return { kind: 'ignore' };
  const error = url.searchParams.get('error');
  if (error) return { kind: 'error', message: error };
  if (url.searchParams.get('state') !== expectedState) {
    return { kind: 'error', message: 'state mismatch' };
  }
  const code = url.searchParams.get('code');
  if (!code) return { kind: 'error', message: 'missing code' };
  return { kind: 'code', code };
}
