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
      headers.set("Cache-Control", "public, max-age=86400");
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
        <img id="manufacturerImage" src="/assets/manufacturers/go-setups.webp" alt="GO Setups">
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
.upcoming-dock{display:flex!important;flex-direction:column;flex:0 0 auto;width:240px;height:570px;min-width:205px;max-width:min(420px,40vw);min-height:230px;max-height:calc(100vh - 68px);position:sticky;top:68px;margin:0;padding:15px 12px 12px;border:0;border-right:1px solid var(--border);border-bottom:1px solid var(--border);border-radius:0 0 10px 0;background:color-mix(in srgb,var(--surface) 96%,transparent);backdrop-filter:blur(12px);box-shadow:var(--shadow);resize:both;overflow:auto;z-index:5}
.upcoming-widget-head{position:sticky;top:-15px;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin:-15px -12px 10px;padding:15px 12px 10px;background:color-mix(in srgb,var(--surface) 97%,transparent);border-bottom:1px solid var(--border)}
.upcoming-widget-head h2{font-size:18px;margin:2px 0 0}.upcoming-kicker{font-size:9px;font-weight:800;letter-spacing:.12em;color:var(--muted)}.resize-note{font-size:15px;color:var(--muted);user-select:none}.upcoming-status{font-size:12px;color:var(--muted);padding:8px 2px}.upcoming-status.error{color:var(--danger)}.upcoming-dock .race-list{display:grid;gap:8px}.upcoming-dock .race{background:var(--surface2);padding:10px;border:1px solid var(--border);border-radius:8px}.upcoming-dock .race-name{font-size:13px;font-weight:800;line-height:1.25}.upcoming-dock .race-meta{font-size:11px;line-height:1.4;color:var(--muted);margin-top:5px}.upcoming-source{margin-top:auto;padding:12px 2px 2px;font-size:9px;color:var(--muted)}.upcoming-source a{color:inherit}
.manufacturer-strip.manufacturer-carousel{display:flex;align-items:center;gap:9px;min-height:64px;margin-top:16px}.manufacturer-label{font-size:12px;color:var(--muted);white-space:nowrap}.manufacturer-visual{width:178px;height:58px;display:flex;align-items:center;justify-content:center;overflow:hidden}.manufacturer-visual img{display:block!important;visibility:visible!important;opacity:1;width:100%;height:100%;object-fit:contain;transition:opacity .22s ease}.manufacturer-name{display:none!important}.manufacturer-nav{width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:19px;line-height:1;background:var(--surface)}
@media(max-width:1100px){.upcoming-dock{width:220px;max-width:32vw}.layout:before{left:210px;opacity:.06}}
@media(max-width:800px){.layout{display:block}.upcoming-dock{position:relative;top:auto;width:calc(100% - 28px)!important;max-width:none;min-width:0;height:300px;max-height:60vh;margin:14px;border:1px solid var(--border);border-radius:12px;resize:vertical}.layout:before{left:5%;top:150px;width:90vw;height:60vh;opacity:.045}.brand-logo{width:76px!important;height:40px!important}main{padding-top:18px!important}.manufacturer-strip.manufacturer-carousel{flex-wrap:wrap}.manufacturer-label{width:100%}}
`;
  html = html.replace('</style>', css + '\n</style>');

  const js = `<script>
(() => {
  const manufacturers = [
    { name: 'GO Setups', src: '/assets/manufacturers/go-setups.webp' },
    { name: 'HYMO', src: '/assets/manufacturers/hymo-setups.webp' },
    { name: 'beAlien', src: '/assets/manufacturers/bealien.webp' }
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
      if (w) widget.style.width = clamp(w, 205, Math.min(420, innerWidth * .4)) + 'px';
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
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };
  const formatStart = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  };
  async function loadRaces() {
    if (!status || !list) return;
    status.className = 'upcoming-status';
    status.textContent = 'Rennen werden geladen…';
    list.replaceChildren();
    try {
      const response = await fetch('/api/upcoming-races', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Upcoming Races konnten nicht geladen werden.');
      const races = Array.isArray(data.races) ? data.races : [];
      if (!races.length) {
        status.textContent = data.switchover?.active ? 'Der LMU-Wochenwechsel läuft gerade. Bitte nach 10:05 UTC erneut prüfen.' : 'Keine Rennen in den nächsten 24 Stunden.';
        return;
      }
      status.textContent = data.stale ? 'Zwischengespeicherte Daten – LMU Portal ist gerade nicht erreichbar.' : '';
      for (const race of races) {
        const card = make('article', 'race');
        card.append(make('div', 'race-name', race.name || 'LMU Race'));
        const meta = [];
        if (race.track) meta.push(race.track + (race.trackLayout ? ' · ' + race.trackLayout : ''));
        const start = formatStart(race.startsAtUtc);
        if (start) meta.push(start);
        if (race.tier) meta.push(race.tier);
        if (Array.isArray(race.carClasses) && race.carClasses.length) meta.push(race.carClasses.join(', '));
        if (race.durationMinutes) meta.push(race.durationMinutes + ' Min');
        if (race.setup) meta.push('Setup: ' + race.setup);
        card.append(make('div', 'race-meta', meta.join(' · ')));
        list.append(card);
      }
    } catch (error) {
      status.className = 'upcoming-status error';
      status.textContent = error?.message || 'Upcoming Races konnten nicht geladen werden.';
    }
  }
  loadRaces();
})();
</script>`;

  return html.replace('</body>', js + '\n</body>');
}
