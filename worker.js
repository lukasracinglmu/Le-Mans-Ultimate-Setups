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
      if (!isHttpsRequest(request)) return json({ success: false, error: "HTTPS erforderlich." }, 400);
      const originError = enforceSameOriginForStateChange(request, env);
      if (originError) return originError;

      const url = new URL(request.url);
      const p = url.pathname;
      const m = request.method;
      if (m !== "GET" && m !== "HEAD" && m !== "POST" && m !== "DELETE") return json({ success: false, error: "Methode nicht erlaubt." }, 405);

      if (p === "/auth/discord") return discordLogin(env);
      if (p === "/auth/discord/callback") return discordCallback(request, env);
      if (p === "/auth/logout") return logout();
      if (p === "/interactions/discord" && m === "POST") return discordInteraction(request, env);

      if (p === "/api/me" && m === "GET") return currentUser(request, env);
      if (p === "/api/setups" && m === "GET") return listSetups(request, env);
      if (p === "/api/setups/download" && m === "GET") return downloadSetup(request, env);
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
      return json({ success: false, error: "Interner Serverfehler." }, 500);
    }
  }
};

function isHttpsRequest(request) {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  return request.headers.get("X-Forwarded-Proto") === "https";
}

function enforceSameOriginForStateChange(request, env) {
  const method = request.method.toUpperCase();
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(method)) return null;
  const url = new URL(request.url);
  if (url.pathname === "/interactions/discord") return null;
  const expected = (() => { try { return new URL(env.SITE_URL || url.origin).origin; } catch { return url.origin; } })();
  const origin = request.headers.get("Origin");
  if (origin && origin !== expected) return json({ success: false, error: "Origin nicht erlaubt." }, 403);
  const referer = request.headers.get("Referer");
  if (!origin && referer) {
    try { if (new URL(referer).origin !== expected) return json({ success: false, error: "Origin nicht erlaubt." }, 403); }
    catch { return json({ success: false, error: "Origin nicht erlaubt." }, 403); }
  }
  return null;
}

function validateRequestSize(request, max = MAX_REQUEST_BODY_BYTES) {
  const len = Number(request.headers.get("Content-Length") || 0);
  return Number.isFinite(len) && len > max ? json({ success: false, error: "Request zu groß." }, 413) : null;
}
function safeError(error) { if (!error) return "unknown"; return error instanceof Error ? (error.name || "Error") : "unknown"; }
function securityHeaders(headers = new Headers()) {
  const h = new Headers(headers);
  h.set("X-Content-Type-Options", "nosniff"); h.set("Referrer-Policy", "strict-origin-when-cross-origin"); h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin"); h.set("Cross-Origin-Resource-Policy", "same-origin");
  h.set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; upgrade-insecure-requests");
  return h;
}
function withSecurityHeaders(response) { const headers = securityHeaders(response.headers); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
function redirectUri(env) { return `${env.SITE_URL}/auth/discord/callback`; }
function discordLogin(env) {
  if (!env.DISCORD_CLIENT_ID || !env.SITE_URL) return json({ success: false, error: "Discord Login nicht verfügbar." }, 500);
  const state = crypto.randomUUID();
  const p = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: "code", redirect_uri: redirectUri(env), scope: "identify", state });
  const h = securityHeaders(new Headers({ Location: `${DISCORD_OAUTH}/authorize?${p}` })); h.append("Set-Cookie", cookie(STATE_COOKIE, state, 600));
  return new Response(null, { status: 302, headers: h });
}

