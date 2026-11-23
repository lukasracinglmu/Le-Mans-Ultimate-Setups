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

test('calendar loads daily, weekly and special races without relying on week_key', async () => {
  const calls = [];
  const events = [
    { event_id: 1, series_id: 10, race_starts_at: '2026-11-23T15:00:00Z', track_name: 'Spa' },
    { event_id: 2, series_id: 20, race_starts_at: '2026-11-23T15:15:00Z', track_name: 'Monza' },
    { event_id: 3, series_id: 30, race_starts_at: '2026-11-23T15:30:00Z', track_name: 'Le Mans' },
  ];
  const series = [
    { series_id: 10, type: 'daily', series_name: 'Daily GT3', car_classes: ['GT3'] },
    { series_id: 20, type: 'weekly', series_name: 'Weekly Hypercar', car_classes: ['Hypercar'] },
    { series_id: 30, type: 'special_event', series_name: 'Special Event', car_classes: ['LMP2'] },
  ];

  await withFetch(async (url, options) => {
    const parsed = new URL(url);
    calls.push({ table: parsed.pathname.split('/').pop(), parsed, options });
    if (parsed.pathname.endsWith('/race_event')) return Response.json(events);
    if (parsed.pathname.endsWith('/race_series')) return Response.json(series);
    throw Error('Unexpected table: ' + parsed.pathname);
  }, async () => {
    const response = await calendarApi(request(), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.success, true);
    assert.deepEqual(data.events.map((event) => event.type), ['daily', 'weekly', 'special']);
    assert.equal(data.events[0].race, 'Daily GT3');
  });

  const eventCall = calls.find((call) => call.table === 'race_event');
  const seriesCall = calls.find((call) => call.table === 'race_series');
  assert.ok(eventCall);
  assert.ok(seriesCall);
  assert.equal(eventCall.parsed.searchParams.has('week_key'), false);
  assert.match(eventCall.parsed.searchParams.get('race_starts_at'), /^gte\./);
  assert.match(eventCall.options.headers.Range, /^0-999$/);
  assert.match(seriesCall.parsed.searchParams.get('series_id'), /10/);
});

test('calendar paginates event rows so frequent daily races are not truncated', async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    event_id: index + 1,
    series_id: 77,
    race_starts_at: '2026-11-23T15:00:00Z',
  }));
  const secondPage = [{
    event_id: 1001,
    series_id: 77,
    race_starts_at: '2026-11-23T15:15:00Z',
  }];
  const ranges = [];

  await withFetch(async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/race_event')) {
      ranges.push(options.headers.Range);
      return Response.json(options.headers.Range === '0-999' ? firstPage : secondPage);
    }
    if (parsed.pathname.endsWith('/race_series')) {
      return Response.json([{ series_id: 77, type: 'daily', series_name: 'Daily Race' }]);
    }
    throw Error('Unexpected table: ' + parsed.pathname);
  }, async () => {
    const response = await calendarApi(request(), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.events.length, 1001);
    assert.deepEqual(ranges, ['0-999', '1000-1999']);
  });
});
