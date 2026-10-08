import baseWorker from "./worker.js";

const LMU_SCHEDULE_URL = "https://lmuportal.com/api/v1/schedule/current-week";
const LMU_CACHE_FRESH_MS = 75 * 60 * 1000;
const LMU_CACHE_STALE_MS = 6 * 60 * 60 * 1000;
const LMU_TIMEOUT_MS = 8000;
const DISCORD_API = "https://discord.com/api/v10";
const REQUEST_MODAL_ID = "lmu_setup_request";
const REPO_ASSETS = new Set([
  "/assets/header-logo.webp",
  "/assets/three-peaks-racing-logo.webp",
  "/assets/bp-logo.webp",
  "/assets/manufacturers/go-setups.webp",
  "/assets/manufacturers/hymo-setups.webp",
  "/assets/manufacturers/bealien.webp"
]);

let lmuInFlight = null;
let discordVerifyKeyCache = { key: null, expiresAt: 0 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "GET" && path === "/api/upcoming-races") {
        return upcomingRaces(request, env, ctx);
      }
      if (request.method === "POST" && path === "/api/request") {
        return createWebsiteRequest(request, env);
      }
      if (request.method === "POST" && path === "/interactions/discord") {
        return discordInteraction(request, env);
      }
      if (request.method === "GET" && REPO_ASSETS.has(path)) {
        return serveRepoAsset(request, env);
      }
      if (request.method === "GET" && path === "/") {
        return serveEnhancedHome(request, env);
      }
      return baseWorker.fetch(request, env, ctx);
    } catch (error) {
      console.error("Production worker route failed", error instanceof Error ? error.message : "unknown");
      return json({ success: false, error: "Interner Serverfehler." }, 500);
    }
  }
};

/* ── LMU Portal ── */
async function upcomingRaces(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/__cache/lmu-current-week", request.url).toString(), { method: "GET" });
  const cachedResponse = await cache.match(cacheKey);
  const cached = cachedResponse ? await safeJson(cachedResponse) : null;
  const age = cached?.fetchedAt ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;

  if (cached?.success && age < LMU_CACHE_FRESH_MS) {
    return json({ ...cached, cache: "hit", stale: false });
  }

  if (!lmuInFlight) {
    lmuInFlight = fetchAndNormalizeLmu(env)
      .then(async data => {
        const payload = { ...data, fetchedAt: new Date().toISOString(), success: true };
        const response = new Response(JSON.stringify(payload), {
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "Cache-Control": `public, max-age=${Math.floor(LMU_CACHE_STALE_MS / 1000)}`
          }
        });
        if (ctx?.waitUntil) ctx.waitUntil(cache.put(cacheKey, response.clone()));
        else await cache.put(cacheKey, response.clone());
        return payload;
      })
      .finally(() => { lmuInFlight = null; });
  }

  try {
    const fresh = await lmuInFlight;
    return json({ ...fresh, cache: "miss", stale: false });
  } catch (error) {
    if (cached?.success && age < LMU_CACHE_STALE_MS) {
      return json({ ...cached, cache: "stale", stale: true, warning: "LMU Portal ist vorübergehend nicht erreichbar." });
    }
    const status = Number(error?.status) || 502;
    const publicStatus = [401, 403, 429, 503].includes(status) ? status : 502;
    const messages = {
      401: "LMU Portal Authentifizierung fehlgeschlagen.",
      403: "LMU Portal Zugriff ist nicht freigegeben.",
      429: "LMU Portal Rate Limit erreicht. Bitte später erneut versuchen.",
      503: "LMU Portal ist vorübergehend nicht verfügbar."
    };
    return json({ success: false, error: messages[publicStatus] || "Upcoming Races konnten nicht geladen werden." }, publicStatus);
  }
}

async function fetchAndNormalizeLmu(env) {
  const tokens = [env.LMUPORTAL_API1, env.LMUPORTAL_API2].filter(Boolean);
  if (!tokens.length) throw Object.assign(new Error("LMU token missing"), { status: 503 });
  let lastError = null;
  for (let i = 0; i < tokens.length; i++) {
    try { return await fetchLmuWithToken(tokens[i]); }
    catch (error) {
      lastError = error;
      const status = Number(error?.status) || 0;
      if (![401, 403, 429].includes(status) || i === tokens.length - 1) throw error;
    }
  }
  throw lastError || Object.assign(new Error("LMU request failed"), { status: 502 });
}

