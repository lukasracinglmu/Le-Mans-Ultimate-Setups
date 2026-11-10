import { json } from '../lib/http.js';

const DEFAULT_URL = 'https://lmuportal.net/api/schedule';

function portalUrl(env) {
  return String(env.LMUPORTAL_SCHEDULE_URL || DEFAULT_URL).trim();
}

function token(env, name) {
  return String(env?.[name] || '').trim();
}

function normalizeEvent(item) {
  const race = item.race || item.event || item.name || item.title || 'Race';
  const track = item.track || item.circuit || item.location || '';
  const start = item.startTime || item.start || item.date || item.datetime;
  if (!start) return null;
  return {
    id: String(item.id || item.slug || race + '-' + start),
    startTime: new Date(start).toISOString(),
    race,
    track,
    type: String(item.type || item.eventType || item.category || 'Daily').toLowerCase().includes('special') ? 'special' : String(item.type || item.eventType || item.category || 'daily').toLowerCase().includes('champ') ? 'championship' : 'daily',
    championship: Boolean(item.championship || item.isChampionship),
    class: String(item.class || item.carClass || item.categoryClass || item.vehicleClass || ''),
    safety: String(item.safety || item.safetyRating || item.requirements?.safety || ''),
    duration: item.duration || item.raceDuration || item.format?.duration || '',
    setup: item.setup || item.format?.setup || item.setupType || '',
    team: item.team || item.format?.team || item.format?.mode || '',
    source: item,
  };
}

export async function calendarApi(request, env) {
  if (request.method !== 'GET') return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
  const headers = { Accept: 'application/json' };
  const tokens = [token(env, 'LMUPORTAL_API1'), token(env, 'LMUPORTAL_API2')].filter(Boolean);
  let last = null;
  for (const auth of tokens) {
    try {
      const response = await fetch(portalUrl(env), {
        headers: { ...headers, Authorization: 'Bearer ' + auth, 'X-API-Key': auth },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) { last = response.status; continue; }
      const payload = await response.json();
      const list = Array.isArray(payload) ? payload : payload.events || payload.races || payload.schedule || payload.data || [];
      const events = list.map(normalizeEvent).filter(Boolean).sort((a,b) => Date.parse(a.startTime)-Date.parse(b.startTime));
      return json({ success: true, timezone: 'Europe/Berlin', updatedAt: new Date().toISOString(), events });
    } catch { last = 'network'; }
  }
  return json({ success: false, error: tokens.length ? 'LMU-Portal ist nicht erreichbar.' : 'LMU-Portal-Token fehlt.', status: last }, 503);
}
