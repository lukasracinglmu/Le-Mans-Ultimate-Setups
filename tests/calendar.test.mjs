import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarApi } from '../src/features/calendar.js';

const request = () => new Request('https://example.test/api/calendar');
const env = { LMUPORTAL_API1: 'calendar-test-key' };

async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('calendar expands LMU Portal published Daily slots when no race_event rows exist', async () => {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const utcToday = new Date(Math.floor(now.getTime() / dayMs) * dayMs);
  const weekStart = new Date(utcToday);
  const daysSinceTuesday = (weekStart.getUTCDay() + 5) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceTuesday);
  const weekKey = weekStart.toISOString().slice(0, 10);
  const dailyStart = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const dailySlot = dailyStart.toISOString().slice(11, 16);
  const weeklyStart = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  const specialStart = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();

  const tables = {
    week: [{ week_key: weekKey, status: 'live', visible: true, start_date: weekKey }],
    race_series: [
      {
        series_id: 10, week_key: weekKey, type: 'daily', series_name: 'Daily GT3',
        track_friendly: 'Spa', car_classes: ['GT3'], times_utc: [dailySlot],
        race_days: [utcToday.getUTCDay()], hidden: false,
      },
      {
        series_id: 20, week_key: weekKey, type: 'weekly', series_name: 'Weekly Hypercar',
        track_friendly: 'Monza', car_classes: ['HYPER-K'], times_utc: [],
        race_days: [], hidden: false,
      },
      {
        series_id: 30, week_key: weekKey, type: 'special_event', series_name: 'Special Event',
        track_friendly: 'Le Mans', car_classes: ['LMP2'], hidden: false,
      },
    ],
    race_event: [
      { event_id: 2, series_id: 20, race_starts_at: weeklyStart, track_name: 'Monza' },
      { event_id: 3, series_id: 30, race_starts_at: specialStart, track_name: 'Le Mans' },
    ],
  };

  await withFetch(async (url) => {
    const parsed = new URL(url);
    const table = parsed.pathname.split('/').pop();
    assert.ok(Object.hasOwn(tables, table), 'Unexpected table: ' + table);
    return Response.json(tables[table]);
  }, async () => {
    const response = await calendarApi(request(), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.success, true);
    assert.deepEqual(new Set(data.events.map((event) => event.type)), new Set(['daily', 'weekly', 'special']));
    const daily = data.events.find((event) => event.type === 'daily');
    assert.ok(daily, 'Daily slot should be synthesized from times_utc');
    assert.equal(daily.race, 'Daily GT3');
    assert.equal(daily.track, 'Spa');
    assert.equal(daily.startTime, dailyStart.toISOString());
  });
});

test('calendar ignores hidden series and weeks that are not published', async () => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekKey = weekStart.toISOString().slice(0, 10);
  const tables = {
    week: [
      { week_key: weekKey, status: 'live', visible: true, start_date: weekKey },
      { week_key: 'hidden-week', status: 'archived', visible: true, start_date: weekKey },
    ],
    race_series: [
      { series_id: 1, week_key: weekKey, type: 'daily', series_name: 'Hidden', hidden: true },
    ],
    race_event: [],
  };

  await withFetch(async (url) => {
    const table = new URL(url).pathname.split('/').pop();
    return Response.json(tables[table] || []);
  }, async () => {
    const response = await calendarApi(request(), env);
    const data = await response.json();
    assert.equal(data.success, true);
    assert.equal(data.events.length, 0);
  });
});