async function fetchLmuWithToken(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LMU_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(LMU_SCHEDULE_URL, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "User-Agent": "Three-Peaks-Racing-Setup-Database/1.0"
      },
      signal: controller.signal
    });
  } catch (error) {
    throw Object.assign(new Error(error?.name === "AbortError" ? "LMU timeout" : "LMU network error"), { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw Object.assign(new Error(`LMU HTTP ${response.status}`), { status: response.status });
  }

  let body;
  try { body = await response.json(); }
  catch { throw Object.assign(new Error("LMU invalid JSON"), { status: 502 }); }

  if (!body || body.api_version !== "v1" || !Array.isArray(body.series)) {
    throw Object.assign(new Error("LMU invalid response"), { status: 502 });
  }

  const now = Date.now();
  const races = [];
  for (const series of body.series) {
    if (!series || typeof series.name !== "string" || !Array.isArray(series.occurrences)) continue;
    for (const occurrence of series.occurrences) {
      const startsAtUtc = occurrence?.starts_at_utc;
      const startMs = Date.parse(startsAtUtc);
      // FIX: already-started events filtered here on the server side
      if (!Number.isFinite(startMs) || startMs <= now) continue;
      races.push({
        name: series.name,
        track: typeof series.track === "string" ? series.track : null,
        trackLayout: typeof series.track_layout === "string" ? series.track_layout : null,
        startsAtUtc,
        date: startsAtUtc,
        tier: typeof series.tier === "string" ? series.tier : null,
        srRequirement: typeof series.sr_requirement === "string" ? series.sr_requirement : null,
        durationMinutes: Number.isFinite(series.duration_minutes) ? series.duration_minutes : null,
        carClasses: Array.isArray(series.car_classes) ? series.car_classes.filter(x => typeof x === "string") : [],
        setup: typeof series.setup === "string" ? series.setup : null
      });
    }
  }
  races.sort((a, b) => Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc));

  return {
    apiVersion: body.api_version,
    generatedAt: typeof body.generated_at === "string" ? body.generated_at : null,
    windowEndsAt: typeof body.window_ends_at === "string" ? body.window_ends_at : null,
    weekKey: typeof body.week_key === "string" ? body.week_key : null,
    weekStatus: typeof body.week_status === "string" ? body.week_status : null,
    switchover: normalizeSwitchover(body.switchover),
    races
  };
}

function normalizeSwitchover(value) {
  if (!value || typeof value !== "object") return null;
  return {
    boundaryUtc: typeof value.boundary_utc === "string" ? value.boundary_utc : null,
    calendarTuesday: typeof value.calendar_tuesday === "string" ? value.calendar_tuesday : null,
    active: value.active === true,
    pendingNewWeek: value.pending_new_week === true,
    newWeekAvailable: value.new_week_available === true,
    activeWeekKey: typeof value.active_week_key === "string" ? value.active_week_key : null
  };
}

/* ── Setup Request ── */
async function createWebsiteRequest(request, env) {
  const meRequest = new Request(new URL("/api/me", request.url), { method: "GET", headers: request.headers });
  const meResponse = await baseWorker.fetch(meRequest, env);
  const me = await safeJson(meResponse);
  if (!me?.loggedIn || !me?.user?.username) return json({ success: false, error: "Nicht angemeldet." }, 401);
  let body;
  try { body = await request.json(); }
  catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); }
  const data = {
    username: me.user.username,
    vehicle: clean(body.vehicle, 100),
    carClass: clean(body.carClass, 80),
    track: clean(body.track, 100),
    message: clean(body.message, 500)
  };
  if (!data.vehicle || !data.track) return json({ success: false, error: "Fahrzeug und Strecke erforderlich." }, 400);
  const sent = await sendSetupRequest(data, env);
  return sent.ok ? json({ success: true }) : json({ success: false, error: sent.error }, sent.status);
}

