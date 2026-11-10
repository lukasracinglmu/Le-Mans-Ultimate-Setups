import { json } from '../lib/http.js';

const REST_URL = 'https://db.lmuportal.space/rest/v1';
const PUBLIC_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3Njg3MDc4MCwiZXhwIjo0OTMyNTQ0MzgwLCJyb2xlIjoiYW5vbiJ9.aE59DqdkNMhjsD82MmAc2AYnwp2KENVjzoHTyWmUx3Y';

function keys(env) {
  return [env?.LMUPORTAL_API1, env?.LMUPORTAL_API2, PUBLIC_ANON_KEY]
    .map((value) => String(value || '').trim()).filter(Boolean);
}

async function getTable(name, query, apiKey) {
  const response = await fetch(REST_URL + '/' + name + '?' + query, {
    headers: { Accept: 'application/json', apikey: apiKey, Authorization: 'Bearer ' + apiKey },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error('LMU Portal table failed: ' + response.status);
  return response.json();
}

function normalizeClass(value) { const raw=String(value||'').toUpperCase(); return raw.includes('LMGT3')?'GT3':raw.includes('HYPER')||raw==='HYPERCAR'?'HYPER-K':raw.includes('LMP2')?'LMP2':raw.includes('GTE')?'GTE':raw.includes('LMP3')?'LMP3':String(value||''); }

function normalize(series, event) {
  const type = String(series.type || 'daily').toLowerCase();
  const classes = Array.isArray(series.car_classes) ? series.car_classes : [];
  return {
    id: String(event.event_id || series.series_id + '-' + event.race_starts_at),
    startTime: new Date(event.race_starts_at).toISOString(),
    race: series.series_name || 'Race',
    track: series.track_friendly || series.track_name || '',
    type: type.includes('special') ? 'special' : type.includes('champ') || type === 'weekly' ? 'championship' : type,
    championship: type.includes('champ') || type === 'weekly',
    seriesId: String(series.series_id || ''),
    weekKey: String(series.week_key || event.week_key || ''),
    class: normalizeClass(classes[0] || ''),
    safety: series.sr_requirement || '',
    duration: series.race_duration_minutes ? series.race_duration_minutes + ' min' : '',
    setup: String(series.setup || '').toLowerCase().includes('fixed') ? 'Fixed Setups' : 'Open Setups',
    team: series.team_championship || series.driver_swap_enabled ? 'Team Event' : 'Solo Event',
  };
}

export async function calendarApi(request, env) {
  if (request.method !== 'GET') return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
  const today = new Date();
  const from = new Date(today.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const weekQuery = 'select=week_key,status,start_date,visible&visible=eq.true&start_date=gte.' + from + '&start_date=lte.' + to + '&order=week_key';
  let lastError = null;
  for (const apiKey of keys(env)) {
    try {
      const weeks = await getTable('week', weekQuery, apiKey);
      const weekKeys = weeks.map((row) => row.week_key).filter(Boolean);
      if (!weekKeys.length) return json({ success: true, timezone: 'Europe/Berlin', updatedAt: new Date().toISOString(), events: [] });
      const inList = '(' + weekKeys.join(',') + ')';
      const series = await getTable('race_series', 'select=*&week_key=in.' + encodeURIComponent(inList) + '&order=series_name', apiKey);
      const events = await getTable('race_event', 'select=*&week_key=in.' + encodeURIComponent(inList) + '&order=race_starts_at', apiKey);
      const bySeries = new Map(series.map((item) => [item.series_id, item]));
      const normalized = events.filter((event) => event.race_starts_at && bySeries.has(event.series_id)).map((event) => normalize(bySeries.get(event.series_id), event));
      return json({ success: true, timezone: 'Europe/Berlin', updatedAt: new Date().toISOString(), events: normalized });
    } catch (error) {
      lastError = error;
    }
  }
  return json({ success: false, error: 'LMU-Portal ist nicht erreichbar.', detail: String(lastError?.message || 'unknown') }, 503);
}
