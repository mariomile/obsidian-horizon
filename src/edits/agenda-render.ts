import type { MomentLike } from '../index/periodic.ts';
import type { DayBucket, DayKey, TaskEntry } from '../types.ts';

function noteBasename(path: string): string {
  const slash = path.lastIndexOf('/');
  return path.slice(slash + 1).replace(/\.md$/, '');
}

function openTasks(tasks: TaskEntry[]): TaskEntry[] {
  return tasks.filter((t) => !t.done && t.status !== '-');
}

/**
 * The target day's reality as markdown for the {{agenda}} template token.
 * Tasks render as plain bullets with a source link — NEVER as `- [ ]` lines,
 * which would duplicate the real task for the Tasks plugin.
 */
export function renderDayAgenda(bucket: DayBucket | null): string {
  if (!bucket) return '';
  const lines: string[] = [];
  const notes = [...bucket.notes].sort((a, b) =>
    (a.time ?? '99:99').localeCompare(b.time ?? '99:99'),
  );
  for (const note of notes) {
    lines.push(note.time ? `- ${note.time} · [[${note.title}]]` : `- [[${note.title}]]`);
  }
  for (const task of openTasks(bucket.due)) {
    lines.push(`- 📅 ${task.description} ([[${noteBasename(task.path)}]])`);
  }
  for (const task of openTasks(bucket.scheduled)) {
    lines.push(`- ⏳ ${task.description} ([[${noteBasename(task.path)}]])`);
  }
  return lines.join('\n');
}

export interface DigestDay {
  key: DayKey;
  bucket: DayBucket | null;
}

/**
 * Pre-compiled weekly review for the {{week-digest}} token: what got done,
 * what happened, what lands next week. Mario reads it, he doesn't compile it.
 */
export function renderWeekDigest(
  moment: MomentLike,
  days: DigestDay[],
  upcoming: TaskEntry[],
): string {
  const dayLabel = (key: DayKey): string => moment(key, 'YYYY-MM-DD', true).format('ddd D');

  const done: string[] = [];
  const happenings: string[] = [];
  for (const { key, bucket } of days) {
    if (!bucket) continue;
    for (const task of bucket.done) {
      done.push(`- ${dayLabel(key)}: ${task.description}`);
    }
    for (const note of bucket.notes) {
      happenings.push(
        note.time
          ? `- ${dayLabel(key)}: ${note.time} · [[${note.title}]]`
          : `- ${dayLabel(key)}: [[${note.title}]]`,
      );
    }
  }
  const next = openTasks(upcoming).map(
    (task) =>
      `- 📅 ${task.description} ([[${noteBasename(task.path)}]])${task.due ? ` — ${dayLabel(task.due)}` : ''}`,
  );

  const sections: string[] = [];
  if (done.length > 0) sections.push(`### Fatto\n${done.join('\n')}`);
  if (happenings.length > 0) sections.push(`### Meeting e note\n${happenings.join('\n')}`);
  if (next.length > 0) sections.push(`### In arrivo\n${next.join('\n')}`);
  return sections.join('\n\n');
}
