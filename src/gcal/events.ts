import { addDays, dayKey } from '../kit/daykey.ts';
import type { DayKey } from '../types.ts';

/** A Google Calendar event, normalized to the local calendar. */
export interface CalEvent {
  id: string;
  /** iCalUID: the same meeting shows up once per calendar it lives on. */
  uid: string;
  calendarId: string;
  calendarName: string;
  title: string;
  allDay: boolean;
  /** First local day the event touches. */
  startDay: DayKey;
  /** Last local day the event touches (inclusive). */
  endDay: DayKey;
  /** Epoch ms. All-day events start at local midnight. */
  start: number;
  end: number;
  /** Local 'HH:mm', timed events only. */
  startTime?: string;
  endTime?: string;
  color: string;
  meetUrl?: string;
  htmlLink?: string;
  location?: string;
}

export interface CalendarInfo {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  /** Shown in Google Calendar's own list. */
  selected: boolean;
}

const CALL_URL_RE =
  /https:\/\/(?:meet\.google\.com\/[a-z-]+|[\w.-]*zoom\.us\/[^\s"<>]+|teams\.microsoft\.com\/[^\s"<>]+|teams\.live\.com\/[^\s"<>]+)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDay(date: Date): DayKey {
  return dayKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function localTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseAllDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** The video-call link: Meet first, then any Zoom/Teams URL in location or description. */
export function findCallUrl(raw: Record<string, unknown>): string | undefined {
  const hangout = str(raw.hangoutLink);
  if (hangout) return hangout;
  const conference = raw.conferenceData;
  if (isRecord(conference) && Array.isArray(conference.entryPoints)) {
    for (const entry of conference.entryPoints) {
      if (isRecord(entry) && entry.entryPointType === 'video') {
        const uri = str(entry.uri);
        if (uri) return uri;
      }
    }
  }
  for (const field of [raw.location, raw.description]) {
    const text = str(field);
    const match = text ? CALL_URL_RE.exec(text) : null;
    if (match) return match[0];
  }
  return undefined;
}

function declinedBySelf(raw: Record<string, unknown>): boolean {
  if (!Array.isArray(raw.attendees)) return false;
  return raw.attendees.some(
    (a) => isRecord(a) && a.self === true && a.responseStatus === 'declined',
  );
}

/**
 * Normalize one item of the Calendar API `events.list` response (requested
 * with singleEvents=true). Returns null for cancelled events, events the user
 * declined, and anything without a usable start/end.
 */
export function parseEvent(raw: unknown, calendar: CalendarInfo): CalEvent | null {
  if (!isRecord(raw)) return null;
  if (raw.status === 'cancelled' || declinedBySelf(raw)) return null;
  const id = str(raw.id);
  if (!id || !isRecord(raw.start) || !isRecord(raw.end)) return null;

  const base = {
    id,
    uid: str(raw.iCalUID) ?? id,
    calendarId: calendar.id,
    calendarName: calendar.name,
    title: str(raw.summary) ?? '(No title)',
    color: calendar.color,
    meetUrl: findCallUrl(raw),
    htmlLink: str(raw.htmlLink),
    location: str(raw.location),
  };

  const startDate = str(raw.start.date);
  const endDate = str(raw.end.date);
  if (startDate && endDate) {
    const start = parseAllDay(startDate);
    const endExclusive = parseAllDay(endDate);
    if (!start || !endExclusive) return null;
    const startDay = localDay(start);
    // Google's all-day end date is exclusive.
    const lastDay = addDays(localDay(endExclusive), -1);
    return {
      ...base,
      allDay: true,
      startDay,
      endDay: lastDay < startDay ? startDay : lastDay,
      start: start.getTime(),
      end: endExclusive.getTime(),
    };
  }

  const startIso = str(raw.start.dateTime);
  const endIso = str(raw.end.dateTime);
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  // An event ending exactly at midnight does not touch the next day.
  const lastInstant = new Date(Math.max(start.getTime(), end.getTime() - 1));
  return {
    ...base,
    allDay: false,
    startDay: localDay(start),
    endDay: localDay(lastInstant),
    start: start.getTime(),
    end: end.getTime(),
    startTime: localTime(start),
    endTime: localTime(end),
  };
}

/** Normalize one `calendarList.list` item. */
export function parseCalendar(raw: unknown): CalendarInfo | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  return {
    id,
    name: str(raw.summaryOverride) ?? str(raw.summary) ?? id,
    color: str(raw.backgroundColor) ?? '',
    primary: raw.primary === true,
    selected: raw.selected === true,
  };
}

/**
 * One copy per meeting: an invite accepted on two calendars arrives twice
 * with the same iCalUID and start. The first occurrence wins, so callers pass
 * the primary calendar's events first.
 */
export function dedupeEvents(events: CalEvent[]): CalEvent[] {
  const seen = new Set<string>();
  const result: CalEvent[] = [];
  for (const event of events) {
    const key = `${event.uid}@${event.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result;
}

/** All-day first, then by start time, then by title. */
export function compareEvents(a: CalEvent, b: CalEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.start !== b.start) return a.start - b.start;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

/** Events touching `key`, in display order. */
export function eventsOnDay(events: CalEvent[], key: DayKey): CalEvent[] {
  return events.filter((e) => e.startDay <= key && key <= e.endDay).sort(compareEvents);
}

/** 'YYYY-MM' month keys covering [from, to], inclusive. */
export function monthsBetween(from: DayKey, to: DayKey): string[] {
  const months: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** Local-midnight bounds of a 'YYYY-MM' month as RFC 3339 timestamps. */
export function monthBounds(month: string): { timeMin: string; timeMax: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return {
    timeMin: new Date(y, m - 1, 1).toISOString(),
    timeMax: new Date(y, m, 1).toISOString(),
  };
}

/**
 * Loaded months a refresh should drop: those outside the window around
 * `today` (the one the service prefetches) that no view is showing.
 */
export function monthsToEvict(loaded: Iterable<string>, today: DayKey, shown: ReadonlySet<string>): string[] {
  const keep = new Set(monthsBetween(addDays(today, -7), addDays(today, 31)));
  return [...loaded].filter((month) => !keep.has(month) && !shown.has(month));
}
