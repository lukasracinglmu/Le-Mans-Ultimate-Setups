const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_OAUTH = "https://discord.com/oauth2";
const SESSION_COOKIE = "lmu_session";
const STATE_COOKIE = "lmu_oauth_state";
const SESSION_TTL = 604800;
const OWNER_ID = "1033453785416208564";
const MAX_FILES = 50;
const MAX_SETUP_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BODY_BYTES = 26 * 1024 * 1024;
const DEFAULT_UPLOADER_ROLE_ID = "1538601074074849330";
const GITHUB_API = "https://api.github.com";
const REQUEST_MODAL_ID = "lmu_setup_request";
const DISCORD_TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);
const DISCORD_DISPLAY_CHANNEL_TYPES = new Set([0, 2, 4, 5, 10, 11, 12, 13, 15]);
const PERM_VIEW_CHANNEL = 1024n;
const PERM_SEND_MESSAGES = 2048n;
const PERM_ADMINISTRATOR = 8n;

let discordVerifyKeyCache = { key: null, expiresAt: 0 };

export default {
  async fetch(request, env) {
    try {
      if (!isHttpsRequest(request)) {
        return _baseJson({ success: false, error: "HTTPS erforderlich." }, 400);
      }

      const originError = enforceSameOriginForStateChange(request, env);
      if (originError) return originError;

      const url = new URL(request.url);
      const p = url.pathname;
      const m = request.method;

      if (m !== "GET" && m !== "HEAD" && m !== "POST" && m !== "DELETE") {
        return _baseJson({ success: false, error: "Methode nicht erlaubt." }, 405);
      }

      if (p === "/auth/discord") return discordLogin(env);
      if (p === "/auth/discord/callback") return discordCallback(request, env);
      if (p === "/auth/logout") return logout();

      if (p === "/interactions/discord" && m === "POST") return discordInteraction(request, env);

      if (p === "/api/me" && m === "GET") return currentUser(request, env);
      if (p === "/api/setups" && m === "GET") return listSetups(request, env);
      if (p === "/api/setups/upload" && m === "POST") return uploadSetups(request, env);
      if (p === "/api/setups/delete" && m === "POST") return deleteSetup(request, env);
      if (p === "/api/request" && m === "POST") return createRequest(request, env);

      if (p === "/api/admin/upload-access" && m === "GET") return listUploadAccess(request, env);
      if (p === "/api/admin/upload-access" && m === "POST") return grantUploadAccess(request, env);
      if (p === "/api/admin/upload-access" && m === "DELETE") return revokeUploadAccess(request, env);
      if (p === "/api/admin/discord/register-request" && m === "POST") return registerRequestCommand(request, env);

      if (p === "/api/discord/channels" && m === "GET") return discordChannels(request, env);
      if (p === "/api/discord/messages" && m === "GET") return discordMessages(request, env);
      if (p === "/api/discord/messages" && m === "POST") return discordSendMessage(request, env);

      if (m === "GET" && p === "/") return serveHome(request, env);
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (e) {
      console.error("Worker error", safeError(e));
      return _baseJson({ success: false, error: "Interner Serverfehler." }, 500);
    }
  }
};

function isHttpsRequest(request) {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  const forwarded = request.headers.get("X-Forwarded-Proto");
  return forwarded === "https";
}

function enforceSameOriginForStateChange(request, env) {
  const method = request.method.toUpperCase();
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(method)) return null;

  const url = new URL(request.url);
  if (url.pathname === "/interactions/discord") return null;

  const expected = (() => {
    try { return new URL(env.SITE_URL || url.origin).origin; }
    catch { return url.origin; }
  })();

  const origin = request.headers.get("Origin");
  if (origin && origin !== expected) {
    return _baseJson({ success: false, error: "Origin nicht erlaubt." }, 403);
  }

  const referer = request.headers.get("Referer");
  if (!origin && referer) {
    try {
      if (new URL(referer).origin !== expected) {
        return _baseJson({ success: false, error: "Origin nicht erlaubt." }, 403);
      }
    } catch {
      return _baseJson({ success: false, error: "Origin nicht erlaubt." }, 403);
    }
  }

  return null;
}

function validateRequestSize(request, max = MAX_REQUEST_BODY_BYTES) {
  const len = Number(request.headers.get("Content-Length") || 0);
  return Number.isFinite(len) && len > max
    ? _baseJson({ success: false, error: "Request zu groß." }, 413)
    : null;
}

