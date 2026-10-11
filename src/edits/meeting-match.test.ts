import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CalEvent } from '../gcal/events.ts';
import { localDayOf, meetingBasename, sameTitle } from './meeting-match.ts';

function event(title: string): CalEvent {
  return {
    id: 'e1',
    uid: 'e1',
    calendarId: 'c',
    calendarName: 'C',
    title,
    allDay: false,
    startDay: '2026-10-12',
    endDay: '2026-10-12',
    start: 0,
    end: 0,
    color: '',
  };
}

describe('meetingBasename', () => {
  it('strips characters that break file names and links', () => {
    assert.equal(meetingBasename(event('Sync: Q4 / roadmap [draft]')), 'Sync Q4 roadmap draft 2026-10-12');
    assert.equal(meetingBasename(event('???')), 'Meeting 2026-10-12');
  });
});

describe('sameTitle', () => {
  it('ignores case, punctuation and spacing', () => {
    assert.equal(sameTitle('Sprint Review', 'sprint  review!'), true);
    assert.equal(sameTitle('🚀 DeepAgent 2.0 | Team', 'DeepAgent 2.0 Team'), true);
    assert.equal(sameTitle('Standup', 'Sprint Review'), false);
    assert.equal(sameTitle('', ''), false);
  });
});

describe('localDayOf', () => {
  it('converts a UTC timestamp to the local day', () => {
    const iso = new Date(2026, 9, 12, 0, 30).toISOString();
    assert.equal(localDayOf(iso), '2026-10-12');
    assert.equal(localDayOf('garbage'), null);
    assert.equal(localDayOf(42), null);
  });
});
