import { Platform, requestUrl } from 'obsidian';
import type { App, Plugin } from 'obsidian';

import { addDays, todayKey } from '../kit/daykey.ts';
import type { GoogleSettings } from '../settings.ts';
import type { DayKey } from '../types.ts';
import {
  dedupeEvents,
  eventsOnDay,
  monthBounds,
  monthsBetween,
  monthsToEvict,
  parseCalendar,
  parseEvent,
} from './events.ts';
import type { CalEvent, CalendarInfo } from './events.ts';
import {
  REVOKE_ENDPOINT,
  TOKEN_ENDPOINT,
  buildAuthUrl,
  codeExchangeBody,
  parseRedirect,
  parseTokenResponse,
  pkceChallenge,
  randomToken,
  refreshBody,
} from './oauth.ts';
import type { TokenSet } from './oauth.ts';

const API = 'https://www.googleapis.com/calendar/v3';
/** Device-local secret: never written to the vault, never synced. */
const REFRESH_SECRET_ID = 'horizon-google-refresh-token';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

export type GoogleStatus = 'disconnected' | 'ready' | 'error';

class AuthError extends Error {}

/**
 * Read-only Google Calendar layer. Events are fetched per month on demand
 * (the first time a view asks for a day in that month), kept in memory, and
 * refetched every few minutes for the months near today or on screen; the
 * rest are dropped and fetched fresh if the user navigates back.
 */
export class GoogleCalendarService {
  private readonly app: App;
  private readonly settings: () => GoogleSettings;
  private readonly listeners = new Set<() => void>();
  private readonly months = new Map<string, CalEvent[]>();
  private readonly inFlight = new Set<string>();
  /** Months views asked for since the last refresh: what is on screen. */
  private readonly shown = new Set<string>();
  /** The periodic refresh was skipped while the window was hidden. */
  private refreshSkipped = false;
  /** Months whose last fetch failed: retried on the next refresh, not on every render. */
  private readonly failed = new Set<string>();
  private merged: CalEvent[] | null = null;
  private tokens: TokenSet | null = null;
  private calendarList: CalendarInfo[] | null = null;
  private calendarLoad: Promise<CalendarInfo[]> | null = null;
  private errorMessage = '';
  /** Bumped when the account or calendar selection changes: older fetches are dropped. */
  private generation = 0;
  /** Set when the plugin unloads: late callbacks and sign-ins fetch nothing. */
  private stopped = false;

  constructor(app: App, settings: () => GoogleSettings) {
    this.app = app;
    this.settings = settings;
  }