function safeError(error) {
  if (!error) return "unknown";
  if (error instanceof Error) return error.name || "Error";
  return "unknown";
}

function securityHeaders(headers = new Headers()) {
  const h = new Headers(headers);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  h.set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; upgrade-insecure-requests");
  return h;
}

function withSecurityHeaders(response) {
  const headers = securityHeaders(response.headers);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function redirectUri(env) {
  return `${env.SITE_URL}/auth/discord/callback`;
}

function discordLogin(env) {
  if (!env.DISCORD_CLIENT_ID || !env.SITE_URL) {
    return _baseJson({ success: false, error: "Discord Login nicht verfügbar." }, 500);
  }

  const state = crypto.randomUUID();
  const p = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(env),
    scope: "identify",
    state
  });

  const h = securityHeaders(new Headers({ Location: `${DISCORD_OAUTH}/authorize?${p}` }));
  h.append("Set-Cookie", cookie(STATE_COOKIE, state, 600));
  return new Response(null, { status: 302, headers: h });
}

async function discordCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const retState = url.searchParams.get("state");

  if (url.searchParams.get("error")) {
    return new Response("Discord-Anmeldung abgebrochen.", { status: 400, headers: securityHeaders() });
  }

  const cookies = parseCookies(request.headers.get("Cookie") || "");
  if (!code || !retState || cookies[STATE_COOKIE] !== retState) {
    return new Response("Ungültige Anmeldung.", { status: 400, headers: securityHeaders() });
  }

  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
    return new Response("Nicht konfiguriert.", { status: 500, headers: securityHeaders() });
  }

  const tr = await df("/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(env)
    })
  });

  if (!tr.ok) {
    console.error("Discord OAuth token error", tr.status);
    return new Response("Discord-Anmeldung fehlgeschlagen.", { status: 502, headers: securityHeaders() });
  }

  const td = await tr._baseJson();
  const ur = await df("/users/@me", {
    headers: { Authorization: `Bearer ${td.access_token}` }
  });

  if (!ur.ok) {
    console.error("Discord OAuth user error", ur.status);
    return new Response("Discord-Anmeldung fehlgeschlagen.", { status: 502, headers: securityHeaders() });
  }

  const user = await ur._baseJson();
  const sess = await createSession({
    id: user.id,
    username: user.global_name || user.username,
    avatar: user.avatar || null,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL
  }, env.SESSION_SECRET);

  const h = securityHeaders(new Headers({ Location: "/" }));
  h.append("Set-Cookie", cookie(SESSION_COOKIE, sess, SESSION_TTL));
  h.append("Set-Cookie", cookie(STATE_COOKIE, "", 0));
  return new Response(null, { status: 302, headers: h });
}

async function currentUser(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return _baseJson({ loggedIn: false });

  const isOwner = s.id === OWNER_ID;
  const canUpload = await canUserUpload(s, env);
  const avatarUrl = s.avatar
    ? `https://cdn.discordapp.com/avatars/${s.id}/${s.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(s.id) % 6n)}.png`;

  return _baseJson({ loggedIn: true, user: { id: s.id, username: s.username, avatar: avatarUrl, canUpload, isOwner } });
}

function uploaderRoleId(env) {
  return env.DISCORD_ROLE_ID || DEFAULT_UPLOADER_ROLE_ID;
}

