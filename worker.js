const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_OAUTH = "https://discord.com/oauth2";
const SESSION_COOKIE = "lmu_session";
const STATE_COOKIE = "lmu_oauth_state";
const SESSION_TTL = 604800;
const OWNER_ID = "1033453785416208564";
const MAX_FILES = 50;
const MAX_SETUP_BYTES = 25 * 1024 * 1024;
const UPLOADER_ROLE_ID = "1538601074074849330";
const GITHUB_API = "https://api.github.com";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const p = url.pathname;
      const m = request.method;
      if (p === "/auth/discord") return discordLogin(env);
      if (p === "/auth/discord/callback") return discordCallback(request, env);
      if (p === "/auth/logout") return logout();
      if (p === "/api/me" && m === "GET") return currentUser(request, env);
      if (p === "/api/setups" && m === "GET") return listSetups(request, env);
      if (p === "/api/setups/upload" && m === "POST") return uploadSetups(request, env);
      if (p === "/api/setups/delete" && m === "POST") return deleteSetup(request, env);
      if (p === "/api/request" && m === "POST") return createRequest(request, env);
      if (p === "/api/discord/channels" && m === "GET") return discordChannels(request, env);
      if (p === "/api/discord/messages" && m === "GET") return discordMessages(request, env);
      if (p === "/api/discord/messages" && m === "POST") return discordSendMessage(request, env);
      if (m === "GET" && p === "/") return serveHome(request, env);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error("Worker error", e);
      return json({ success: false, error: "Interner Serverfehler." }, 500);
    }
  }
};

/* ── Auth ── */
function redirectUri(env) { return `${env.SITE_URL}/auth/discord/callback`; }

function discordLogin(env) {
  if (!env.DISCORD_CLIENT_ID || !env.SITE_URL) return json({ success: false, error: "Discord Login nicht verfügbar." }, 500);
  const state = crypto.randomUUID();
  const p = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: "code", redirect_uri: redirectUri(env), scope: "identify", state });
  const h = new Headers({ Location: `${DISCORD_OAUTH}/authorize?${p}` });
  h.append("Set-Cookie", cookie(STATE_COOKIE, state, 600));
  return new Response(null, { status: 302, headers: h });
}