function buildRequestContent({ username, vehicle, carClass, track, message }, roleId) {
  const roleMention = roleId && /^\d{16,22}$/.test(roleId) ? `<@&${roleId}>` : null;
  const lines = [];
  if (roleMention) lines.push(roleMention);
  lines.push(
    "**Setup Request**",
    `**User:** ${clean(username, 80)}`,
    `**Fahrzeug:** ${clean(vehicle, 100)}`,
    `**Klasse:** ${clean(carClass || "Nicht angegeben", 80)}`,
    `**Strecke:** ${clean(track, 100)}`
  );
  const extra = clean(message, 500);
  if (extra) lines.push(`**Weitere Informationen:** ${extra}`);
  return lines.join("\n").slice(0, 2000);
}

async function sendSetupRequest(data, env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) {
    return { ok: false, status: 503, error: "Request-Dienst nicht konfiguriert." };
  }
  const roleId = env.DISCORD_SETUP_REQUEST_ROLE_ID || null;
  const content = buildRequestContent(data, roleId);
  const allowedMentions = roleId && /^\d{16,22}$/.test(roleId)
    ? { roles: [roleId] }
    : { parse: [] };
  const response = await fetch(`${DISCORD_API}/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: allowedMentions })
  });
  if (!response.ok) return { ok: false, status: 502, error: "Request konnte nicht gesendet werden." };
  return { ok: true };
}

/* ── Discord Interactions ── */
async function discordInteraction(request, env) {
  const rawBody = await request.text();
  const verified = await verifyDiscordInteraction(request, rawBody, env);
  if (!verified) return new Response("invalid request signature", { status: 401 });
  let interaction;
  try { interaction = JSON.parse(rawBody); }
  catch { return new Response("bad request", { status: 400 }); }
  if (interaction.type === 1) return discordJson({ type: 1 });
  if (interaction.type === 2 && interaction.data?.name === "request") {
    return discordJson(requestModalResponse());
  }
  if (interaction.type === 5 && interaction.data?.custom_id === REQUEST_MODAL_ID) {
    const values = modalValues(interaction.data.components);
    const user = interaction.member?.user || interaction.user || {};
    const data = {
      username: user.global_name || user.username || "Discord User",
      vehicle: clean(values.vehicle, 100),
      carClass: clean(values.class, 80),
      track: clean(values.track, 100),
      message: clean(values.message, 500)
    };
    if (!data.vehicle || !data.track) {
      return discordJson({ type: 4, data: { content: "Fahrzeug und Strecke sind erforderlich.", flags: 64 } });
    }
    const sent = await sendSetupRequest(data, env);
    return discordJson({ type: 4, data: { content: sent.ok ? "Setup Request wurde gesendet." : "Setup Request konnte nicht gesendet werden.", flags: 64 } });
  }
  const delegated = new Request(request.url, { method: "POST", headers: request.headers, body: rawBody });
  return baseWorker.fetch(delegated, env);
}

function requestModalResponse() {
  const input = (customId, label, options = {}) => ({
    type: 1,
    components: [{ type: 4, custom_id: customId, label, style: options.paragraph ? 2 : 1, required: options.required !== false, min_length: options.required === false ? undefined : 1, max_length: options.maxLength || 100, placeholder: options.placeholder }]
  });
  return {
    type: 9,
    data: {
      custom_id: REQUEST_MODAL_ID,
      title: "Setup Request",
      components: [
        input("vehicle", "Fahrzeug", { maxLength: 100, placeholder: "z. B. Porsche 963" }),
        input("class", "Klasse", { maxLength: 80, placeholder: "z. B. Hypercar" }),
        input("track", "Strecke", { maxLength: 100, placeholder: "z. B. Le Mans" }),
        input("message", "Weitere Informationen", { required: false, paragraph: true, maxLength: 500, placeholder: "Optional" })
      ]
    }
  };
}

function modalValues(rows) {
  const result = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const component of Array.isArray(row?.components) ? row.components : []) {
      if (component?.custom_id) result[component.custom_id] = component.value || "";
    }
  }
  return result;
}

async function getDiscordVerifyKey(env) {
  if (discordVerifyKeyCache.key && discordVerifyKeyCache.expiresAt > Date.now()) return discordVerifyKeyCache.key;
  if (!env.DISCORD_BOT_TOKEN) return null;
  const response = await fetch(`${DISCORD_API}/oauth2/applications/@me`, { headers: { "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}` } });
  if (!response.ok) return null;
  const app = await response.json();
  const key = app.verify_key || null;
  if (key) discordVerifyKeyCache = { key, expiresAt: Date.now() + 60 * 60 * 1000 };
  return key;
}