async function hasUploaderRole(userId, env) {
  if (!userId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return false;
  const r = await df(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  if (!r.ok) return false;
  const member = await r._baseJson();
  return Array.isArray(member.roles) && member.roles.includes(uploaderRoleId(env));
}

async function hasIndividualUploadGrant(userId, env) {
  if (!userId || !env.ACCESS_DB) return false;
  try {
    const row = await env.ACCESS_DB.prepare("SELECT user_id FROM upload_access WHERE user_id = ? LIMIT 1").bind(userId).first();
    return Boolean(row?.user_id);
  } catch (e) {
    console.error("D1 upload access lookup failed", safeError(e));
    return false;
  }
}

async function canUserUpload(s, env) {
  if (!s) return false;
  if (s.id === OWNER_ID) return true;
  if (await hasIndividualUploadGrant(s.id, env)) return true;
  return hasUploaderRole(s.id, env);
}

async function requireOwner(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return { error: _baseJson({ success: false, error: "Nicht angemeldet." }, 401) };
  if (s.id !== OWNER_ID) return { error: _baseJson({ success: false, error: "Keine Admin-Berechtigung." }, 403) };
  return { session: s };
}

async function listUploadAccess(request, env) {
  const auth = await requireOwner(request, env);
  if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return _baseJson({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const result = await env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM upload_access ORDER BY created_at DESC").all();
  return _baseJson({ success: true, grants: result.results || [] });
}

async function grantUploadAccess(request, env) {
  const auth = await requireOwner(request, env);
  if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return _baseJson({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  let body;
  try { body = await request._baseJson(); }
  catch { return _baseJson({ success: false, error: "Ungültige Anfrage." }, 400); }
  const userId = String(body.userId || "").trim();
  if (!/^\d{16,22}$/.test(userId)) return _baseJson({ success: false, error: "Ungültige Discord User ID." }, 400);
  await env.ACCESS_DB.prepare("INSERT INTO upload_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by, created_at = CURRENT_TIMESTAMP").bind(userId, auth.session.id).run();
  return _baseJson({ success: true, userId });
}

async function revokeUploadAccess(request, env) {
  const auth = await requireOwner(request, env);
  if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return _baseJson({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  let body;
  try { body = await request._baseJson(); }
  catch { return _baseJson({ success: false, error: "Ungültige Anfrage." }, 400); }
  const userId = String(body.userId || "").trim();
  if (!/^\d{16,22}$/.test(userId)) return _baseJson({ success: false, error: "Ungültige Discord User ID." }, 400);
  await env.ACCESS_DB.prepare("DELETE FROM upload_access WHERE user_id = ?").bind(userId).run();
  return _baseJson({ success: true, userId });
}

function ghHeaders(env) {
  const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lmu-setups-worker" };
  if (env.GITHUB_TOKEN) h.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return h;
}
function ghRepo(env) { return `repos/${env.GITHUB_OWNER || "lukasracinglmu"}/${env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"}`; }
function ghBranch(env) { return env.GITHUB_BRANCH || "main"; }
function safe(v) { return String(v || "").trim().replace(/[/\\]+/g, "").replace(/\.\./g, "").replace(/[\u0000-\u001F\u007F]/g, ""); }
async function ghReq(path, opts, env) { return fetch(GITHUB_API + path, { ...opts, headers: { ...ghHeaders(env), ...(opts?.headers || {}) } }); }
function classifySetup(name, vehicle) {
  const file = String(name || "");
  const v = String(vehicle || "");
  const variant = /(^|[^a-z0-9])evo([^a-z0-9]|$)/i.test(file) ? "EVO" : "Standard";
  let series = null;
  if (/oreca\s*0?7/i.test(v)) {
    if (/(^|[^a-z0-9])elms([^a-z0-9]|$)/i.test(file)) series = "ELMS";
    else if (/(^|[^a-z0-9])wec([^a-z0-9]|$)/i.test(file)) series = "WEC";
    else series = "Other";
  }
  return { variant, series };
}

async function listSetups(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return _baseJson({ success: false, error: "Nicht angemeldet." }, 401);
  const url = new URL(request.url);
  const cat = safe(url.searchParams.get("category"));
  const veh = safe(url.searchParams.get("vehicle"));
  if (!cat || !veh) return _baseJson({ success: false, error: "Fahrzeug fehlt." }, 400);
  const path = `/${ghRepo(env)}/contents/setups/${enc(cat)}/${enc(veh)}?ref=${enc(ghBranch(env))}`;
  const r = await ghReq(path, {}, env);
  if (r.status === 404) return _baseJson({ success: true, setups: [] });
  if (!r.ok) return _baseJson({ success: false, error: "Setups konnten nicht geladen werden." }, 502);
  const items = await r._baseJson();
  const base = `https://raw.githubusercontent.com/${env.GITHUB_OWNER || "lukasracinglmu"}/${env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"}/${ghBranch(env)}`;
  const setups = (Array.isArray(items) ? items : []).filter(i => i.type === "file" && /\.zip$/i.test(i.name)).map(i => ({ name: i.name, sha: i.sha, download: `${base}/${i.path.split("/").map(enc).join("/")}`, ...classifySetup(i.name, veh) })).sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" }));
  return _baseJson({ success: true, setups });
}

function isZipSignature(bytes) {
  if (!bytes || bytes.length < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4b && ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06) || (bytes[2] === 0x07 && bytes[3] === 0x08));
}

async function uploadSetups(request, env) {
  const sizeError = validateRequestSize(request);
  if (sizeError) return sizeError;
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return _baseJson({ success: false, error: "Nicht angemeldet." }, 401);
  if (!await canUserUpload(s, env)) return _baseJson({ success: false, error: "Keine Upload-Berechtigung." }, 403);
  if (!env.GITHUB_TOKEN) return _baseJson({ success: false, error: "Upload nicht konfiguriert." }, 503);
  const form = await request.formData();
  const cat = safe(form.get("category"));
  const veh = safe(form.get("vehicle"));
  if (!cat || !veh) return _baseJson({ success: false, error: "Fahrzeugdaten fehlen." }, 400);
  const files = form.getAll("files").filter(x => x && typeof x.arrayBuffer === "function");
  if (!files.length) return _baseJson({ success: false, error: "Keine Datei ausgewählt." }, 400);
  if (files.length > MAX_FILES) return _baseJson({ success: false, error: `Maximal ${MAX_FILES} Dateien gleichzeitig.` }, 400);
  const results = [], errors = [];
  for (const file of files) {
    const originalName = String(file.name || "");
    const name = safe(originalName);
    if (!name || name !== originalName.trim() || name.length > 180 || !/^[\p{L}\p{N} _().+\-]+\.zip$/u.test(name)) { errors.push({ name: originalName || "Unbekannte Datei", error: "Ungültiger Dateiname." }); continue; }
    if (file.size <= 0 || file.size > MAX_SETUP_BYTES) { errors.push({ name, error: "Ungültige Dateigröße." }); continue; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isZipSignature(bytes)) { errors.push({ name, error: "Datei ist kein gültiges ZIP-Archiv." }); continue; }
    const fpath = `setups/${cat}/${veh}/${name}`;
    const epath = fpath.split("/").map(enc).join("/");
    const existing = await ghReq(`/${ghRepo(env)}/contents/${epath}?ref=${enc(ghBranch(env))}`, {}, env);
    if (existing.ok) { errors.push({ name, error: "Setup existiert bereits." }); continue; }
    if (existing.status !== 404) { errors.push({ name, error: "Prüfung fehlgeschlagen." }); continue; }
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const content = btoa(bin);
    const put = await ghReq(`/${ghRepo(env)}/contents/${epath}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `Add setup: ${veh} - ${name}`, content, branch: ghBranch(env) }) }, env);
    if (!put.ok) { console.error("GH upload error", put.status); errors.push({ name, error: "Upload fehlgeschlagen." }); continue; }
    const d = await put._baseJson();
    results.push({ name, download: d.content?.download_url || null, ...classifySetup(name, veh) });
  }
  return _baseJson({ success: true, uploaded: results, errors });
}

async function deleteSetup(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return _baseJson({ success: false, error: "Nicht angemeldet." }, 401);
  if (!await canUserUpload(s, env)) return _baseJson({ success: false, error: "Keine Berechtigung." }, 403);
  if (!env.GITHUB_TOKEN) return _baseJson({ success: false, error: "Löschen nicht konfiguriert." }, 503);
  let body; try { body = await request._baseJson(); } catch { return _baseJson({ success: false, error: "Ungültige Anfrage." }, 400); }
  const cat = safe(body.category), veh = safe(body.vehicle), name = safe(body.name);
  if (!cat || !veh || !name) return _baseJson({ success: false, error: "Fehlende Parameter." }, 400);
  const fpath = `setups/${cat}/${veh}/${name}`;
  const epath = fpath.split("/").map(enc).join("/");
  const current = await ghReq(`/${ghRepo(env)}/contents/${epath}?ref=${enc(ghBranch(env))}`, {}, env);
  if (current.status === 404) return _baseJson({ success: false, error: "Setup wurde nicht gefunden." }, 404);
  if (!current.ok) return _baseJson({ success: false, error: "Setup konnte nicht geprüft werden." }, 502);
  const currentData = await current._baseJson();
  const del = await ghReq(`/${ghRepo(env)}/contents/${epath}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `Delete setup: ${veh} - ${name}`, sha: currentData.sha, branch: ghBranch(env) }) }, env);
  if (!del.ok) return _baseJson({ success: false, error: "Löschen fehlgeschlagen." }, 502);
  return _baseJson({ success: true });
}

async function createRequest(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return _baseJson({ success: false, error: "Nicht angemeldet." }, 401);
  let body; try { body = await request._baseJson(); } catch { return _baseJson({ success: false, error: "Ungültige Anfrage." }, 400); }
  return _baseJson({ success: true });
}

async function discordChannels(request, env) { return _baseJson({ success: false, error: "Discord Mini Player entfernt." }, 404); }
async function discordMessages(request, env) { return _baseJson({ success: false, error: "Discord Mini Player entfernt." }, 404); }
async function discordSendMessage(request, env) { return _baseJson({ success: false, error: "Discord Mini Player entfernt." }, 404); }

async function _baseVerifyDiscordInteraction(request, rawBody, env) { return true; }
async function _baseDiscordInteraction(request, env) { return _baseJson({ type: 1 }); }
async function registerRequestCommand(request, env) { const a=await requireOwner(request,env); if(a.error)return a.error; return _baseJson({success:true}); }

async function serveHome(request, env) {
  const owner = env.GITHUB_OWNER || "lukasracinglmu";
  const repo = env.GITHUB_REPO || "Le-Mans-Ultimate-Setups";
  const branch = ghBranch(env);
  const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/index.html`, { cache: "no-store" });
  if (!r.ok) return withSecurityHeaders(await env.ASSETS.fetch(request));
  const html = await r.text();
  return new Response(html, { headers: securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })) });
}

async function df(path, opts = {}) { return fetch(DISCORD_API + path, opts); }
function enc(v) { return encodeURIComponent(v); }
function cookie(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function parseCookies(header) { const out={}; for(const p of header.split(";")){const i=p.indexOf("="); if(i>0) out[p.slice(0,i).trim()]=p.slice(i+1).trim();} return out; }
function logout() { const h=securityHeaders(new Headers({Location:"/"})); h.append("Set-Cookie",cookie(SESSION_COOKIE,"",0)); h.append("Set-Cookie",cookie(STATE_COOKIE,"",0)); return new Response(null,{status:302,headers:h}); }
function _baseJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:securityHeaders(new Headers({"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}))});}

async function createSession(payload, secret) {
  const data = JSON.stringify(payload);
  const body = btoa(unescape(encodeURIComponent(data))).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const sig = await hmac(body, secret);
  return `${body}.${sig}`;
}
async function readSession(request, secret) {
  if (!secret) return null;
  const token = parseCookies(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body, secret);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const normalized = body.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized + "===".slice((normalized.length + 3) % 4);
    const data = decodeURIComponent(escape(atob(pad)));
    const payload = JSON.parse(data);
    if (!payload?.id || !payload?.exp || payload.exp <= Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}
async function hmac(input, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)));
  let s=""; for(const b of sig) s+=String.fromCharCode(b);
  return btoa(s).replace(/=+$/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function timingSafeEqual(a,b){if(a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0;}

const baseWorker = worker_default;


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

  async queue(batch, env) {
    // Queue consumer stub — upload processing handled directly via GitHub API
    for (const message of batch.messages) {
      message.ack();
    }
  }

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

function buildRequestContent({ username, vehicle, carClass, track, message }) {
  const lines = [
    "**Setup Request**",
    `**User:** ${clean(username, 80)}`,
    `**Fahrzeug:** ${clean(vehicle, 100)}`,
    `**Klasse:** ${clean(carClass || "Nicht angegeben", 80)}`,
    `**Strecke:** ${clean(track, 100)}`
  ];
  const extra = clean(message, 500);
  if (extra) lines.push(`**Weitere Informationen:** ${extra}`);
  return lines.join("\n").slice(0, 2000);
}

async function sendSetupRequest(data, env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) {
    return { ok: false, status: 503, error: "Request-Dienst nicht konfiguriert." };
  }
  const response = await fetch(`${DISCORD_API}/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: buildRequestContent(data), allowed_mentions: { parse: [] } })
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
  const manufacturers = [
    { name: 'GO Setups', src: '/assets/manufacturers/go-setups.webp' },
    { name: 'HYMO', src: '/assets/manufacturers/hymo-setups.webp' },
    { name: 'beAlien', src: '/assets/manufacturers/bealien.webp' }
  ];
  let mIdx = 0, mTimer = null;
  const mImg = document.getElementById('manufacturerImage');
  const renderMfr = (index) => {
    if (!mImg) return;
    mIdx = (index + manufacturers.length) % manufacturers.length;
    mImg.style.opacity = '0';
    setTimeout(() => { mImg.src = manufacturers[mIdx].src; mImg.alt = manufacturers[mIdx].name; mImg.style.opacity = '1'; }, 180);
  };
  const restartMfr = () => { if (mTimer) clearInterval(mTimer); mTimer = setInterval(() => renderMfr(mIdx + 1), 5000); };
  document.getElementById('manufacturerPrev')?.addEventListener('click', () => { renderMfr(mIdx - 1); restartMfr(); });
  document.getElementById('manufacturerNext')?.addEventListener('click', () => { renderMfr(mIdx + 1); restartMfr(); });
  restartMfr();

  /* Upcoming Races with auto-remove on start */
  const statusEl = document.getElementById('upcomingStatus');
  const listEl = document.getElementById('raceList');
  const make = (tag, cls, txt) => { const el = document.createElement(tag); if (cls) el.className = cls; if (txt != null) el.textContent = txt; return el; };

  let raceData = [];
  let countdownInterval = null;

  const fmt = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  };

  const pad = n => String(n).padStart(2, '0');

  const formatCountdown = (ms) => {
    if (ms <= 0) return null;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(sec);
    return pad(m) + ':' + pad(sec);
  };

  /* PRIO 4: tick — remove started races without reload */
  const tickCountdowns = () => {
    const now = Date.now();
    let anyRemoved = false;
    raceData = raceData.filter(race => {
      const startMs = Date.parse(race.startsAtUtc);
      if (startMs <= now) { anyRemoved = true; return false; }
      return true;
    });
    if (anyRemoved) {
      renderRaces();
      if (!raceData.length) {
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        return;
      }
    }
    /* Update countdown text in existing cards */
    document.querySelectorAll('.race-countdown').forEach(el => {
      const startMs = Number(el.dataset.start);
      const remaining = startMs - now;
      if (remaining <= 0) {
        /* will be removed on next tick */
        el.textContent = 'Startet jetzt';
      } else {
        const cd = formatCountdown(remaining);
        el.textContent = cd ? 'Start in ' + cd : '';
      }
    });
  };

  const renderRaces = () => {
    if (!listEl) return;
    listEl.replaceChildren();
    if (!raceData.length) {
      statusEl.textContent = 'Keine Rennen mehr in diesem Zeitfenster.';
      return;
    }
    const now = Date.now();
    raceData.forEach(race => {
      const startMs = Date.parse(race.startsAtUtc);
      const remaining = startMs - now;
      const card = make('article', 'race');
      card.appendChild(make('div', 'race-name', race.name || 'LMU Race'));
      const meta = [];
      if (race.track) meta.push(race.track + (race.trackLayout ? ' · ' + race.trackLayout : ''));
      const start = fmt(race.startsAtUtc);
      if (start) meta.push(start);
      if (race.tier) meta.push(race.tier);
      if (Array.isArray(race.carClasses) && race.carClasses.length) meta.push(race.carClasses.join(', '));
      if (race.durationMinutes) meta.push(race.durationMinutes + ' Min');
      if (race.setup) meta.push('Setup: ' + race.setup);
      card.appendChild(make('div', 'race-meta', meta.join(' · ')));
      /* Countdown */
      if (remaining > 0 && remaining < 24 * 60 * 60 * 1000) {
        const cdEl = make('div', 'race-countdown');
        cdEl.dataset.start = String(startMs);
        const cd = formatCountdown(remaining);
        cdEl.textContent = cd ? 'Start in ' + cd : '';
        card.appendChild(cdEl);
      }
      listEl.appendChild(card);
    });
  };

  const loadUpcomingRich = async () => {
    if (!statusEl || !listEl) return;
    statusEl.className = 'upcoming-status';
    statusEl.textContent = 'Rennen werden geladen…';
    listEl.replaceChildren();
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    try {
      const response = await fetch('/api/upcoming-races', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Upcoming Races konnten nicht geladen werden.');
      /* PRIO 4: filter already-started on client too (clock drift safety) */
      const now = Date.now();
      raceData = (Array.isArray(data.races) ? data.races : []).filter(r => Date.parse(r.startsAtUtc) > now);
      if (!raceData.length) {
        statusEl.textContent = data.switchover?.active ? 'Wochenwechsel läuft. Bitte nach 10:05 UTC erneut prüfen.' : 'Keine Rennen im aktuellen Zeitfenster.';
        return;
      }
      statusEl.textContent = data.stale ? 'Zwischengespeicherte Daten – LMU Portal nicht erreichbar.' : '';
      renderRaces();
      /* PRIO 4: start 1-second tick for auto-remove */
      countdownInterval = setInterval(tickCountdowns, 1000);
    } catch (error) {
      statusEl.className = 'upcoming-status error';
      statusEl.textContent = error?.message || 'Upcoming Races konnten nicht geladen werden.';
    }
  };

  loadUpcomingRich();
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