async function discordCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code"), retState = url.searchParams.get("state");
  if (url.searchParams.get("error")) return new Response("Discord-Anmeldung abgebrochen.", { status: 400 });
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  if (!code || !retState || cookies[STATE_COOKIE] !== retState) return new Response("Ungültige Anmeldung.", { status: 400 });
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) return new Response("Nicht konfiguriert.", { status: 500 });

  const tr = await df("/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: redirectUri(env) }) });
  if (!tr.ok) return new Response("Discord-Anmeldung fehlgeschlagen.", { status: 502 });
  const td = await tr.json();
  const ur = await df("/users/@me", { headers: { Authorization: `Bearer ${td.access_token}` } });
  if (!ur.ok) return new Response("Discord-Anmeldung fehlgeschlagen.", { status: 502 });
  const user = await ur.json();
  const avatarHash = user.avatar || null;
  const sess = await createSession({ id: user.id, username: user.global_name || user.username, avatar: avatarHash, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, env.SESSION_SECRET);
  const h = new Headers({ Location: "/" });
  h.append("Set-Cookie", cookie(SESSION_COOKIE, sess, SESSION_TTL));
  h.append("Set-Cookie", cookie(STATE_COOKIE, "", 0));
  return new Response(null, { status: 302, headers: h });
}

async function currentUser(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return json({ loggedIn: false });
  const isOwner = s.id === OWNER_ID;
  const canUpload = isOwner || await hasUploaderRole(s.id, env);
  const avatarUrl = s.avatar
    ? `https://cdn.discordapp.com/avatars/${s.id}/${s.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(s.id) % 6n)}.png`;
  return json({ loggedIn: true, user: { id: s.id, username: s.username, avatar: avatarUrl, canUpload, isOwner } });
}

/* ── Permissions ── */
async function hasUploaderRole(userId, env) {
  if (!userId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return false;
  const r = await df(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
  if (!r.ok) return false;
  const member = await r.json();
  return Array.isArray(member.roles) && member.roles.includes(UPLOADER_ROLE_ID);
}

async function canUserUpload(s, env) {
  if (!s) return false;
  if (s.id === OWNER_ID) return true;
  return await hasUploaderRole(s.id, env);
}

/* ── GitHub ── */
function ghHeaders(env) {
  const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lmu-setups-worker" };
  if (env.GITHUB_TOKEN) h.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return h;
}
function ghRepo(env) { return `repos/${env.GITHUB_OWNER || "lukasracinglmu"}/${env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"}`; }
function ghBranch(env) { return env.GITHUB_BRANCH || "main"; }
function safe(v) { return String(v || "").trim().replace(/[/\\]+/g, "").replace(/\.\./g, ""); }
async function ghReq(path, opts, env) {
  return fetch(GITHUB_API + path, { ...opts, headers: { ...ghHeaders(env), ...(opts?.headers || {}) } });
}

/* ── Setups ── */
async function listSetups(request, env) {
  const url = new URL(request.url);
  const cat = safe(url.searchParams.get("category"));
  const veh = safe(url.searchParams.get("vehicle"));
  if (!cat || !veh) return json({ success: false, error: "Fahrzeug fehlt." }, 400);
  const path = `/${ghRepo(env)}/contents/setups/${enc(cat)}/${enc(veh)}?ref=${enc(ghBranch(env))}`;
  const r = await ghReq(path, {}, env);
  if (r.status === 404) return json({ success: true, setups: [] });
  if (!r.ok) return json({ success: false, error: "Setups konnten nicht geladen werden." }, 502);
  const items = await r.json();
  const base = `https://raw.githubusercontent.com/${env.GITHUB_OWNER || "lukasracinglmu"}/${env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"}/${ghBranch(env)}`;
  const setups = (Array.isArray(items) ? items : [])
    .filter(i => i.type === "file" && /\.zip$/i.test(i.name))
    .map(i => ({ name: i.name, sha: i.sha, download: `${base}/${i.path.split("/").map(enc).join("/")}` }));
  return json({ success: true, setups });
}

async function uploadSetups(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return json({ success: false, error: "Nicht angemeldet." }, 401);
  if (!await canUserUpload(s, env)) return json({ success: false, error: "Keine Upload-Berechtigung." }, 403);
  if (!env.GITHUB_TOKEN) return json({ success: false, error: "Upload nicht konfiguriert." }, 503);

  const form = await request.formData();
  const cat = safe(form.get("category"));
  const veh = safe(form.get("vehicle"));
  if (!cat || !veh) return json({ success: false, error: "Fahrzeugdaten fehlen." }, 400);

  const files = form.getAll("files").filter(x => x && typeof x.arrayBuffer === "function");
  if (!files.length) return json({ success: false, error: "Keine Datei ausgewählt." }, 400);
  if (files.length > MAX_FILES) return json({ success: false, error: `Maximal ${MAX_FILES} Dateien gleichzeitig.` }, 400);

  const results = [], errors = [];
  for (const file of files) {
    const name = safe(file.name);
    if (!/\.zip$/i.test(name)) { errors.push({ name: file.name, error: "Nur ZIP-Dateien erlaubt." }); continue; }
    if (file.size > MAX_SETUP_BYTES) { errors.push({ name, error: "Größer als 25 MB." }); continue; }
    const fpath = `setups/${cat}/${veh}/${name}`;
    const epath = fpath.split("/").map(enc).join("/");
    const existing = await ghReq(`/${ghRepo(env)}/contents/${epath}?ref=${enc(ghBranch(env))}`, {}, env);
    if (existing.ok) { errors.push({ name, error: "Setup existiert bereits." }); continue; }
    if (existing.status !== 404) { errors.push({ name, error: "Prüfung fehlgeschlagen." }); continue; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = ""; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const content = btoa(bin);
    const put = await ghReq(`/${ghRepo(env)}/contents/${epath}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Add setup: ${veh} - ${name}`, content, branch: ghBranch(env) })
    }, env);
    if (!put.ok) { console.error("GH upload error", put.status, await put.text()); errors.push({ name, error: "Upload fehlgeschlagen." }); continue; }
    const d = await put.json();
    results.push({ name, download: d.content?.download_url || null });
  }
  return json({ success: true, uploaded: results, errors });
}

async function deleteSetup(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return json({ success: false, error: "Nicht angemeldet." }, 401);
  if (!await canUserUpload(s, env)) return json({ success: false, error: "Keine Berechtigung." }, 403);
  if (!env.GITHUB_TOKEN) return json({ success: false, error: "Löschen nicht konfiguriert." }, 503);

  let body; try { body = await request.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); }
  const cat = safe(body.category), veh = safe(body.vehicle), name = safe(body.name);
  const sha = String(body.sha || "").replace(/[^a-f0-9]/gi, "");
  if (!cat || !veh || !name || !sha) return json({ success: false, error: "Fehlende Parameter." }, 400);
  if (!/\.zip$/i.test(name)) return json({ success: false, error: "Nur ZIP-Dateien können gelöscht werden." }, 400);

  const fpath = `setups/${cat}/${veh}/${name}`;
  const epath = fpath.split("/").map(enc).join("/");
  const del = await ghReq(`/${ghRepo(env)}/contents/${epath}`, {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: `Delete setup: ${veh} - ${name}`, sha, branch: ghBranch(env) })
  }, env);
  if (!del.ok) { console.error("GH delete error", del.status, await del.text()); return json({ success: false, error: "Löschen fehlgeschlagen." }, 502); }
  return json({ success: true });
}