async function verifyDiscordInteraction(request, rawBody, env) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp) return false;
  const publicKeyHex = await getDiscordVerifyKey(env);
  const publicKey = hexToBytes(publicKeyHex);
  const signatureBytes = hexToBytes(signature);
  if (!publicKey || !signatureBytes) return false;
  try {
    const key = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, new TextEncoder().encode(timestamp + rawBody));
  } catch { return false; }
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}

/* ── Enhanced Home ── */
async function serveEnhancedHome(request, env) {
  const owner = env.GITHUB_OWNER || "lukasracinglmu";
  const repo = env.GITHUB_REPO || "Le-Mans-Ultimate-Setups";
  const branch = env.GITHUB_BRANCH || "main";
  const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/index.html`, { cache: "no-store" });
  if (!response.ok) return baseWorker.fetch(request, env);
  const html = enhanceHome(await response.text());
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }
  });
}

function enhanceHome(source) {
  let html = source;

  // Header logo
  html = html.replace(
    /<link rel="preload" href="\/assets\/three-peaks-racing-logo\.webp" as="image" type="image\/webp">/,
    '<link rel="preload" href="/assets/header-logo.webp" as="image" type="image/webp">\n<link rel="preload" href="/assets/bp-logo.webp" as="image" type="image/webp">'
  );
  html = html.replace(
    /<img class="brand-logo"[^>]*>/,
    '<img class="brand-logo" src="/assets/header-logo.webp" alt="Three Peaks Racing" width="96" height="48">'
  );
  html = html.replace(
    'Setups für Le Mans Ultimate – übersichtlich nach Fahrzeug, Variante und Rennserie.',
    'Setup Database für Three Peaks Racing'
  );

  // Manufacturer carousel
  html = html.replace(
    /<div class="manufacturer-strip"><span>Setup Hersteller:<\/span><span id="manufacturerName" class="manufacturer-name">GO<\/span><\/div>/,
    `<div class="manufacturer-strip manufacturer-carousel" aria-label="Setup Hersteller">
      <span class="manufacturer-label">Setup Hersteller</span>
      <button type="button" id="manufacturerPrev" class="manufacturer-nav" aria-label="Vorheriger Hersteller">‹</button>
      <div class="manufacturer-visual"><img id="manufacturerImage" src="/assets/manufacturers/go-setups.webp" alt="GO Setups"><span id="manufacturerName" class="manufacturer-name" aria-hidden="true">GO</span></div>
      <button type="button" id="manufacturerNext" class="manufacturer-nav" aria-label="Nächster Hersteller">›</button>
    </div>`
  );

  // Remove old upcoming section and unused form fields
  html = html.replace(/\s*<section id="upcoming" class="upcoming">[\s\S]*?<\/section>\s*/, "\n");
  html = html.replace(/<div><label for="reqEvent">[\s\S]*?<\/div>/, "");
  html = html.replace(/<div><label for="reqVariant">[\s\S]*?<\/div>/, "");
  html = html.replace(/,eventName:\$\("reqEvent"\)\.value\.trim\(\),variant:\$\("reqVariant"\)\.value\.trim\(\)/g, "");
  html = html.replace(/initManufacturer\(\);/g, "");
  html = html.replace(/loadUpcoming\(\);/g, "");

  // PRIO 5: Move Upcoming Races to RIGHT side — insert after <main> instead of before
  // PRIO 5: Fixed size, no resize
  html = html.replace(
    '<div class="layout">\n<main>',
    `<div class="layout">
<main>`
  );

  // Insert upcoming-dock AFTER </main> closing
  html = html.replace(
    '</main>\n</div>',
    `</main>
<aside id="upcoming" class="upcoming upcoming-dock show" aria-label="Upcoming Races">
  <div class="upcoming-widget-head"><div><span class="upcoming-kicker">LMU PORTAL</span><h2>Upcoming Races</h2></div></div>
  <div id="upcomingStatus" class="upcoming-status">Rennen werden geladen…</div>
  <div id="raceList" class="race-list"></div>
  <div class="upcoming-source">Schedule from <a href="https://lmuportal.com/" target="_blank" rel="noopener noreferrer">LMU Portal</a></div>
</aside>
</div>`
  );

  // CSS
  const extraCss = `
/* ── Production Enhancements ── */
.brand-logo{width:96px!important;height:48px!important;object-fit:contain!important;display:block!important;visibility:visible!important;opacity:1!important;flex:0 0 auto}

/* PRIO 1: BP Logo as background watermark — transparent PNG, no bg color issue */
.layout{position:relative;isolation:isolate}
.hero:after,.vehicle:after{display:none!important}
body:before{
  content:"";
  position:fixed;
  left:50%;top:50%;
  transform:translate(-50%,-50%);
  width:min(55vw,700px);
  height:min(36vw,460px);
  background:url('/assets/bp-logo.webp') center/contain no-repeat;
  opacity:.07;
  pointer-events:none;
  z-index:0;
}
main,aside.upcoming-dock{position:relative;z-index:1}

/* PRIO 4+5: Upcoming Races — RIGHT side, FIXED size, NO resize */
.layout{display:flex;align-items:flex-start}
.upcoming-dock{
  display:flex!important;
  flex-direction:column;
  flex:0 0 260px;
  width:260px;
  height:calc(100vh - 68px);
  position:sticky;
  top:68px;
  margin:0;
  padding:15px 12px 12px;
  border:0;
  border-left:1px solid var(--border);
  background:color-mix(in srgb,var(--surface) 96%,transparent);
  backdrop-filter:blur(12px);
  box-shadow:var(--shadow);
  overflow:hidden;
  /* PRIO 5: NO resize */
  resize:none!important;
  min-width:0;
  max-width:none;
  min-height:0;
  max-height:none;
}
.upcoming-widget-head{
  flex:0 0 auto;
  display:flex;align-items:flex-start;justify-content:space-between;gap:8px;
  margin:-15px -12px 10px;padding:15px 12px 10px;
  background:color-mix(in srgb,var(--surface) 97%,transparent);
  border-bottom:1px solid var(--border);
}
.upcoming-widget-head h2{font-size:17px;margin:2px 0 0}
.upcoming-kicker{font-size:9px;font-weight:800;letter-spacing:.12em;color:var(--muted)}
.upcoming-status{font-size:12px;color:var(--muted);padding:8px 2px;flex:0 0 auto}
.upcoming-status.error{color:var(--danger)}
.upcoming-dock .race-list{flex:1;overflow-y:auto;display:grid;gap:8px;padding-right:2px}
.upcoming-dock .race{background:var(--surface2);padding:10px;border:1px solid var(--border);border-radius:8px}
.upcoming-dock .race-name{font-size:13px;font-weight:800;line-height:1.25}
.upcoming-dock .race-meta{font-size:11px;line-height:1.4;color:var(--muted);margin-top:5px}
.race-countdown{font-size:11px;font-weight:700;color:var(--accent);margin-top:4px}
.upcoming-source{flex:0 0 auto;padding:10px 2px 2px;font-size:9px;color:var(--muted)}
.upcoming-source a{color:inherit}
.race-filter-row{display:flex;gap:4px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--border);margin-bottom:8px}
.race-filter-btn{padding:4px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;transition:all .15s}
.race-filter-btn.active,.race-filter-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff}
.race-countdown{font-size:11px;font-weight:700;color:var(--accent);margin-top:3px}

