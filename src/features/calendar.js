import { json } from '../lib/http.js';

const REST_URL = 'https://db.lmuportal.space/rest/v1';
const PUBLIC_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3Njg3MDc4MCwiZXhwIjo0OTMyNTQ0MzgwLCJyb2xlIjoiYW5vbiJ9.aE59DqdkNMhjsD82MmAc2AYnwp2KENVjzoHTyWmUx3Y';

function keys(env) {
  return [env?.LMUPORTAL_API1, env?.LMUPORTAL_API2, PUBLIC_ANON_KEY]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

async function getTable(name, query, apiKey) {
  const response = await fetch(REST_URL + '/' + name + '?' + query, {
    headers: { Accept: 'application/json', apikey: apiKey, Authorization: 'Bearer ' + apiKey },
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
  const type = compactType.includes('special')
    ? 'special'
    : compactType.includes('championship') || compactType.includes('weekly')
      ? 'championship'
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
  };
}

export async function calendarApi(request, env) {
  if (request.method !== 'GET') return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);

  const now = new Date();
  const from = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const weekQuery = 'select=week_key,status,start_date,visible&visible=eq.true&start_date=gte.' + from
    + '&start_date=lte.' + to + '&order=week_key';
  let lastError = null;

  for (const apiKey of keys(env)) {
    try {
      const weeks = await getTable('week', weekQuery, apiKey);
      const weekKeys = [...new Set(weeks.map((row) => row.week_key).filter(Boolean))];
      if (!weekKeys.length) {
        return json({
          success: true,
          timezone: 'Europe/Berlin',
          updatedAt: new Date().toISOString(),
          events: [],
        });
      }

      const inList = '(' + weekKeys.map((key) => String(key).replace(/[(),]/g, '')).join(',') + ')';
      const [series, events] = await Promise.all([
        getTable('race_series', 'select=*&week_key=in.' + encodeURIComponent(inList) + '&order=series_name', apiKey),
        getTable('race_event', 'select=*&week_key=in.' + encodeURIComponent(inList) + '&order=race_starts_at', apiKey),
      ]);
      const bySeries = new Map(series.map((item) => [String(item.series_id), item]));
      const seen = new Set();
      const normalized = [];

      for (const event of events) {
        const item = bySeries.get(String(event.series_id));
        if (!item) continue;
        const normalizedEvent = normalize(item, event);
        if (!normalizedEvent || seen.has(normalizedEvent.id)) continue;
        seen.add(normalizedEvent.id);
        normalized.push(normalizedEvent);
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
