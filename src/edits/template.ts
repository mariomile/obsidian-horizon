import type { MomentLike } from '../index/periodic.ts';
import type { DayKey } from '../types.ts';

const TITLE_RE = /{{title}}/gi;
const DATE_RE = /{{date(?::([^}]+))?}}/gi;
const TIME_RE = /{{time(?::([^}]+))?}}/gi;

/**
 * Core-Templates token substitution ({{title}}, {{date}}, {{date:FMT}},
 * {{time}}, {{time:FMT}}). Date tokens are resolved against the TARGET day the
 * note is created for; time tokens use the injected clock (defaults to empty —
 * the caller passes one bound to "now"). Templater syntax passes through.
 */
export function applyTemplate(
  source: string,
  moment: MomentLike,
  targetKey: DayKey,
  title: string,
  formatNow?: (fmt: string) => string,
): string {
  const target = moment(targetKey, 'YYYY-MM-DD', true);
  return source
    .replace(TITLE_RE, title)
    .replace(DATE_RE, (_whole, fmt: string | undefined) => target.format(fmt ?? 'YYYY-MM-DD'))
    .replace(TIME_RE, (whole, fmt: string | undefined) =>
      formatNow ? formatNow(fmt ?? 'HH:mm') : whole,
    );
}
