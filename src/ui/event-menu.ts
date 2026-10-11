import { Keymap, Menu } from 'obsidian';

import { findMeetingNote, openMeetingNote } from '../edits/meeting-note.ts';
import { openPeriodicNote } from '../edits/note-creator.ts';
import type { CalEvent } from '../gcal/events.ts';
import type { HorizonContext } from './context.ts';

function timeRange(event: CalEvent): string {
  if (event.allDay) return 'All day';
  return `${event.startTime ?? ''} – ${event.endTime ?? ''}`;
}

/** Actions for a calendar event: join, meeting note, daily note, Google. */
export function showEventMenu(
  ctx: HorizonContext,
  event: CalEvent,
  anchorEl: HTMLElement,
  domEvent: MouseEvent | KeyboardEvent,
): void {
  const paneType = Keymap.isModEvent(domEvent);
  const menu = new Menu();
  menu.addItem((item) =>
    item
      .setTitle(`${event.title} · ${timeRange(event)}`)
      .setIcon('calendar-clock')
      .setDisabled(true),
  );
  menu.addSeparator();
  if (event.meetUrl) {
    const url = event.meetUrl;
    menu.addItem((item) =>
      item
        .setTitle('Join call')
        .setIcon('video')
        .onClick(() => window.open(url)),
    );
  }
  const hasNote = findMeetingNote(ctx, event) !== null;
  menu.addItem((item) =>
    item
      .setTitle(hasNote ? 'Open meeting note' : 'Create meeting note')
      .setIcon(hasNote ? 'file-text' : 'file-plus')
      .onClick(() => void openMeetingNote(ctx, event, paneType)),
  );
  if (ctx.settings.periods.daily.enabled) {
    menu.addItem((item) =>
      item
        .setTitle('Open daily note')
        .setIcon('calendar-days')
        .onClick(() => void openPeriodicNote(ctx, 'daily', event.startDay, paneType)),
    );
  }
  if (event.htmlLink) {
    const link = event.htmlLink;
    menu.addItem((item) =>
      item
        .setTitle('Open in Google Calendar')
        .setIcon('external-link')
        .onClick(() => window.open(link)),
    );
  }
  if (domEvent instanceof MouseEvent && domEvent.detail > 0) {
    menu.showAtMouseEvent(domEvent);
  } else {
    const rect = anchorEl.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
  }
}
