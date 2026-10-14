import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  dedupeEvents,
  eventsOnDay,
  findCallUrl,
  monthsBetween,
  monthsToEvict,
  parseCalendar,
  parseEvent,
} from './events.ts';
import type { CalendarInfo } from './events.ts';

const CAL: CalendarInfo = {
  id: 'me@example.com',
  name: 'Personal',
  color: '#123456',
  primary: true,
  selected: true,
};

/** Local wall-clock instant as an ISO string with an explicit offset. */
function local(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

describe('parseEvent', () => {
  it('normalizes a timed event to local day and time', () => {
    const event = parseEvent(
      {
        id: 'a1',
        iCalUID: 'uid-1',
        summary: 'Sprint Review',
        start: { dateTime: local(2026, 10, 12, 9, 30) },
        end: { dateTime: local(2026, 10, 12, 10, 15) },
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
      },
      CAL,
    );
    assert.ok(event);
    assert.equal(event.startDay, '2026-10-12');
    assert.equal(event.endDay, '2026-10-12');
    assert.equal(event.startTime, '09:30');
    assert.equal(event.endTime, '10:15');
    assert.equal(event.allDay, false);
    assert.equal(event.uid, 'uid-1');
    assert.equal(event.meetUrl, 'https://meet.google.com/abc-defg-hij');
    assert.equal(event.color, '#123456');
  });

  it('treats the all-day end date as exclusive', () => {
    const one = parseEvent(
      { id: 'b', summary: 'Holiday', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } },
      CAL,
    );
    assert.equal(one?.startDay, '2026-10-12');
    assert.equal(one?.endDay, '2026-10-12');
    assert.equal(one?.allDay, true);
    const three = parseEvent(
      { id: 'c', summary: 'Trip', start: { date: '2026-10-30' }, end: { date: '2026-11-02' } },
      CAL,
    );
    assert.equal(three?.endDay, '2026-11-01');
  });

  it('does not spill a timed event ending at midnight into the next day', () => {
    const event = parseEvent(
      {
        id: 'd',
        summary: 'Late',
        start: { dateTime: local(2026, 10, 12, 22, 0) },
        end: { dateTime: local(2026, 10, 13, 0, 0) },
      },
      CAL,
    );
    assert.equal(event?.endDay, '2026-10-12');
  });

  it('drops cancelled and self-declined events', () => {
    const times = {
      start: { dateTime: local(2026, 10, 12, 9, 0) },
      end: { dateTime: local(2026, 10, 12, 10, 0) },
    };
    assert.equal(parseEvent({ id: 'e', status: 'cancelled', ...times }, CAL), null);
    assert.equal(
      parseEvent(
        { id: 'f', ...times, attendees: [{ self: true, responseStatus: 'declined' }] },
        CAL,
      ),
      null,
    );
    assert.ok(
      parseEvent({ id: 'g', ...times, attendees: [{ self: true, responseStatus: 'accepted' }] }, CAL),
    );
  });

  it('falls back to a placeholder title and rejects malformed items', () => {
    const event = parseEvent(
      { id: 'h', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } },
      CAL,
    );
    assert.equal(event?.title, '(No title)');
    assert.equal(parseEvent({ id: 'i' }, CAL), null);
    assert.equal(parseEvent('nope', CAL), null);
  });
});

describe('findCallUrl', () => {
  it('prefers the Meet link, then conference entry points, then text links', () => {
    assert.equal(
      findCallUrl({
        conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://x.zoom.us/j/1' }] },
      }),
      'https://x.zoom.us/j/1',
    );
    assert.equal(
      findCallUrl({ description: 'Join: https://us02web.zoom.us/j/8812?pwd=abc thanks' }),
      'https://us02web.zoom.us/j/8812?pwd=abc',
    );
    assert.equal(findCallUrl({ location: 'Via Roma 1, Milano' }), undefined);
  });
});

describe('parseCalendar', () => {
  it('prefers the user override name', () => {
    const cal = parseCalendar({
      id: 'x@group',
      summary: 'Raw',
      summaryOverride: 'Bootcamp',
      backgroundColor: '#abcdef',
      selected: true,
    });
    assert.deepEqual(cal, {
      id: 'x@group',
      name: 'Bootcamp',
      color: '#abcdef',
      primary: false,
      selected: true,
    });
  });
});

describe('dedupeEvents and eventsOnDay', () => {
  const make = (id: string, uid: string, h: number, allDay = false) => {
    const event = allDay
      ? parseEvent({ id, iCalUID: uid, start: { date: '2026-10-12' }, end: { date: '2026-10-13' } }, CAL)
      : parseEvent(
          {
            id,
            iCalUID: uid,
            summary: id,
            start: { dateTime: local(2026, 10, 12, h, 0) },
            end: { dateTime: local(2026, 10, 12, h + 1, 0) },
          },
          CAL,
        );
    assert.ok(event);
    return event;
  };

  it('keeps the first copy of a meeting seen on two calendars', () => {
    const result = dedupeEvents([make('p', 'u1', 9), make('w', 'u1', 9), make('q', 'u2', 9)]);
    assert.deepEqual(
      result.map((e) => e.id),
      ['p', 'q'],
    );
  });

  it('orders all-day first, then by start time', () => {
    const result = eventsOnDay([make('late', 'a', 15), make('early', 'b', 8), make('allday', 'c', 0, true)], '2026-10-12');
    assert.deepEqual(
      result.map((e) => e.id),
      ['allday', 'early', 'late'],
    );
    assert.deepEqual(eventsOnDay([make('x', 'd', 9)], '2026-10-13'), []);
  });
});

describe('monthsBetween', () => {
  it('spans year boundaries inclusively', () => {
    assert.deepEqual(monthsBetween('2026-11-20', '2027-01-03'), ['2026-11', '2026-12', '2027-01']);
    assert.deepEqual(monthsBetween('2026-10-01', '2026-10-31'), ['2026-10']);
  });
});

describe('monthsToEvict', () => {
  const loaded = ['2025-01', '2026-02', '2026-09', '2026-10', '2026-11', '2026-12', '2027-03'];

  it('keeps the prefetch window around today', () => {
    assert.deepEqual(monthsToEvict(loaded, '2026-10-14', new Set()), ['2025-01', '2026-02', '2026-09', '2026-12', '2027-03']);
  });

  it('keeps months a view is showing', () => {
    assert.deepEqual(monthsToEvict(loaded, '2026-10-14', new Set(['2026-02', '2027-03'])), ['2025-01', '2026-09', '2026-12']);
  });

  it('treats the window edges across a year boundary', () => {
    assert.deepEqual(monthsToEvict(['2026-12', '2027-01', '2027-02', '2027-03'], '2026-12-30', new Set()), ['2027-02', '2027-03']);
  });

  it('evicts nothing when everything is near', () => {
    assert.deepEqual(monthsToEvict(['2026-10'], '2026-10-14', new Set()), []);
  });
});