async function discordCallback(request, env) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const retState = url.searchParams.get("state");
  if (url.searchParams.get("error")) return new Response("Discord-Anmeldung abgebrochen.", { status: 400, headers: securityHeaders() });
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  if (!code || !retState || cookies[STATE_COOKIE] !== retState) return new Response("Ungültige Anmeldung.", { status: 400, headers: securityHeaders() });
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) return new Response("Nicht konfiguriert.", { status: 500, headers: securityHeaders() });
  const tr = await df("/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: redirectUri(env) }) });
  if (!tr.ok) return new Response("Discord-Anmeldung fehlgeschlagen.", { status: 502, headers: securityHeaders() });
  const td = await tr.json(); const ur = await df("/users/@me", { headers: { Authorization: `Bearer ${td.access_token}` } });
  if (!ur.ok) return new Response("Discord-Anmeldung fehlgeschlagen.", { status: 502, headers: securityHeaders() });
  const user = await ur.json();
  const sess = await createSession({ id: user.id, username: user.global_name || user.username, avatar: user.avatar || null, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, env.SESSION_SECRET);
  const h = securityHeaders(new Headers({ Location: "/" })); h.append("Set-Cookie", cookie(SESSION_COOKIE, sess, SESSION_TTL)); h.append("Set-Cookie", cookie(STATE_COOKIE, "", 0));
  return new Response(null, { status: 302, headers: h });
}

function databaseRoleId(env) { return env.DISCORD_DATABASE_ROLE_ID || env.DISCORD_ROLE_ID || DEFAULT_UPLOADER_ROLE_ID; }
function uploaderRoleId(env) { return env.DISCORD_UPLOAD_ROLE_ID || env.DISCORD_ROLE_ID || DEFAULT_UPLOADER_ROLE_ID; }
async function fetchGuildMember(userId, env) {
  if (!userId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return { ok: false, status: 503, member: null };
  const r = await df(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
  if (r.status === 404) return { ok: true, status: 404, member: null };
  if (!r.ok) return { ok: false, status: r.status, member: null };
  return { ok: true, status: 200, member: await r.json() };
}
async function hasDatabaseRole(userId, env) {
  const result = await fetchGuildMember(userId, env);
  if (!result.ok || !result.member) return false;
  return Array.isArray(result.member.roles) && result.member.roles.includes(databaseRoleId(env));
}
async function hasUploaderRole(userId, env) {
  const result = await fetchGuildMember(userId, env);
  if (!result.ok || !result.member) return false;
  return Array.isArray(result.member.roles) && result.member.roles.includes(uploaderRoleId(env));
}
async function requireDatabaseAccess(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return { error: json({ success: false, error: "Nicht angemeldet." }, 401) };
  if (s.id === OWNER_ID) return { session: s };
  const result = await fetchGuildMember(s.id, env);
  if (!result.ok) return { error: json({ success: false, error: "Discord-Rollenprüfung nicht verfügbar." }, 503) };
  if (!result.member || !Array.isArray(result.member.roles) || !result.member.roles.includes(databaseRoleId(env))) return { error: json({ success: false, error: "Erforderliche Discord-Rolle fehlt." }, 403) };
  return { session: s };
}

async function currentUser(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return json({ loggedIn: false, databaseAccess: false });
  const isOwner = s.id === OWNER_ID;
  const databaseAccess = isOwner || await hasDatabaseRole(s.id, env);
  const canUpload = await canUserUpload(s, env);
  const avatarUrl = s.avatar ? `https://cdn.discordapp.com/avatars/${s.id}/${s.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(s.id) % 6n)}.png`;
  return json({ loggedIn: true, databaseAccess, user: { id: s.id, username: s.username, avatar: avatarUrl, canUpload, isOwner } });
}

async function hasIndividualUploadGrant(userId, env) {
  if (!userId || !env.ACCESS_DB) return false;
  try { const row = await env.ACCESS_DB.prepare("SELECT user_id FROM upload_access WHERE user_id = ? LIMIT 1").bind(userId).first(); return Boolean(row?.user_id); }
  catch (e) { console.error("D1 upload access lookup failed", safeError(e)); return false; }
}
async function canUserUpload(s, env) {
  if (!s) return false; if (s.id === OWNER_ID) return true; if (await hasIndividualUploadGrant(s.id, env)) return true; return hasUploaderRole(s.id, env);
}
async function requireOwner(request, env) {
  const s = await readSession(request, env.SESSION_SECRET); if (!s) return { error: json({ success: false, error: "Nicht angemeldet." }, 401) };
  if (s.id !== OWNER_ID) return { error: json({ success: false, error: "Keine Admin-Berechtigung." }, 403) }; return { session: s };
}

async function listUploadAccess(request, env) {
  const auth = await requireOwner(request, env); if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const result = await env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM upload_access ORDER BY created_at DESC").all();
  const grants = await Promise.all((result.results || []).map(async row => {
    let accountName = "Unbekannt / nicht verfügbar";
    try {
      const member = await fetchGuildMember(String(row.user_id), env);
      const u = member?.member?.user;
      if (u) accountName = u.global_name || u.username || accountName;
    } catch {}
    return { ...row, account_name: accountName };
  }));
  return json({ success: true, grants });
}
async function grantUploadAccess(request, env) { const auth = await requireOwner(request, env); if (auth.error) return auth.error; if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503); let body; try { body = await request.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); } const userId = String(body.userId || "").trim(); if (!/^\d{16,22}$/.test(userId)) return json({ success: false, error: "Ungültige Discord User ID." }, 400); await env.ACCESS_DB.prepare("INSERT INTO upload_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by").bind(userId, auth.session.id).run(); return json({ success: true, userId }); }
async function revokeUploadAccess(request, env) { const auth = await requireOwner(request, env); if (auth.error) return auth.error; if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503); let body; try { body = await request.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); } const userId = String(body.userId || "").trim(); if (!/^\d{16,22}$/.test(userId)) return json({ success: false, error: "Ungültige Discord User ID." }, 400); await env.ACCESS_DB.prepare("DELETE FROM upload_access WHERE user_id = ?").bind(userId).run(); return json({ success: true, userId }); }

