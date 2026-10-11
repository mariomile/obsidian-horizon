import type { CalEvent } from '../gcal/events.ts';

/** Characters Obsidian refuses in file names, plus link-breaking ones. */
const UNSAFE_NAME_RE = /[\\/:*?"<>|#^[\]]/g;

/** `<title> <day>`, or `<title> <day> <HHmm>` to tell same-titled meetings apart. */
export function meetingBasename(event: CalEvent, withTime = false): string {
  const title = event.title.replace(UNSAFE_NAME_RE, ' ').replace(/\s+/g, ' ').trim() || 'Meeting';
  const time = withTime && event.startTime ? ` ${event.startTime.replace(':', '')}` : '';
  return `${title} ${event.startDay}${time}`;
}

/** Same title once case, spacing and punctuation are ignored. */
export function sameTitle(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return norm(a) !== '' && norm(a) === norm(b);
}

export function localDayOf(iso: unknown): string | null {
  if (typeof iso !== 'string') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
