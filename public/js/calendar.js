import { initHeaderActions } from './home/header-actions.js';
import { logout } from './home/access.js';

initHeaderActions();

const themeButton = document.getElementById('themeButton');
const state = { events: [], view: 'series', timer: null };
const $ = (selector) => document.querySelector(selector);
const setText = (selector, value) => {
  const element = $(selector);
  if (element) element.textContent = value;
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

function syncTheme() {
  if (themeButton) {
    themeButton.textContent = document.documentElement.dataset.theme === 'light' ? 'Dark Mode' : 'Light Mode';
  }
}

themeButton?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('tpr-theme', next); } catch {}
  syncTheme();
});

document.querySelector('[data-action="logout"]')?.addEventListener('click', logout);
syncTheme();

async function loadAccount() {
  try {
    const response = await fetch('/api/me');
    const data = await response.json();
    if (!data.loggedIn) return;
    $('#loginButton')?.classList.add('hidden');
    const account = $('#account');
    account.style.display = 'flex';
    $('#accountName').textContent = data.user?.username || '';
    if (data.user?.avatar) {
      const avatar = $('#accountAvatar');
      avatar.src = data.user.avatar;
      avatar.style.display = 'block';
    }
  } catch {}
}
loadAccount();

function berlinParts(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(date)).reduce((parts, item) => {
    parts[item.type] = item.value;
    return parts;
  }, {});
}

function berlinDateKey(date) {
  const parts = berlinParts(date);
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function addDaysToKey(key, days) {
  const date = new Date(key + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function berlinMidnight(key) {
  const desired = Date.parse(key + 'T00:00:00Z');
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = berlinParts(guess);
    const actual = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute),
    );
    guess += desired - actual;
  }
  return guess;
}

function nextWeekRange() {
  const todayKey = berlinDateKey(Date.now());
  const today = new Date(todayKey + 'T12:00:00Z');
  const daysUntilMonday = (8 - today.getUTCDay()) % 7 || 7;
  const startKey = addDaysToKey(todayKey, daysUntilMonday);
  const endKey = addDaysToKey(startKey, 7);
  return { start: berlinMidnight(startKey), end: berlinMidnight(endKey), startKey, endKey };
}

function isTomorrow(date) {
  return addDaysToKey(berlinDateKey(Date.now()), 1) === berlinDateKey(date);
}

function startLabel(event, futureRange) {
  const parts = berlinParts(event.startTime);
  if (futureRange) return 'Next Week';
  if (isTomorrow(event.startTime)) return 'Tomorrow';
  if (berlinDateKey(event.startTime) === berlinDateKey(Date.now())) return 'Today';
  return parts.day + '.' + parts.month + '.';
}