function ghHeaders(env) { const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lmu-setups-worker" }; if (env.GITHUB_TOKEN) h.Authorization = `Bearer ${env.GITHUB_TOKEN}`; return h; }
function ghRepo(env) { return `repos/${env.GITHUB_OWNER || "lukasracinglmu"}/${env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"}`; }
function ghBranch(env) { return env.GITHUB_BRANCH || "main"; }
function safe(v) { return String(v || "").trim().replace(/[/\\]+/g, "").replace(/\.\./g, "").replace(/[\u0000-\u001F\u007F]/g, ""); }
async function ghReq(path, opts, env) { return fetch(GITHUB_API + path, { ...opts, headers: { ...ghHeaders(env), ...(opts?.headers || {}) } }); }
function classifySetup(name, vehicle) { const file = String(name || ""); const v = String(vehicle || ""); const variant = /(^|[^a-z0-9])evo([^a-z0-9]|$)/i.test(file) ? "EVO" : "Standard"; let series = null; if (/oreca\s*0?7/i.test(v)) { if (/(^|[^a-z0-9])elms([^a-z0-9]|$)/i.test(file)) series = "ELMS"; else if (/(^|[^a-z0-9])wec([^a-z0-9]|$)/i.test(file)) series = "WEC"; else series = "Other"; } return { variant, series }; }

async function listSetups(request, env) {
  const auth = await requireDatabaseAccess(request, env); if (auth.error) return auth.error;
  const url = new URL(request.url); const cat = safe(url.searchParams.get("category")); const veh = safe(url.searchParams.get("vehicle")); if (!cat || !veh) return json({ success: false, error: "Fahrzeug fehlt." }, 400);
  const path = `/${ghRepo(env)}/contents/setups/${enc(cat)}/${enc(veh)}?ref=${enc(ghBranch(env))}`; const r = await ghReq(path, {}, env); if (r.status === 404) return json({ success: true, setups: [] }); if (!r.ok) return json({ success: false, error: "Setups konnten nicht geladen werden." }, 502);
  const items = await r.json();
  const setups = (Array.isArray(items) ? items : []).filter(i => i.type === "file" && /\.zip$/i.test(i.name)).map(i => ({ name: i.name, sha: i.sha, download: `/api/setups/download?category=${enc(cat)}&vehicle=${enc(veh)}&name=${enc(i.name)}`, ...classifySetup(i.name, veh) })).sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" }));
  return json({ success: true, setups });
}

async function downloadSetup(request, env) {
  const auth = await requireDatabaseAccess(request, env); if (auth.error) return auth.error;
  const url = new URL(request.url); const cat = safe(url.searchParams.get("category")); const veh = safe(url.searchParams.get("vehicle")); const name = safe(url.searchParams.get("name"));
  if (!cat || !veh || !name || !/\.zip$/i.test(name)) return json({ success: false, error: "Ungültiger Download." }, 400);
  const path = `/${ghRepo(env)}/contents/setups/${enc(cat)}/${enc(veh)}/${enc(name)}?ref=${enc(ghBranch(env))}`;
  const meta = await ghReq(path, {}, env); if (meta.status === 404) return json({ success: false, error: "Setup wurde nicht gefunden." }, 404); if (!meta.ok) return json({ success: false, error: "Setup konnte nicht geladen werden." }, 502);
  const item = await meta.json(); if (!item?.download_url) return json({ success: false, error: "Setup konnte nicht geladen werden." }, 502);
  const file = await fetch(item.download_url, { cache: "no-store" }); if (!file.ok) return json({ success: false, error: "Setup konnte nicht geladen werden." }, 502);
  const headers = securityHeaders(new Headers(file.headers)); headers.set("Content-Type", "application/zip"); headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`); headers.set("Cache-Control", "private, no-store");
  return new Response(file.body, { status: 200, headers });
}

async function uploadSetups(request, env) {
  const sizeError = validateRequestSize(request); if (sizeError) return sizeError;
  const s = await readSession(request, env.SESSION_SECRET); if (!s) return json({ success: false, error: "Nicht angemeldet." }, 401); if (!await canUserUpload(s, env)) return json({ success: false, error: "Keine Upload-Berechtigung." }, 403);
  let form; try { form = await request.formData(); } catch { return json({ success: false, error: "Ungültige Upload-Anfrage." }, 400); }
  const cat = safe(form.get("category")); const veh = safe(form.get("vehicle")); const files = form.getAll("files"); if (!cat || !veh || files.length < 1 || files.length > MAX_FILES) return json({ success: false, error: "Ungültige Upload-Anfrage." }, 400);
  const uploaded = [], errors = [];
  for (const file of files) {
    const name = safe(file?.name); if (!file || !name || !/\.zip$/i.test(name) || file.size < 1 || file.size > MAX_SETUP_BYTES) { errors.push({ name: name || "Unbekannt", error: "Ungültige ZIP-Datei." }); continue; }
    try { const arr = await file.arrayBuffer(); const content = bytesToBase64(new Uint8Array(arr)); const path = `setups/${cat}/${veh}/${name}`; const apiPath = `/${ghRepo(env)}/contents/${encPath(path)}`; const existing = await ghReq(`${apiPath}?ref=${enc(ghBranch(env))}`, {}, env); let sha = undefined; if (existing.ok) { const x = await existing.json(); sha = x.sha; } const body = { message: `Upload setup ${name}`, content, branch: ghBranch(env), ...(sha ? { sha } : {}) }; const r = await ghReq(apiPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env); if (!r.ok) errors.push({ name, error: "GitHub Upload fehlgeschlagen." }); else uploaded.push({ name }); }
    catch { errors.push({ name, error: "Upload fehlgeschlagen." }); }
  }
  return json({ success: errors.length === 0, uploaded, errors }, uploaded.length ? 200 : 502);
}

async function deleteSetup(request, env) {
  const s = await readSession(request, env.SESSION_SECRET); if (!s) return json({ success: false, error: "Nicht angemeldet." }, 401); if (!await canUserUpload(s, env)) return json({ success: false, error: "Keine Upload-Berechtigung." }, 403);
  let body; try { body = await request.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); }
  const cat = safe(body.category); const veh = safe(body.vehicle); const name = safe(body.name); if (!cat || !veh || !name || !/\.zip$/i.test(name)) return json({ success: false, error: "Ungültiger Löschvorgang." }, 400);
  const apiPath = `/${ghRepo(env)}/contents/${encPath(`setups/${cat}/${veh}/${name}`)}`; const existing = await ghReq(`${apiPath}?ref=${enc(ghBranch(env))}`, {}, env); if (!existing.ok) return json({ success: false, error: "Setup nicht gefunden." }, 404); const x = await existing.json(); const r = await ghReq(apiPath, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `Delete setup ${name}`, sha: x.sha, branch: ghBranch(env) }) }, env); if (!r.ok) return json({ success: false, error: "Setup konnte nicht gelöscht werden." }, 502); return json({ success: true });
}

async function createRequest(request, env) { const auth = await requireDatabaseAccess(request, env); if (auth.error) return auth.error; return json({ success: false, error: "Request route handled by production worker." }, 503); }
async function discordChannels() { return json({ success: false, error: "Nicht verfügbar." }, 404); }
async function discordMessages() { return json({ success: false, error: "Nicht verfügbar." }, 404); }
async function discordSendMessage() { return json({ success: false, error: "Nicht verfügbar." }, 404); }
async function registerRequestCommand(request, env) { const auth = await requireOwner(request, env); if (auth.error) return auth.error; return json({ success: true }); }
async function verifyDiscordInteraction() { return true; }
async function discordInteraction() { return discordJson({ type: 1 }); }

async function serveHome(request, env) {
  const owner = env.GITHUB_OWNER || "lukasracinglmu"; const repo = env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"; const branch = env.GITHUB_BRANCH || "main";
  try { const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/index.html`, { cache: "no-store" }); if (r.ok) return withSecurityHeaders(new Response(await r.text(), { headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } })); } catch {}
  return withSecurityHeaders(await env.ASSETS.fetch(request));
}