/* Manufacturer carousel */
.manufacturer-strip.manufacturer-carousel{display:flex;align-items:center;gap:9px;min-height:64px;margin-top:16px}
.manufacturer-label{font-size:12px;color:var(--muted);white-space:nowrap}
.manufacturer-visual{width:178px;height:58px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.manufacturer-visual img{display:block;width:100%;height:100%;object-fit:contain;transition:opacity .22s ease}
.manufacturer-name{display:none!important}
.manufacturer-nav{width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:19px;line-height:1;background:var(--surface)}

/* Responsive */
@media(max-width:1100px){
  .upcoming-dock{flex:0 0 220px;width:220px}
}
@media(max-width:800px){
  .layout{display:block}
  .upcoming-dock{
    position:relative!important;top:auto!important;
    width:calc(100% - 28px)!important;flex:none!important;
    height:280px;
    margin:14px;
    border:1px solid var(--border);border-radius:12px;
    border-left:1px solid var(--border);
  }
  body:before{width:90vw;height:60vw;opacity:.05}
  .brand-logo{width:72px!important;height:38px!important}
  main{padding-top:18px!important}
  .manufacturer-strip.manufacturer-carousel{flex-wrap:wrap}
  .manufacturer-label{width:100%}
}
`;
  html = html.replace("</style>", extraCss + "\n</style>");

  // JS
  const extraJs = `<script>
(() => {
  /* Manufacturer carousel */
  const mfrs=[{name:'GO Setups',src:'/assets/manufacturers/go-setups.webp'},{name:'HYMO',src:'/assets/manufacturers/hymo-setups.webp'},{name:'beAlien',src:'/assets/manufacturers/bealien.webp'}];
  let mIdx=0,mTimer=null;
  const mImg=document.getElementById('manufacturerImage');
  const renderMfr=i=>{if(!mImg)return;mIdx=(i+mfrs.length)%mfrs.length;mImg.style.opacity='0';setTimeout(()=>{mImg.src=mfrs[mIdx].src;mImg.alt=mfrs[mIdx].name;mImg.style.opacity='1';},180);};
  const restartMfr=()=>{if(mTimer)clearInterval(mTimer);mTimer=setInterval(()=>renderMfr(mIdx+1),5000);};
  document.getElementById('manufacturerPrev')?.addEventListener('click',()=>{renderMfr(mIdx-1);restartMfr();});
  document.getElementById('manufacturerNext')?.addEventListener('click',()=>{renderMfr(mIdx+1);restartMfr();});
  restartMfr();

  /* ── Upcoming Races: full lifecycle + SR badges + tier filter ── */
  const statusEl=document.getElementById('upcomingStatus');
  const listEl=document.getElementById('raceList');
  let activeTierFilter='';
  let allRaceData=[];
  let cdInterval=null;

  /* Inject tier filter buttons below widget head */
  const widgetHead=document.querySelector('.upcoming-widget-head');
  if(widgetHead){
    const filterRow=document.createElement('div');
    filterRow.className='race-filter-row';
    ['','bronze','silver','gold','special'].forEach((t,i)=>{
      const btn=document.createElement('button');
      btn.className='race-filter-btn'+(t===''?' active':'');
      btn.dataset.tier=t;
      btn.textContent=['Alle','Bronze','Silber','Gold','Special'][i];
      btn.addEventListener('click',()=>{
        activeTierFilter=t;
        filterRow.querySelectorAll('.race-filter-btn').forEach(b=>b.classList.toggle('active',b===btn));
        renderRaces();
      });
      filterRow.appendChild(btn);
    });
    widgetHead.insertAdjacentElement('afterend',filterRow);
  }

  /* Classify race tier from LMU API data
     Fields: race.tier (string: 'Gold','Silver','Bronze' or null)
             race.srRequirement (string or null)
     Special events: no tier AND no srRequirement */
  const classifyTier=race=>{
    const t=String(race.tier||'').toLowerCase();
    if(t==='gold')return'gold';
    if(t==='silver')return'silver';
    if(t==='bronze')return'bronze';
    if(!race.tier)return'special';
    return'';
  };

  const tierDefs={
    gold:{bg:'#78500a',color:'#fcd34d',label:'GOLD'},
    silver:{bg:'#374151',color:'#d1d5db',label:'SILBER'},
    bronze:{bg:'#78350f',color:'#d97706',label:'BRONZE'},
    special:{bg:'#4c1d95',color:'#c084fc',label:'SPECIAL'}
  };

  const make=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!=null)el.textContent=txt;return el;};
  const fmt=iso=>{const d=new Date(iso);if(Number.isNaN(d.getTime()))return'';return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(d);};
  const pad=n=>String(n).padStart(2,'0');
  const fmtCd=ms=>{if(ms<=0)return null;const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h>0?pad(h)+':'+pad(m)+':'+pad(sec):pad(m)+':'+pad(sec);};

  const visibleRaces=()=>{
    const now=Date.now();
    return allRaceData.filter(r=>{
      if(Date.parse(r.startsAtUtc)<=now)return false;
      if(!activeTierFilter)return true;
      return classifyTier(r)===activeTierFilter;
    });
  };

  const renderRaces=()=>{
    if(!listEl)return;
    listEl.replaceChildren();
    const races=visibleRaces();
    if(!races.length){
      if(statusEl)statusEl.textContent=allRaceData.length?'Keine Rennen für diesen Filter.':'Keine Rennen im aktuellen Zeitfenster.';
      return;
    }
    if(statusEl&&!statusEl.classList.contains('error'))statusEl.textContent='';
    const now=Date.now();
    races.forEach(race=>{
      const startMs=Date.parse(race.startsAtUtc);
      const rem=startMs-now;
      const tier=classifyTier(race);
      const td=tierDefs[tier]||null;
      const card=make('article','race');
      if(td)card.style.borderLeft='3px solid '+td.color;
      const hdr=document.createElement('div');
      hdr.style.cssText='display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px';
      hdr.appendChild(make('div','race-name',race.name||'LMU Race'));
      if(td){
        const badge=make('span');
        badge.textContent=td.label;
        badge.style.cssText='font-size:9px;font-weight:800;padding:2px 5px;border-radius:3px;background:'+td.bg+';color:'+td.color+';letter-spacing:.06em';
        hdr.appendChild(badge);
      }
      card.appendChild(hdr);
      const meta=[];
      if(race.track)meta.push(race.track+(race.trackLayout?' · '+race.trackLayout:''));
      const start=fmt(race.startsAtUtc);if(start)meta.push(start);
      if(race.srRequirement)meta.push('SR: '+race.srRequirement);
      if(Array.isArray(race.carClasses)&&race.carClasses.length)meta.push(race.carClasses.join(', '));
      if(race.durationMinutes)meta.push(race.durationMinutes+' Min');
      if(meta.length)card.appendChild(make('div','race-meta',meta.join(' · ')));
      if(rem>0&&rem<24*60*60*1000){
        const cdEl=make('div','race-countdown');
        cdEl.dataset.start=String(startMs);
        cdEl.textContent=fmtCd(rem)?'Start in '+fmtCd(rem):'';
        card.appendChild(cdEl);
      }
      listEl.appendChild(card);
    });
  };

  /* PRIO 4: tick — removes started races every second */
  const tick=()=>{
    const now=Date.now();
    const prev=allRaceData.length;
    allRaceData=allRaceData.filter(r=>Date.parse(r.startsAtUtc)>now);
    if(allRaceData.length!==prev){
      renderRaces();
      if(!allRaceData.length&&cdInterval){clearInterval(cdInterval);cdInterval=null;}
      return;
    }
    document.querySelectorAll('.race-countdown').forEach(el=>{
      const rem=Number(el.dataset.start)-now;
      el.textContent=rem<=0?'Startet jetzt':(fmtCd(rem)?'Start in '+fmtCd(rem):'');
    });
  };

  const loadUpcoming=async()=>{
    if(!statusEl||!listEl)return;
    statusEl.className='upcoming-status';
    statusEl.textContent='Rennen werden geladen…';
    listEl.replaceChildren();
    if(cdInterval){clearInterval(cdInterval);cdInterval=null;}
    try{
      const r=await fetch('/api/upcoming-races',{cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.success)throw new Error(data.error||'Upcoming Races konnten nicht geladen werden.');
      const now=Date.now();
      allRaceData=(Array.isArray(data.races)?data.races:[]).filter(r=>Date.parse(r.startsAtUtc)>now);
      if(statusEl)statusEl.textContent=data.stale?'Zwischengespeicherte Daten.':'';
      renderRaces();
      if(allRaceData.length)cdInterval=setInterval(tick,1000);
    }catch(e){
      if(statusEl){statusEl.className='upcoming-status error';statusEl.textContent=e?.message||'Upcoming Races konnten nicht geladen werden.';}
    }
  };
  loadUpcoming();
})();
</script>`;
  html = html.replace("</body>", extraJs + "\n</body>");
  return html;
}

async function serveRepoAsset(request, env) {
  const url = new URL(request.url);
  const owner = env.GITHUB_OWNER || "lukasracinglmu";
  const repo = env.GITHUB_REPO || "Le-Mans-Ultimate-Setups";
  const branch = env.GITHUB_BRANCH || "main";
  const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}${url.pathname}`, {
    cf: { cacheTtl: 86400, cacheEverything: true }
  });
  if (!response.ok) return new Response("Asset not found", { status: 404 });
  const headers = new Headers(response.headers);
  headers.set("Content-Type", url.pathname.endsWith(".webp") ? "image/webp" : "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: 200, headers });
}

/* ── Helpers ── */
function clean(value, max = 120) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
async function safeJson(response) { try { return await response.json(); } catch { return null; } }
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function discordJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