function countdown(event) {
  const difference = Date.parse(event.startTime) - Date.now();
  if (difference <= 0 || difference > 30 * 60 * 1000) return null;
  const seconds = Math.floor(difference / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return {
    text: minutes + ':' + String(remainder).padStart(2, '0'),
    className: difference <= 5 * 60 * 1000 ? 'urgent' : difference <= 10 * 60 * 1000 ? 'soon' : '',
  };
}

function eventClasses(event) {
  const values = Array.isArray(event.classes) && event.classes.length ? event.classes : [event.class];
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function matchesFilters(event) {
  const query = ($('#search')?.value || '').trim().toLowerCase();
  const safety = ($('#safety')?.value || '').trim().toLowerCase();
  const carClass = ($('#class')?.value || '').trim().toLowerCase();
  const type = $('#type')?.value || ''; 
  const searchable = [event.race, event.track, event.seriesId].join(' ').toLowerCase();
  const classes = eventClasses(event).map((value) => value.toLowerCase());
  return (!query || searchable.includes(query))
    && (!safety || String(event.safety || '').toLowerCase() === safety)
    && (!carClass || classes.includes(carClass))
    && (!type || event.type === type);
}

function filteredEvents() {
  const now = Date.now();
  let events = state.events.filter((event) => Date.parse(event.startTime) > now && matchesFilters(event));
  if (state.view === 'future') {
    const range = nextWeekRange();
    events = events.filter((event) => {
      const time = Date.parse(event.startTime);
      return time >= range.start && time < range.end;
    });
  }
  if (state.view === 'championship') events = events.filter((event) => event.type === 'championship');
  if (state.view === 'special') events = events.filter((event) => event.type === 'special');
  return events.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

function classBadges(event) {
  return eventClasses(event).map((value) => {
    const css = value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const label = value === 'HYPER-K' ? 'HY' : value;
    return '<span class="pill ' + esc(css) + '">' + esc(label) + '</span>';
  }).join('');
}

function renderEvent(event) {
  const parts = berlinParts(event.startTime);
  const timer = countdown(event);
  const label = startLabel(event, state.view === 'future');
  const time = parts.hour + ':' + parts.minute;
  const typeLabel = event.type === 'special' ? 'Special Event'
    : event.type === 'championship' ? 'Championship' : 'Daily Race';
  const timerHtml = timer
    ? '<span class="countdown ' + timer.className + '">' + esc(timer.text) + '</span>'
    : '<span class="start-date">' + esc(label) + '</span>';
  const safety = event.safety || '—';
  const duration = event.duration || '—';
  const setup = event.setup === 'Fixed' ? 'Fixed Setups' : 'Open Setups';
  const format = event.team === 'Team' ? 'Team Event' : 'Solo Event';

  return '<div class="schedule-row" role="row">'
    + '<div class="start-cell">' + timerHtml
    + '<span class="start-at">at ' + esc(time) + '</span></div>'
    + '<div><div class="race-name">' + (event.championship ? '♜ ' : '')
    + esc(event.race) + '</div><div class="track-name">' + esc(event.track) + '</div>'
    + (event.type === 'special' ? '<div class="special-label">✦ SPECIAL EVENT</div>' : '')
    + '</div><div class="req"><span class="pill safety">' + esc(safety) + '</span>'
    + classBadges(event) + '<span class="format"><strong>' + esc(duration)
    + '</strong> race · <strong>' + esc(setup) + '</strong> · <strong>'
    + esc(format) + '</strong></span></div>'
    + '<div class="details-type ' + (event.type === 'special' ? 'special' : '') + '">'
    + esc(typeLabel) + '</div></div>';
}

function groupEvents(events) {
  if (state.view !== 'series' && state.view !== 'calendar') {
    return events.map(renderEvent).join('');
  }

  const groups = new Map();
  for (const event of events) {
    const key = state.view === 'series' ? event.seriesId || event.race : berlinDateKey(event.startTime);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  return [...groups.entries()].map(([, items]) => {
    const title = state.view === 'series'
      ? items[0].race
      : new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: 'long',
      }).format(new Date(items[0].startTime));
    return '<div class="calendar-group"><div class="calendar-group-title">' + esc(title)
      + '<span>' + items.length + ' ' + (items.length === 1 ? 'Race' : 'Races') + '</span></div>'
      + items.map(renderEvent).join('') + '</div>';
  }).join('');
}

function updateHeading(events) {
  const titles = {
    series: 'On the grid this week',
    calendar: 'Calendar',
    time: 'Upcoming by start time',
    championship: 'Championships',
    special: 'Special Events',
    future: 'Future Schedule',
  };
  setText('#scheduleTitle', titles[state.view] || titles.series);
  setText('#eventCount', events.length);
  const range = nextWeekRange();
  const futureLabel = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: 'short',
  }).format(new Date(range.start)) + ' – ' + new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(range.end - 1));
  setText('#weekLabel', state.view === 'future' ? futureLabel : 'This week on track');
}

function render() {
  const events = filteredEvents();
  updateHeading(events);
  const calendar = $('#calendar');
  if (calendar) calendar.innerHTML = events.length
    ? groupEvents(events)
    : '<div class="empty">No upcoming races match this view or its filters.</div>'; 
}

async function load() {
  const status = $('#status');
  if (status) status.textContent = 'Loading race schedule…';
  try {
    const response = await fetch('/api/calendar', { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw Error(data.detail || data.error || 'Race schedule could not be loaded.');
    }
    state.events = Array.isArray(data.events) ? data.events : [];
    if (status) status.textContent = state.events.length
      ? ''
      : 'The LMU Portal connection responded, but returned no upcoming races.';
    setText('#dateLabel', new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin', day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date()));
    render();
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(render, 1000);
  } catch (error) {
    if (status) status.textContent = 'Calendar loading failed: ' + error.message;
    const calendar = $('#calendar');
    if (calendar) calendar.innerHTML = '<div class="empty">The race schedule is temporarily unavailable.</div>'; 
  }
}

document.querySelectorAll('.portal-tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.portal-tab').forEach((tab) => {
      tab.classList.toggle('active', tab === button);
    });
    state.view = button.dataset.view;
    render();
  });
});

['#search', '#safety', '#class', '#type'].forEach((selector) => {
  $(selector)?.addEventListener('input', render);
});

load();