/* ── Discord API ── */
/* ── Discord API ── */
const DISCORD_TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);
const DISCORD_DISPLAY_CHANNEL_TYPES = new Set([0, 2, 4, 5, 10, 11, 12, 13, 15]);
const PERM_VIEW_CHANNEL = 1024n;
const PERM_SEND_MESSAGES = 2048n;
const PERM_ADMINISTRATOR = 8n;

async function getDiscordGuildChannels(env) {
  const r = await df(`/guilds/${env.DISCORD_GUILD_ID}/channels`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  if (!r.ok) {
    console.error("Discord channels error", r.status, await r.text());
    return null;
  }
  const channels = await r.json();
  return Array.isArray(channels) ? channels : [];
}

async function getDiscordMemberAndRoles(userId, env) {
  const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  const [memberResponse, rolesResponse] = await Promise.all([
    df(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, { headers }),
    df(`/guilds/${env.DISCORD_GUILD_ID}/roles`, { headers })
  ]);
  if (!memberResponse.ok || !rolesResponse.ok) {
    if (!memberResponse.ok) console.error("Discord member permission check error", memberResponse.status, await memberResponse.text());
    if (!rolesResponse.ok) console.error("Discord roles permission check error", rolesResponse.status, await rolesResponse.text());
    return null;
  }
  const member = await memberResponse.json();
  const roles = await rolesResponse.json();
  if (!Array.isArray(member.roles) || !Array.isArray(roles)) return null;
  return { member, roles };
}

function applyOverwrite(permissions, overwrite, mode = "replace") {
  if (!overwrite) return permissions;
  const allow = BigInt(overwrite.allow || "0");
  const deny = BigInt(overwrite.deny || "0");
  if (mode === "replace") return (permissions & ~deny) | allow;
  return permissions;
}

function getUserChannelPermissions(channel, permissionData, guildId, userId) {
  if (!channel || !permissionData) return 0n;
  const { member, roles } = permissionData;
  const everyoneRole = roles.find(r => r.id === guildId);
  let permissions = BigInt(everyoneRole?.permissions || "0");

  const memberRoleIds = new Set(Array.isArray(member.roles) ? member.roles : []);
  for (const role of roles) {
    if (memberRoleIds.has(role.id)) permissions |= BigInt(role.permissions || "0");
  }

  if ((permissions & PERM_ADMINISTRATOR) === PERM_ADMINISTRATOR) {
    return (1n << 60n) - 1n;
  }

  const overwrites = Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [];

  const everyoneOverwrite = overwrites.find(o => o.id === guildId && o.type === 0);
  permissions = applyOverwrite(permissions, everyoneOverwrite);

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type !== 0 || overwrite.id === guildId || !memberRoleIds.has(overwrite.id)) continue;
    roleAllow |= BigInt(overwrite.allow || "0");
    roleDeny |= BigInt(overwrite.deny || "0");
  }
  permissions = (permissions & ~roleDeny) | roleAllow;

  const memberOverwrite = overwrites.find(o => o.type === 1 && o.id === userId);
  permissions = applyOverwrite(permissions, memberOverwrite);

  return permissions;
}

