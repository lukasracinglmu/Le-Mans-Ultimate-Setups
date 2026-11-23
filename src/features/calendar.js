import { json } from '../lib/http.js';

const REST_URL = 'https://db.lmuportal.space/rest/v1';
const PUBLIC_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3Njg3MDc4MCwiZXhwIjo0OTMyNTQ0MzgwLCJyb2xlIjoiYW5vbiJ9.aE59DqdkNMhjsD82MmAc2AYnwp2KENVjzoHTyWmUx3Y';

function keys(env) {
  return [env?.LMUPORTAL_API1, env?.LMUPORTAL_API2, PUBLIC_ANON_KEY]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

async function getTable(name, query, apiKey, range) {
  const response = await fetch(REST_URL + '/' + name + '?' + query, {
    headers: {
      Accept: 'application/json',
      apikey: apiKey,
      Authorization: 'Bearer ' + apiKey,
      ...(range ? { 'Range-Unit': 'items', Range: range } : {}),
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw Error('LMU Portal ' + name + ' failed: ' + response.status + (detail ? ' ' + detail.slice(0, 180) : ''));
  }
  const data = await response.json();
  if (!Array.isArray(data)) throw Error('LMU Portal returned an invalid ' + name + ' response.');
  return data;
}

async function getAllTable(name, query, apiKey) {
  const pageSize = 1000;
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const page = await getTable(name, query, apiKey, offset + '-' + (offset + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
    if (offset >= 10000) throw Error('LMU Portal ' + name + ' exceeded the calendar pagination limit.');
  }
}

function normalizeClass(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.includes('LMGT3') || raw === 'GT3') return 'GT3';
  if (raw.includes('HYPER') || raw === 'HY') return 'HYPER-K';
  if (raw.includes('LMP2')) return 'LMP2';
  if (raw.includes('LMP3')) return 'LMP3';
  if (raw.includes('GTE')) return 'GTE';
  return String(value || '').trim();
}

function classNames(series) {
  const values = Array.isArray(series.car_classes) ? series.car_classes : [];
  return [...new Set(values.map((item) => {
    if (typeof item === 'string') return normalizeClass(item);
    if (item && typeof item === 'object') return normalizeClass(item.name || item.class_name || item.value);
    return '';
  }).filter(Boolean))];
}

function normalize(series, event) {
  const start = new Date(event.race_starts_at);
  if (!Number.isFinite(start.getTime())) return null;

  const rawType = String(series.type || 'daily').toLowerCase();
  const compactType = rawType.replace(/[\s_-]/g, '');
  // Weekly races are their own race mode, separate from Online Championships.
  const type = compactType.includes('special')
    ? 'special'
    : compactType.includes('championship')
      ? 'championship'
      : compactType.includes('weekly')
        ? 'weekly'
        : 'daily';
  const classes = classNames(series);
  const safetyValue = series.sr_requirement || series.safety_requirement || series.safety_rating || '';
  const safety = safetyValue && typeof safetyValue === 'object'
    ? String(safetyValue.name || safetyValue.label || safetyValue.rank || '')
    : String(safetyValue);

  return {
    id: String(event.event_id || event.id || series.series_id + '-' + start.toISOString()),
    startTime: start.toISOString(),
    race: String(series.series_name || series.name || 'Race'),
    track: String(series.track_friendly || series.track_name || event.track_name || ''),
    type,
    championship: type === 'championship',
    seriesId: String(series.series_id || ''),
    weekKey: String(series.week_key || event.week_key || ''),
    class: classes[0] || '',
    classes,
    safety,
    duration: series.race_duration_minutes ? series.race_duration_minutes + ' min' : '',
    setup: String(series.setup || '').toLowerCase().includes('fixed') ? 'Fixed' : 'Open',
    team: series.team_championship || series.driver_swap_enabled ? 'Team' : 'Solo',
    // Keep the original Portal payload so the detail view can display fields not used by the overview.
    seriesData: series,
    eventData: event,
  };
}

export async function calendarApi(request, env) {
  if (request.method !== 'GET') return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const utcMidnight = new Date(Math.floor(now.getTime() / dayMs) * dayMs);
  const until = new Date(now.getTime() + 60 * dayMs);
  let lastError = null;

  for (const apiKey of keys(env)) {
    try {
      // The Portal publishes Daily schedules as series-level UTC time slots.
      // Daily races are not guaranteed to have one race_event row per start.
      // Read the published weeks and series, then expand their official slots.
      const weeks = await getAllTable(
        'week',
        'select=week_key,status,visible,start_date&visible=eq.true&status=in.(live,upcoming)&order=week_key.asc',
        apiKey,
      );
      const visibleWeeks = weeks.filter((week) =>
        week.visible !== false && ['live', 'upcoming'].includes(String(week.status || '').toLowerCase()),
      );
      const weekKeys = [...new Set(visibleWeeks.map((week) => String(week.week_key || '')).filter(Boolean))];
      if (!weekKeys.length) {
        return json({ success: true, timezone: 'Europe/Berlin', updatedAt: new Date().toISOString(), events: [] });
      }

      const weekInList = '(' + weekKeys.map((key) => key.replace(/[(),]/g, '')).join(',') + ')';
      const seriesQuery = 'select=*&week_key=in.' + encodeURIComponent(weekInList)
        + '&hidden=eq.false&order=series_id.asc';
      const eventQuery = 'select=series_id,race_starts_at&week_key=in.'
        + encodeURIComponent(weekInList)
        + '&race_starts_at=gte.' + encodeURIComponent(utcMidnight.toISOString())
        + '&and=' + encodeURIComponent('(race_starts_at.lte.' + until.toISOString() + ')')
        + '&order=race_starts_at.asc,event_id.asc';

      const [series, datedEvents] = await Promise.all([
        getAllTable('race_series', seriesQuery, apiKey),
        getAllTable('race_event', eventQuery, apiKey),
      ]);

      const eventsBySeries = new Map();
      for (const event of datedEvents) {
        const id = String(event.series_id || '');
        if (!eventsBySeries.has(id)) eventsBySeries.set(id, []);
        eventsBySeries.get(id).push(event);
      }
      const weekByKey = new Map(visibleWeeks.map((week) => [String(week.week_key), week]));
      const normalized = [];
      const seen = new Set();

      for (const item of series) {
        if (item.hidden) continue;
        const week = weekByKey.get(String(item.week_key || ''));
        if (!week) continue;
        const rawType = String(item.type || '').toLowerCase();
        const dated = eventsBySeries.get(String(item.series_id)) || [];
        const eventRows = [...dated];

        // LMU Portal's published slots are the authoritative Daily/Weekly
        // timetable. Explicit race_event rows take priority on their UTC day.
        if (['daily', 'weekly'].includes(rawType)) {
          const weekStart = Date.parse(String(week.start_date || week.week_key) + 'T00:00:00Z');
          if (Number.isFinite(weekStart)) {
            const times = rawType === 'daily' && Array.isArray(item.todays_start_times_utc)
              && item.todays_start_times_utc.length
              ? item.todays_start_times_utc
              : item.times_utc;
            const slots = (Array.isArray(times) ? times : []).filter((time) =>
              typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time),
            );
            const days = Array.isArray(item.race_days) ? item.race_days : [];
            const datedDays = new Set(dated.map((event) => Date.parse(event.race_starts_at))
              .filter(Number.isFinite).map((at) => Math.floor(at / dayMs)));
            for (let day = Math.max(weekStart, utcMidnight.getTime()); day < weekStart + 7 * dayMs; day += dayMs) {
              if (datedDays.has(day / dayMs)) continue;
              const weekday = new Date(day).getUTCDay();
              if ((rawType === 'weekly' || days.length) && !days.includes(weekday)) continue;
              const date = new Date(day).toISOString().slice(0, 10);
              for (const slot of slots) {
                const raceStartsAt = date + 'T' + (slot.length === 5 ? slot + ':00' : slot) + 'Z';
                if (Date.parse(raceStartsAt) <= now.getTime()) continue;
                eventRows.push({
                  event_id: String(item.series_id) + '-' + raceStartsAt,
                  series_id: item.series_id,
                  race_starts_at: raceStartsAt,
                  week_key: item.week_key,
                  track_name: item.track_name,
                });
              }
            }
          }
        }

        for (const event of eventRows) {
          const normalizedEvent = normalize(item, event);
          if (!normalizedEvent || Date.parse(normalizedEvent.startTime) > until.getTime()) continue;
          if (seen.has(normalizedEvent.id)) continue;
          seen.add(normalizedEvent.id);
          normalized.push(normalizedEvent);
        }
      }

      normalized.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
      return json({
        success: true,
        timezone: 'Europe/Berlin',
        updatedAt: new Date().toISOString(),
        events: normalized,
      });
    } catch (error) {
      lastError = error;
    }
  }

  console.error('LMU Portal calendar request failed', lastError);
  return json({
    success: false,
    error: 'LMU-Portal ist nicht erreichbar.',
    detail: String(lastError?.message || 'unknown'),
  }, 503);
}
