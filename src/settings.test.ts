import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS, parseSettings } from './settings.ts';

describe('parseSettings', () => {
  it('returns defaults for null and garbage', () => {
    assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings(undefined), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('nope'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings([1, 2]), DEFAULT_SETTINGS);
  });

  it('round-trips a full valid settings object', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.agendaHorizonDays = 30;
    settings.lastMode = 'agenda';
    settings.periods.monthly.enabled = true;
    assert.deepEqual(parseSettings(settings), settings);
  });

  it('merges partial period configs with defaults', () => {
    const parsed = parseSettings({ periods: { daily: { folder: 'Custom/Daily' } } });
    assert.equal(parsed.periods.daily.folder, 'Custom/Daily');
    assert.equal(parsed.periods.daily.format, DEFAULT_SETTINGS.periods.daily.format);
    assert.deepEqual(parsed.periods.weekly, DEFAULT_SETTINGS.periods.weekly);
  });

  it('rejects invalid field types falling back to defaults', () => {
    const parsed = parseSettings({
      agendaHorizonDays: 'venti',
      showWeekNumbers: 1,
      lastMode: 'yearly-pivot',
      periods: { daily: { enabled: 'yes' } },
    });
    assert.equal(parsed.agendaHorizonDays, DEFAULT_SETTINGS.agendaHorizonDays);
    assert.equal(parsed.showWeekNumbers, DEFAULT_SETTINGS.showWeekNumbers);
    assert.equal(parsed.lastMode, 'month');
    assert.equal(parsed.periods.daily.enabled, true);
  });

  it('never aliases the DEFAULT_SETTINGS object', () => {
    const parsed = parseSettings(null);
    parsed.periods.daily.folder = 'Mutated';
    assert.equal(DEFAULT_SETTINGS.periods.daily.folder, '');
  });
});