async function getAuthorizedDiscordChannels(userId, env) {
  if (!userId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;
  const [channels, permissionData] = await Promise.all([
    getDiscordGuildChannels(env),
    getDiscordMemberAndRoles(userId, env)
  ]);
  if (!channels || !permissionData) return null;

  return channels
    .filter(channel => DISCORD_DISPLAY_CHANNEL_TYPES.has(channel.type))
    .map(channel => {
      const permissions = getUserChannelPermissions(channel, permissionData, env.DISCORD_GUILD_ID, userId);
      return {
        channel,
        canView: (permissions & PERM_VIEW_CHANNEL) === PERM_VIEW_CHANNEL,
        canSend: (permissions & PERM_SEND_MESSAGES) === PERM_SEND_MESSAGES
      };
    });
}

async function getAuthorizedDiscordChannel(userId, channelId, env) {
  if (!/^[0-9]+$/.test(channelId)) return null;
  const channels = await getAuthorizedDiscordChannels(userId, env);
  if (!channels) return null;
  return channels.find(x => x.channel.id === channelId) || null;
}

async function discordChannels(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return json({ success: false, error: "Nicht angemeldet." }, 401);
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return json({ success: false, error: "Discord nicht konfiguriert." }, 500);

  const authorized = await getAuthorizedDiscordChannels(s.id, env);
  if (!authorized) return json({ success: false, error: "Discord-Berechtigungen konnten nicht geprüft werden." }, 502);

  const visible = authorized
    .filter(x => x.canView)
    .map(x => x.channel)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return json({
    success: true,
    channels: visible.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parent_id: c.parent_id,
      position: c.position,
      canSend: DISCORD_TEXT_CHANNEL_TYPES.has(c.type)
        ? authorized.find(x => x.channel.id === c.id)?.canSend === true
        : false
    }))
  });
}

