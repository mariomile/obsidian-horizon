import { isValidDayKey } from '../dates.ts';
import type { DayKey, TaskDateKind } from '../types.ts';

export interface ParsedTaskLine {
  indent: string;
  status: string;
  done: boolean;
  recurring: boolean;
  description: string;
  due?: DayKey;
  scheduled?: DayKey;
  doneDate?: DayKey;
  cancelledDate?: DayKey;
}

const TASK_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[(.)\]\s(.*)$/;
const BLOCK_ID_RE = /(\s\^[A-Za-z0-9-]+)\s*$/;
const PRIORITY_RE = /[🔺⏫🔼🔽⏬]/gu;
/** Recurrence rule text runs from 🔁 until the next field emoji or end of line. */
const RECURRENCE_RE = /🔁[^📅⏳✅❌➕🛫]*/u;

const KIND_EMOJI: Record<TaskDateKind, string> = {
  due: '📅',
  scheduled: '⏳',
  done: '✅',
};

/** All date-bearing field emojis, including ones we strip but do not surface. */
const ALL_FIELD_EMOJI = ['📅', '⏳', '✅', '❌', '➕', '🛫'];

function fieldDate(body: string, emoji: string): DayKey | undefined {
  const re = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u');
  const match = re.exec(body);
  const value = match?.[1];
  return value !== undefined && isValidDayKey(value) ? value : undefined;
}

export function parseTaskLine(raw: string): ParsedTaskLine | null {
  const match = TASK_RE.exec(raw);
  if (!match) return null;
  const indent = match[1] ?? '';
  const status = match[2] ?? ' ';
  const body = match[3] ?? '';

  let description = body;
  for (const emoji of ALL_FIELD_EMOJI) {
    // Strip only well-formed fields; a corrupt date stays visible in the description.
    description = description.replace(
      new RegExp(`\\s*${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'gu'),
      (whole, date: string) => (isValidDayKey(date) ? '' : whole),
    );
  }
  description = description
    .replace(RECURRENCE_RE, '')
    .replace(PRIORITY_RE, '')
    .replace(BLOCK_ID_RE, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    indent,
    status,
    done: status === 'x' || status === 'X',
    recurring: body.includes('🔁'),
    description,
    due: fieldDate(body, '📅'),
    scheduled: fieldDate(body, '⏳'),
    doneDate: fieldDate(body, '✅'),
    cancelledDate: fieldDate(body, '❌'),
  };
}

export function rewriteDate(line: string, kind: TaskDateKind, newKey: DayKey): string {
  const emoji = KIND_EMOJI[kind];
  const re = new RegExp(`(${emoji}\\s*)\\d{4}-\\d{2}-\\d{2}`, 'u');
  if (re.test(line)) return line.replace(re, `$1${newKey}`);
  const blockId = BLOCK_ID_RE.exec(line);
  if (blockId && blockId[1] !== undefined) {
    return `${line.slice(0, blockId.index)} ${emoji} ${newKey}${blockId[1]}`;
  }
  return `${line.trimEnd()} ${emoji} ${newKey}`;
}

function setStatus(line: string, indent: string, status: string): string {
  const openBracket = line.indexOf('[', indent.length);
  return line.slice(0, openBracket + 1) + status + line.slice(openBracket + 2);
}

/**
 * Toggle a task between todo and done, Tasks-plugin style (✅ done date).
 * Refuses recurring tasks (needs the rrule engine) and custom statuses.
 */
export function toggleDone(line: string, today: DayKey): { line: string; changed: boolean } {
  const parsed = parseTaskLine(line);
  if (!parsed || parsed.recurring) return { line, changed: false };
  if (parsed.status === ' ') {
    const completed = setStatus(line, parsed.indent, 'x');
    return { line: rewriteDate(completed, 'done', today), changed: true };
  }
  if (parsed.done) {
    const reopened = setStatus(line, parsed.indent, ' ').replace(
      /\s*✅\s*\d{4}-\d{2}-\d{2}/u,
      '',
    );
    return { line: reopened, changed: true };
  }
  return { line, changed: false };
}
