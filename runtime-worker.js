import productionWorker from "./production-worker.js";

const STATIC_BRANDING = new Set([
  "/assets/header-logo.webp",
  "/assets/three-peaks-racing-logo.webp",
  "/assets/manufacturers/go-setups.webp",
  "/assets/manufacturers/hymo-setups.webp",
  "/assets/manufacturers/bealien.webp"
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && STATIC_BRANDING.has(url.pathname)) {
      const asset = await env.ASSETS.fetch(request);
      if (!asset.ok) return new Response("Asset not found", { status: 404 });
      const headers = new Headers(asset.headers);
      if (url.pathname.startsWith('/assets/manufacturers/')) headers.set("Cache-Control", "no-store, max-age=0");
      else headers.set("Cache-Control", "public, max-age=86400");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(asset.body, { status: asset.status, headers });
    }

    if (request.method === "GET" && url.pathname === "/") {
      const assetResponse = await env.ASSETS.fetch(request);
      if (!assetResponse.ok) return productionWorker.fetch(request, env, ctx);
      const html = enhanceHome(await assetResponse.text());
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin"
        }
      });
    }

    return productionWorker.fetch(request, env, ctx);
  }
};

function enhanceHome(source) {
  let html = source;

  html = html.replace(
    /<img class="brand-logo"[^>]*>/,
    '<img class="brand-logo" src="/assets/header-logo.webp" alt="Three Peaks Racing" width="96" height="48">'
  );

  html = html.replace(
    'Setups für Le Mans Ultimate – übersichtlich nach Fahrzeug, Variante und Rennserie.',
    'Setup Database für Three Peaks Racing'
  );

  html = html.replace(
    /<div class="manufacturer-strip"><span>Setup Hersteller:<\/span><span id="manufacturerName" class="manufacturer-name">GO<\/span><\/div>/,
    `<div class="manufacturer-strip manufacturer-carousel" aria-label="Setup Hersteller">
      <span class="manufacturer-label">Setup Hersteller</span>
      <button type="button" id="manufacturerPrev" class="manufacturer-nav" aria-label="Vorheriger Hersteller">‹</button>
      <div class="manufacturer-visual">
        <img id="manufacturerImage" src="/assets/manufacturers/go-setups.webp?v=e35ec9bc" alt="GO Setups">
        <span id="manufacturerName" class="manufacturer-name" aria-hidden="true">GO</span>
      </div>
      <button type="button" id="manufacturerNext" class="manufacturer-nav" aria-label="Nächster Hersteller">›</button>
    </div>`
  );

  html = html.replace(/\s*<section id="upcoming" class="upcoming">[\s\S]*?<\/section>\s*/, "\n");
  html = html.replace(/<div><label for="reqEvent">[\s\S]*?<\/div>/, "");
  html = html.replace(/<div><label for="reqVariant">[\s\S]*?<\/div>/, "");
  html = html.replace(/,eventName:\$\("reqEvent"\)\.value\.trim\(\),variant:\$\("reqVariant"\)\.value\.trim\(\)/g, "");
  html = html.replace(/initManufacturer\(\);/g, "");
  html = html.replace(/loadUpcoming\(\);/g, "");

  html = html.replace(
    '<div class="layout">\n<main>',
    `<div class="layout">
<aside id="upcoming" class="upcoming upcoming-dock show" aria-label="Upcoming Races">
  <div class="upcoming-widget-head">
    <div><span class="upcoming-kicker">LMU PORTAL</span><h2>Upcoming Races</h2></div>
    <span class="resize-note" title="Widget an der Ecke vergrößern oder verkleinern">↘</span>
  </div>
  <div class="race-filters" role="group" aria-label="Race Filter">
    <button type="button" class="race-filter active" data-filter="all">Alle</button>
    <button type="button" class="race-filter bronze" data-filter="bronze">Bronze</button>
    <button type="button" class="race-filter silver" data-filter="silver">Silver</button>
    <button type="button" class="race-filter gold" data-filter="gold">Gold</button>
  </div>
  <div id="upcomingStatus" class="upcoming-status">Rennen werden geladen…</div>
  <div id="raceList" class="race-list"></div>
  <div class="upcoming-source">Schedule information from <a href="https://lmuportal.com/" target="_blank" rel="noopener noreferrer">LMU Portal</a></div>
</aside>
<main>`
  );

  const css = `
/* Visible production fixes */
.brand-logo{width:96px!important;height:48px!important;object-fit:contain!important;display:block!important;visibility:visible!important;opacity:1!important;flex:0 0 auto}
.layout{position:relative;isolation:isolate}
.hero:after,.vehicle:after{display:none!important}
.layout:before{content:"";position:fixed;left:clamp(220px,18vw,340px);top:110px;width:min(58vw,760px);height:72vh;background:url('/assets/three-peaks-racing-logo.webp') center/contain no-repeat;opacity:.075;pointer-events:none;z-index:-1;filter:saturate(.85)}
.upcoming-dock{display:flex!important;flex-direction:column;flex:0 0 auto;width:260px;height:570px;min-width:220px;max-width:min(440px,42vw);min-height:230px;max-height:calc(100vh - 68px);position:sticky;top:68px;margin:0;padding:15px 12px 12px;border:0;border-right:1px solid var(--border);border-bottom:1px solid var(--border);border-radius:0 0 10px 0;background:color-mix(in srgb,var(--surface) 96%,transparent);backdrop-filter:blur(12px);box-shadow:var(--shadow);resize:both;overflow:hidden;z-index:5}
.upcoming-widget-head{position:sticky;top:-15px;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin:-15px -12px 8px;padding:15px 12px 10px;background:color-mix(in srgb,var(--surface) 97%,transparent);border-bottom:1px solid var(--border)}
.upcoming-widget-head h2{font-size:18px;margin:2px 0 0}.upcoming-kicker{font-size:9px;font-weight:800;letter-spacing:.12em;color:var(--muted)}.resize-note{font-size:15px;color:var(--muted);user-select:none}.upcoming-status{font-size:12px;color:var(--muted);padding:8px 2px}.upcoming-status.error{color:var(--danger)}
.race-filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}.race-filter{border:1px solid var(--border);border-radius:999px;background:var(--surface2);font-size:10px;font-weight:800;padding:6px 9px;cursor:pointer}.race-filter.active{outline:2px solid color-mix(in srgb,var(--text) 30%,transparent);outline-offset:1px}.race-filter.bronze{border-color:#8f5d35}.race-filter.silver{border-color:#aeb5bd}.race-filter.gold{border-color:#b89536}
.upcoming-dock .race-list{display:grid;gap:8px;overflow:auto;min-height:0;padding-right:2px}.upcoming-dock .race{padding:10px;border:1px solid var(--border);border-radius:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.upcoming-dock .race.bronze{background:linear-gradient(145deg,rgba(126,81,43,.44),rgba(74,46,29,.26));border-color:#8f5d35}.upcoming-dock .race.silver{background:linear-gradient(145deg,rgba(170,177,184,.24),rgba(95,102,110,.18));border-color:#aeb5bd}.upcoming-dock .race.gold{background:linear-gradient(145deg,rgba(166,128,40,.34),rgba(98,74,24,.22));border-color:#b89536}.race-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.race-tier{font-size:9px;font-weight:900;letter-spacing:.08em}.sr-badge{font-size:9px;font-weight:900;border-radius:999px;padding:4px 7px;border:1px solid currentColor;background:rgba(0,0,0,.14);white-space:nowrap}.sr-badge.bronze{color:#d69a62}.sr-badge.silver{color:#d5d9de}.sr-badge.gold{color:#e5c96b}.upcoming-dock .race-name{font-size:13px;font-weight:800;line-height:1.25;margin-top:6px}.upcoming-dock .race-meta{font-size:11px;line-height:1.4;color:var(--muted);margin-top:4px}.race-countdown{font-size:12px;font-weight:900;margin-top:7px}.upcoming-source{margin-top:8px;padding:8px 2px 2px;font-size:9px;color:var(--muted)}.upcoming-source a{color:inherit}
.manufacturer-strip.manufacturer-carousel{display:flex;align-items:center;gap:9px;min-height:64px;margin-top:16px}.manufacturer-label{font-size:12px;color:var(--muted);white-space:nowrap}.manufacturer-visual{width:178px;height:58px;display:flex;align-items:center;justify-content:center;overflow:hidden}.manufacturer-visual img{display:block!important;visibility:visible!important;opacity:1;width:100%;height:100%;object-fit:contain;transition:opacity .22s ease}.manufacturer-name{display:none!important}.manufacturer-nav{width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:19px;line-height:1;background:var(--surface)}
@media(max-width:1100px){.upcoming-dock{width:230px;max-width:34vw}.layout:before{left:210px;opacity:.06}}
@media(max-width:800px){.layout{display:block}.upcoming-dock{position:relative;top:auto;width:calc(100% - 28px)!important;max-width:none;min-width:0;height:340px;max-height:70vh;margin:14px;border:1px solid var(--border);border-radius:12px;resize:vertical}.layout:before{left:5%;top:150px;width:90vw;height:60vh;opacity:.045}.brand-logo{width:76px!important;height:40px!important}main{padding-top:18px!important}.manufacturer-strip.manufacturer-carousel{flex-wrap:wrap}.manufacturer-label{width:100%}}
`;
  html = html.replace('</style>', css + '\n</style>');

  const js = `<script>
(() => {
  const manufacturers = [
    { name: 'GO Setups', src: '/assets/manufacturers/go-setups.webp?v=e35ec9bc' },
    { name: 'HYMO', src: '/assets/manufacturers/hymo-setups.webp?v=c7456521' },
    { name: 'beAlien', src: '/assets/manufacturers/bealien.webp?v=628e3510' }
  ];
  const image = document.getElementById('manufacturerImage');
  let manufacturerIndex = 0;
  let manufacturerTimer = null;
  let transitionTimer = null;
  let transitionId = 0;

  const preloadManufacturers = () => Promise.all(manufacturers.map(item => new Promise(resolve => {
    const preload = new Image();
    preload.onload = () => resolve({ ok: true, item });
    preload.onerror = () => resolve({ ok: false, item });
    preload.src = item.src;
  })));

  const showManufacturer = (next, immediate = false) => {
    if (!image) return;
    manufacturerIndex = (next + manufacturers.length) % manufacturers.length;
    const selected = manufacturers[manufacturerIndex];
    const id = ++transitionId;
    clearTimeout(transitionTimer);

    const apply = () => {
      if (id !== transitionId) return;
      image.src = selected.src;
      image.alt = selected.name;
      const reveal = () => {
        if (id !== transitionId) return;
        image.style.opacity = '1';
      };
      if (image.complete && image.naturalWidth > 0) reveal();
      else {
        image.onload = reveal;
        image.onerror = reveal;
      }
    };

    if (immediate) {
      image.style.opacity = '1';
      apply();
      return;
    }
    image.style.opacity = '0';
    transitionTimer = setTimeout(apply, 220);
  };

  const restart = () => {
    clearInterval(manufacturerTimer);
    manufacturerTimer = setInterval(() => showManufacturer(manufacturerIndex + 1), 5000);
  };

  if (image) {
    preloadManufacturers().finally(() => {
      showManufacturer(0, true);
      restart();
    });
  }

  document.getElementById('manufacturerPrev')?.addEventListener('click', () => {
    showManufacturer(manufacturerIndex - 1);
    restart();
  });
  document.getElementById('manufacturerNext')?.addEventListener('click', () => {
    showManufacturer(manufacturerIndex + 1);
    restart();
  });

  const widget = document.getElementById('upcoming');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  try {
    if (widget && innerWidth > 800) {
      const w = Number(localStorage.getItem('upcomingWidgetWidth'));
      const h = Number(localStorage.getItem('upcomingWidgetHeight'));
      if (w) widget.style.width = clamp(w, 220, Math.min(440, innerWidth * .42)) + 'px';
      if (h) widget.style.height = clamp(h, 230, innerHeight - 68) + 'px';
    }
  } catch {}
  if (widget && 'ResizeObserver' in window) {
    let timer;
    new ResizeObserver(() => {
      if (innerWidth <= 800) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const rect = widget.getBoundingClientRect();
          localStorage.setItem('upcomingWidgetWidth', String(Math.round(rect.width)));
          localStorage.setItem('upcomingWidgetHeight', String(Math.round(rect.height)));
        } catch {}
      }, 180);
    }).observe(widget);
  }

  const status = document.getElementById('upcomingStatus');
  const list = document.getElementById('raceList');
  const filterButtons = [...document.querySelectorAll('.race-filter')];
  let allRaces = [];
  let activeFilter = 'all';
  let countdownTimer = null;
  let refreshTimer = null;

  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };

  const tierKey = value => {
    const t = String(value || '').trim().toLowerCase();
    if (['bronze','beginner'].includes(t)) return 'bronze';
    if (['silver','intermediate'].includes(t)) return 'silver';
    if (['gold','advanced'].includes(t)) return 'gold';
    return 'other';
  };

  const tierLabel = race => {
    const key = tierKey(race?.tier);
    if (key === 'bronze') return 'BRONZE DAILY';
    if (key === 'silver') return 'SILVER DAILY';
    if (key === 'gold') return 'GOLD DAILY';
    return String(race?.tier || 'DAILY').toUpperCase();
  };

  const srLabel = race => {
    const raw = String(race?.srRequirement || '').trim();
    return raw ? 'SR ' + raw : 'SR';
  };

  const formatMeta = race => {
    const meta = [];
    if (race.track) meta.push(race.track + (race.trackLayout ? ' · ' + race.trackLayout : ''));
    if (Array.isArray(race.carClasses) && race.carClasses.length) meta.push(race.carClasses.join(', '));
    if (race.durationMinutes) meta.push(race.durationMinutes + ' Min');
    if (race.setup) meta.push('Setup: ' + race.setup);
    return meta.join(' · ');
  };

  const formatCountdown = ms => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return (h ? String(h).padStart(2,'0') + ':' : '') + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  };

  const renderRaces = () => {
    if (!list || !status) return;
    const now = Date.now();
    allRaces = allRaces.filter(race => {
      const start = Date.parse(race?.startsAtUtc);
      return Number.isFinite(start) && start > now;
    });

    const visible = activeFilter === 'all' ? allRaces : allRaces.filter(race => tierKey(race.tier) === activeFilter);
    list.replaceChildren();

    if (!visible.length) {
      status.textContent = allRaces.length ? 'Keine Rennen für diesen Filter.' : 'Keine Rennen in den nächsten 24 Stunden.';
      return;
    }

    if (!status.classList.contains('error')) status.textContent = '';
    for (const race of visible) {
      const key = tierKey(race.tier);
      const startMs = Date.parse(race.startsAtUtc);
      const card = make('article', 'race ' + key);
      card.dataset.startsAt = race.startsAtUtc;
      card.append(
        (() => {
          const top = make('div','race-top');
          top.append(make('span','race-tier',tierLabel(race)), make('span','sr-badge ' + key,srLabel(race)));
          return top;
        })(),
        make('div','race-name',race.name || 'LMU Race'),
        make('div','race-meta',formatMeta(race)),
        make('div','race-countdown','Start in ' + formatCountdown(startMs - now))
      );
      list.append(card);
    }
  };

  const tickCountdowns = () => {
    const now = Date.now();
    let removed = false;
    for (const card of [...document.querySelectorAll('.race[data-starts-at]')]) {
      const start = Date.parse(card.dataset.startsAt || '');
      if (!Number.isFinite(start) || start <= now) {
        card.remove();
        removed = true;
        continue;
      }
      const node = card.querySelector('.race-countdown');
      if (node) node.textContent = 'Start in ' + formatCountdown(start - now);
    }
    const before = allRaces.length;
    allRaces = allRaces.filter(race => Date.parse(race.startsAtUtc) > now);
    if (removed || before !== allRaces.length) renderRaces();
  };

  filterButtons.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter || 'all';
    filterButtons.forEach(b => b.classList.toggle('active', b === button));
    renderRaces();
  }));

  async function loadRaces() {
    if (!status || !list) return;
    status.className = 'upcoming-status';
    status.textContent = 'Rennen werden geladen…';
    try {
      const response = await fetch('/api/upcoming-races', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Upcoming Races konnten nicht geladen werden.');
      allRaces = Array.isArray(data.races) ? data.races : [];
      status.textContent = data.stale ? 'Zwischengespeicherte Daten – LMU Portal ist gerade nicht erreichbar.' : '';
      renderRaces();
    } catch (error) {
      status.className = 'upcoming-status error';
      status.textContent = error?.message || 'Upcoming Races konnten nicht geladen werden.';
    }
  }

  clearInterval(countdownTimer);
  countdownTimer = setInterval(tickCountdowns, 1000);
  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadRaces, 5 * 60 * 1000);
  loadRaces();
})();
</script>`;

  return html.replace('</body>', js + '\n</body>');
}