async function discordMessages(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return json({ success: false, error: "Nicht angemeldet." }, 401);
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return json({ success: false, error: "Discord nicht konfiguriert." }, 500);

  const channelId = new URL(request.url).searchParams.get("channel");
  if (!channelId || !/^[0-9]+$/.test(channelId)) return json({ success: false, error: "Ungültiger Kanal." }, 400);

  const authorized = await getAuthorizedDiscordChannel(s.id, channelId, env);
  if (!authorized?.canView || !DISCORD_TEXT_CHANNEL_TYPES.has(authorized.channel.type)) {
    return json({ success: false, error: "Kein Zugriff auf diesen Kanal." }, 403);
  }

  const r = await df(`/channels/${channelId}/messages?limit=50`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  if (!r.ok) {
    console.error("Discord messages error", r.status, await r.text());
    return json({ success: false, error: "Nachrichten konnten nicht geladen werden." }, 502);
  }

  const msgs = await r.json();
  if (!Array.isArray(msgs)) return json({ success: false, error: "Ungültige Discord-Antwort." }, 502);

  return json({
    success: true,
    messages: msgs.reverse().map(m => ({
      id: m.id,
      content: m.content || "",
      author: {
        id: m.author?.id || "",
        name: m.author?.global_name || m.author?.username || "?",
        avatar: m.author?.avatar || null
      },
      timestamp: m.timestamp
    }))
  });
}

async function discordSendMessage(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return json({ success: false, error: "Nicht angemeldet." }, 401);
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return json({ success: false, error: "Discord nicht konfiguriert." }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); }

  const channelId = String(body.channelId || "");
  const message = String(body.message || "").trim();
  if (!/^[0-9]+$/.test(channelId) || !message) {
    return json({ success: false, error: "Kanal und Nachricht erforderlich." }, 400);
  }

  const authorized = await getAuthorizedDiscordChannel(s.id, channelId, env);
  if (!authorized?.canView || !DISCORD_TEXT_CHANNEL_TYPES.has(authorized.channel.type)) {
    return json({ success: false, error: "Kein Zugriff auf diesen Kanal." }, 403);
  }
  if (!authorized.canSend) {
    return json({ success: false, error: "Du darfst in diesem Kanal keine Nachrichten senden." }, 403);
  }

  const maxUserMessageLength = Math.max(1, 2000 - s.username.length - 4);
  const userMessage = message.slice(0, maxUserMessageLength);
  const content = `**${s.username}**: ${userMessage}`;

  const r = await df(`/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content,
      allowed_mentions: { parse: [] }
    })
  });

  if (!r.ok) {
    console.error("Discord send error", r.status, await r.text());
    return json({ success: false, error: "Nachricht konnte nicht gesendet werden." }, 502);
  }

  const m = await r.json();
  return json({
    success: true,
    message: {
      id: m.id,
      content: m.content || content,
      author: {
        id: m.author?.id || "",
        name: m.author?.global_name || m.author?.username || "LMU Website",
        avatar: m.author?.avatar || null
      },
      timestamp: m.timestamp
    }
  });
}

async function createRequest(request, env) {
  const s = await readSession(request, env.SESSION_SECRET);
  if (!s) return json({ success: false, error: "Nicht angemeldet." }, 401);
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) return json({ success: false, error: "Request-Dienst nicht konfiguriert." }, 503);
  let body; try { body = await request.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); }
  const vehicle = String(body.vehicle || "").trim().slice(0, 100);
  const track = String(body.track || "").trim().slice(0, 100);
  const message = String(body.message || "").trim().slice(0, 500);
  if (!vehicle || !track) return json({ success: false, error: "Fahrzeug und Strecke erforderlich." }, 400);
  const content = `**Setup Request** von **${s.username}**\n**Fahrzeug:** ${vehicle}\n**Strecke:** ${track}${message ? `\n**Nachricht:** ${message}` : ""}`;
  const r = await df(`/channels/${env.DISCORD_CHANNEL_ID}/messages`, { method: "POST", headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
  if (!r.ok) { console.error("Discord request error", r.status, await r.text()); return json({ success: false, error: "Request konnte nicht gesendet werden." }, 502); }
  return json({ success: true });
}

/* ── serveHome: gibt index.html aus GitHub aus, OHNE Injection ── */
async function serveHome(request, env) {
  const r = await fetch("https://raw.githubusercontent.com/lukasracinglmu/Le-Mans-Ultimate-Setups/main/index.html", { cache: "no-store" });
  if (!r.ok) return env.ASSETS.fetch(request);
  const html = await r.text();
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/* ── Helpers ── */
async function df(path, opts = {}) { return fetch(DISCORD_API + path, opts); }
function enc(v) { return encodeURIComponent(v); }
function cookie(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function parseCookies(header) { const out = {}; for (const p of header.split(";")) { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); } return out; }
function logout() { const h = new Headers({ Location: "/" }); h.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0)); h.append("Set-Cookie", cookie(STATE_COOKIE, "", 0)); return new Response(null, { status: 302, headers: h }); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" } }); }
async function createSession(payload, secret) {
  const data = JSON.stringify(payload);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))).map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(data) + "." + sig;
}
async function readSession(request, secret) {
  if (!secret) return null;
  const token = parseCookies(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  if (!token) return null;
  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) return null;
  try {
    const data = atob(dataB64);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = new Uint8Array(sig.match(/.{2}/g).map(h => parseInt(h, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;
    const payload = JSON.parse(data);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