function clean(v, max = 120) { return String(v || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max); }
function enc(v) { return encodeURIComponent(v); } function encPath(p) { return p.split("/").map(enc).join("/"); }
function json(data, status = 200) { const h = securityHeaders(new Headers({ "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" })); return new Response(JSON.stringify(data), { status, headers: h }); }
function discordJson(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
async function df(path, opts = {}) { return fetch(DISCORD_API + path, opts); }
function parseCookies(raw) { const out = {}; for (const part of raw.split(";")) { const i = part.indexOf("="); if (i < 0) continue; const k = part.slice(0, i).trim(); const v = part.slice(i + 1).trim(); try { out[k] = decodeURIComponent(v); } catch { out[k] = v; } } return out; }
function cookie(name, value, maxAge) { return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`; }
function b64urlEncode(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlDecode(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); return Uint8Array.from(bin, c => c.charCodeAt(0)); }
function b64urlEncodeText(s) { return b64urlEncode(new TextEncoder().encode(s)); }
async function hmac(data, secret) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))); }
async function createSession(payload, secret) { const p = b64urlEncodeText(JSON.stringify(payload)); const sig = b64urlEncode(await hmac(p, secret)); return `${p}.${sig}`; }
async function readSession(request, secret) { if (!secret) return null; const token = parseCookies(request.headers.get("Cookie") || "")[SESSION_COOKIE]; if (!token) return null; const [p, sig] = token.split("."); if (!p || !sig) return null; const expected = b64urlEncode(await hmac(p, secret)); if (sig.length !== expected.length) return null; let diff = 0; for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i); if (diff !== 0) return null; try { const data = JSON.parse(new TextDecoder().decode(b64urlDecode(p))); if (!data?.id || !data?.exp || data.exp < Math.floor(Date.now() / 1000)) return null; return data; } catch { return null; } }
function logout() { const h = securityHeaders(new Headers({ Location: "/" })); h.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0)); return new Response(null, { status: 302, headers: h }); }
function bytesToBase64(bytes) { let binary = ""; const CHUNK = 0x8000; for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK)); return btoa(binary); }