  start(plugin: Plugin): void {
    plugin.register(() => {
      this.stopped = true;
    });
    plugin.registerInterval(
      window.setInterval(() => {
        if (document.hidden) this.refreshSkipped = true;
        else void this.refresh();
      }, REFRESH_INTERVAL_MS),
    );
    plugin.registerDomEvent(document, 'visibilitychange', () => {
      if (document.hidden || !this.refreshSkipped) return;
      this.refreshSkipped = false;
      void this.refresh();
    });
    // No secret lookup or fetch before the workspace is ready.
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped && this.isActive()) this.ensureRange(addDays(todayKey(), -7), addDays(todayKey(), 31));
    });
  }

  get status(): GoogleStatus {
    if (!this.isConnected()) return 'disconnected';
    return this.errorMessage === '' ? 'ready' : 'error';
  }

  get lastError(): string {
    return this.errorMessage;
  }

  isConnected(): boolean {
    return (this.app.secretStorage.getSecret(REFRESH_SECRET_ID) ?? '') !== '';
  }

  /** Connected and switched on in settings. */
  isActive(): boolean {
    return this.settings().enabled && this.isConnected();
  }

  /** Calendars from the last fetch, or null before the first one. */
  calendars(): CalendarInfo[] | null {
    return this.calendarList;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Events on `key`, from memory. Asking for a day in a month not loaded yet
   * starts its fetch; subscribers are notified when it lands.
   */
  eventsOn(key: DayKey): CalEvent[] {
    if (!this.isActive()) return [];
    this.ensureRange(key, key);
    return eventsOnDay(this.all(), key);
  }

  /** Events on `key`, waiting for its month to load when needed. */
  async eventsFor(key: DayKey): Promise<CalEvent[]> {
    if (!this.isActive()) return [];
    const month = key.slice(0, 7);
    if (!this.months.has(month)) await this.loadMonth(month);
    return eventsOnDay(this.all(), key);
  }

  /** Every calendar on the account, fetching the list when not loaded yet. */
  async listCalendars(): Promise<CalendarInfo[]> {
    if (!this.isConnected()) return [];
    await this.visibleCalendars();
    return this.calendarList ?? [];
  }

  ensureRange(from: DayKey, to: DayKey): void {
    if (!this.isActive()) return;
    for (const month of monthsBetween(from, to)) {
      this.shown.add(month);
      if (this.months.has(month) || this.inFlight.has(month) || this.failed.has(month)) continue;
      void this.loadMonth(month);
    }
  }

  async refresh(): Promise<void> {
    if (!this.isActive()) return;
    this.calendarList = null;
    this.calendarLoad = null;
    this.failed.clear();
    // Views re-render and ask again for what they show, so `shown` is current
    // before anything is evicted.
    this.shown.clear();
    this.notify();
    for (const month of monthsToEvict(this.months.keys(), todayKey(), this.shown)) {
      this.months.delete(month);
      this.merged = null;
    }
    const loaded = [...this.months.keys()];
    // One redraw for the whole refresh, and only when something changed.
    const changed = await Promise.all(loaded.map((month) => this.loadMonth(month, true)));
    if (changed.some(Boolean)) this.notify();
  }

  /** Clear cached events, e.g. after the calendar selection changed. */
  reload(): void {
    if (this.stopped) return;
    this.generation += 1;
    this.months.clear();
    this.failed.clear();
    this.merged = null;
    this.calendarList = null;
    this.calendarLoad = null;
    this.notify();
    this.ensureRange(addDays(todayKey(), -7), addDays(todayKey(), 31));
  }

  /**
   * Desktop sign-in: open Google's consent page in the browser and catch the
   * redirect on a one-shot loopback listener.
   */
  async connect(): Promise<void> {
    if (!Platform.isDesktopApp) throw new Error('Connect Google from the desktop app.');
    const { clientId, clientSecret } = this.credentials();
    if (clientId === '' || clientSecret === '') {
      throw new Error('Add the client ID and client secret first.');
    }
    const verifier = randomToken();
    const state = randomToken(16);
    const challenge = await pkceChallenge(verifier);
    const http = await import('http');

    const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
      (resolve, reject) => {
        let redirectUri = '';
        const server = http.createServer((req, res) => {
          const result = parseRedirect(req.url ?? '/', state);
          if (result.kind === 'ignore') {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            result.kind === 'code'
              ? '<p>Horizon is connected to Google Calendar. You can close this tab.</p>'
              : '<p>Horizon could not connect to Google Calendar. Go back to Obsidian and try again.</p>',
          );
          finish();
          if (result.kind === 'code') resolve({ code: result.code, redirectUri });
          else reject(new Error(`Google sign-in failed: ${result.message}.`));
        });
        const timer = window.setTimeout(() => {
          finish();
          reject(new Error('Google sign-in timed out.'));
        }, LOGIN_TIMEOUT_MS);
        const finish = (): void => {
          window.clearTimeout(timer);
          server.close();
        };
        server.on('error', (error) => {
          finish();
          reject(error);
        });
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          if (address === null || typeof address === 'string') {
            finish();
            reject(new Error('Could not open a local port for sign-in.'));
            return;
          }
          redirectUri = `http://127.0.0.1:${address.port}`;
          window.open(buildAuthUrl({ clientId, redirectUri, challenge, state }));
        });
      },
    );

    const response = await requestUrl({
      url: TOKEN_ENDPOINT,
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      body: codeExchangeBody({ clientId, clientSecret, code, verifier, redirectUri }),
      throw: false,
    });
    const tokens = parseTokenResponse(response.json, Date.now());
    if (response.status >= 400 || !tokens?.refreshToken) {
      throw new Error('Google did not return a refresh token.');
    }
    this.app.secretStorage.setSecret(REFRESH_SECRET_ID, tokens.refreshToken);
    this.tokens = tokens;
    this.errorMessage = '';
    this.reload();
  }

  async disconnect(): Promise<void> {
    const refreshToken = this.app.secretStorage.getSecret(REFRESH_SECRET_ID) ?? '';
    this.app.secretStorage.setSecret(REFRESH_SECRET_ID, '');
    this.generation += 1;
    this.tokens = null;
    this.errorMessage = '';
    this.months.clear();
    this.merged = null;
    this.calendarList = null;
    this.calendarLoad = null;
    this.notify();
    if (refreshToken !== '') {
      // Best effort: the token is already gone from this device either way.
      await requestUrl({
        url: `${REVOKE_ENDPOINT}?token=${encodeURIComponent(refreshToken)}`,
        method: 'POST',
        throw: false,
      }).catch(() => undefined);
    }
  }

  private credentials(): { clientId: string; clientSecret: string } {
    const settings = this.settings();
    const secretId = settings.clientSecretId;
    return {
      clientId: settings.clientId.trim(),
      clientSecret: secretId === '' ? '' : (this.app.secretStorage.getSecret(secretId) ?? '').trim(),
    };
  }

  private all(): CalEvent[] {
    if (this.merged) return this.merged;
    const events: CalEvent[] = [];
    for (const monthEvents of this.months.values()) events.push(...monthEvents);
    this.merged = dedupeEvents(events);
    return this.merged;
  }

  /**
   * Fetch one month from every visible calendar. Returns whether anything
   * shown changed; `silent` leaves the redraw to the caller.
   */
  private async loadMonth(month: string, silent = false): Promise<boolean> {
    if (this.stopped) return false;
    const generation = this.generation;
    const previousError = this.errorMessage;
    this.inFlight.add(month);
    let changed = false;
    try {
      const calendars = await this.visibleCalendars();
      const { timeMin, timeMax } = monthBounds(month);
      // A calendar that fails on its own (a revoked share, a rate limit) is
      // skipped; only an expired sign-in fails the month.
      const perCalendar = await Promise.all(
        calendars.map((calendar) =>
          this.fetchEvents(calendar, timeMin, timeMax).catch((error: unknown) => {
            if (error instanceof AuthError) throw error;
            console.warn(`Horizon: skipped calendar ${calendar.name}`, error);
            return [];
          }),
        ),
      );
      if (generation !== this.generation) return false;
      // Primary first, so its copy of a shared meeting wins the dedupe.
      const events = perCalendar.flat();
      changed = JSON.stringify(this.months.get(month) ?? null) !== JSON.stringify(events);
      this.months.set(month, events);
      this.failed.delete(month);
      this.errorMessage = '';
    } catch (error) {
      if (generation !== this.generation) return false;
      this.failed.add(month);
      this.errorMessage =
        error instanceof AuthError
          ? 'Google sign-in expired. Reconnect in settings.'
          : 'Could not load Google Calendar events.';
      console.warn('Horizon: Google Calendar fetch failed', error);
    } finally {
      this.inFlight.delete(month);
    }
    changed ||= previousError !== this.errorMessage;
    if (changed) {
      this.merged = null;
      if (!silent) this.notify();
    }
    return changed;
  }

  private async visibleCalendars(): Promise<CalendarInfo[]> {
    // One list request even when several months load at once.
    this.calendarLoad ??= this.get(`${API}/users/me/calendarList?maxResults=250`).then((json) => {
      const items = Array.isArray(json.items) ? json.items : [];
      const list = items
        .map((item) => parseCalendar(item))
        .filter((c): c is CalendarInfo => c !== null)
        .sort((a, b) => Number(b.primary) - Number(a.primary));
      this.calendarList = list;
      return list;
    });
    let list: CalendarInfo[];
    try {
      list = await this.calendarLoad;
    } catch (error) {
      this.calendarLoad = null;
      throw error;
    }
    const hidden = new Set(this.settings().hiddenCalendars);
    return list.filter((c) => c.selected && !hidden.has(c.id));
  }

  private async fetchEvents(
    calendar: CalendarInfo,
    timeMin: string,
    timeMax: string,
  ): Promise<CalEvent[]> {
    const events: CalEvent[] = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
      });
      if (pageToken !== '') query.set('pageToken', pageToken);
      const json = await this.get(
        `${API}/calendars/${encodeURIComponent(calendar.id)}/events?${query.toString()}`,
      );
      const items = Array.isArray(json.items) ? json.items : [];
      for (const item of items) {
        const event = parseEvent(item, calendar);
        if (event) events.push(event);
      }
      pageToken = typeof json.nextPageToken === 'string' ? json.nextPageToken : '';
    } while (pageToken !== '');
    return events;
  }

  private async get(url: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(attempt > 0);
      const response = await requestUrl({
        url,
        headers: { Authorization: `Bearer ${token}` },
        throw: false,
      });
      if (response.status === 401 && attempt === 0) continue;
      if (response.status === 401) throw new AuthError('Unauthorized');
      if (response.status >= 400) throw new Error(`Google Calendar API ${response.status}`);
      const json: unknown = response.json;
      return typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
    }
    throw new AuthError('Unauthorized');
  }

  private async accessToken(forceRefresh: boolean): Promise<string> {
    if (!forceRefresh && this.tokens && this.tokens.expiresAt > Date.now()) {
      return this.tokens.accessToken;
    }
    const refreshToken = this.app.secretStorage.getSecret(REFRESH_SECRET_ID) ?? '';
    const { clientId, clientSecret } = this.credentials();
    if (refreshToken === '' || clientId === '' || clientSecret === '') {
      throw new AuthError('Missing credentials');
    }
    const response = await requestUrl({
      url: TOKEN_ENDPOINT,
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      body: refreshBody({ clientId, clientSecret, refreshToken }),
      throw: false,
    });
    // Only a rejected grant means the sign-in is gone; 5xx and 429 are transient.
    if (response.status === 400 || response.status === 401) throw new AuthError('Refresh rejected');
    const tokens = response.status < 400 ? parseTokenResponse(response.json, Date.now()) : null;
    if (!tokens) throw new Error(`Token refresh failed (${response.status})`);
    this.tokens = tokens;
    return tokens.accessToken;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
