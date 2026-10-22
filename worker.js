import { ownerUserId, resolvePermissions } from "./discord-permissions.js";
import { readPreviousSetups, deleteGithubSetup } from "./setup-lifecycle.js";
import { readRepoFile, readSiteFile } from "./repo-read.js";
import { persistSetupFile, readUploadForm } from "./upload-storage.js";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_OAUTH = "https://discord.com/oauth2";
const SESSION_COOKIE = "lmu_session";
const STATE_COOKIE = "lmu_oauth_state";
const SESSION_TTL = 604800;
const MAX_FILES = 50;
const MAX_SETUP_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BODY_BYTES = 26 * 1024 * 1024;
const GITHUB_API = "https://api.github.com";
const REQUEST_MODAL_ID = "lmu_setup_request";
const DISCORD_TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);
const DISCORD_DISPLAY_CHANNEL_TYPES = new Set([0, 2, 4, 5, 10, 11, 12, 13, 15]);
const PERM_VIEW_CHANNEL = 1024n;
const PERM_SEND_MESSAGES = 2048n;
const PERM_ADMINISTRATOR = 8n;

let discordVerifyKeyCache = { key: null, expiresAt: 0 };

export default {
  async fetch(request, env, ctx, uploadForm) {
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
      if (p === "/api/setups/upload" && m === "POST") return uploadSetups(request, env, uploadForm);
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
  const appUrl = new URL("/", env.SITE_URL).toString();
  const h = securityHeaders(new Headers({ "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" }));
  h.append("Set-Cookie", cookie(SESSION_COOKIE, sess, SESSION_TTL)); h.append("Set-Cookie", cookie(STATE_COOKIE, "", 0));
  const target = JSON.stringify(appUrl);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Anmeldung abgeschlossen</title></head><body><script>window.location.replace(${target});</script><noscript><meta http-equiv="refresh" content="0;url=${appUrl}"></noscript></body></html>`;
  return new Response(html, { status: 200, headers: h });
}

async function fetchGuildMember(userId, env) {
  if (!userId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return { ok: false, status: 503, member: null };
  const r = await df(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
  if (r.status === 404) return { ok: true, status: 404, member: null };
  if (!r.ok) return { ok: false, status: r.status, member: null };
  return { ok: true, status: 200, member: await r.json() };
}
async function requireDatabaseAccess(request, env) {
  const session=await readSession(request,env.SESSION_SECRET);
  if (!session) return { error:json({success:false,error:"Nicht angemeldet."},401) };
  const permission=await resolvePermissions(session.id,env);
  if (!permission.databaseAccess) return { error:json({success:false,error:permission.rolesAvailable?"Erforderliche Discord-Rolle fehlt.":"Discord-Rollenprüfung nicht verfügbar."},permission.rolesAvailable?403:503) };
  return { session };
}

async function currentUser(request, env) {
  const session=await readSession(request,env.SESSION_SECRET);
  if (!session) return json({loggedIn:false,databaseAccess:false});
  const permission=await resolvePermissions(session.id,env);
  const avatar=session.avatar?`https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=64`:`https://cdn.discordapp.com/embed/avatars/${Number(BigInt(session.id)%6n)}.png`;
  const {databaseAccess,rolesAvailable,...userPermissions}=permission;
  return json({loggedIn:true,databaseAccess,rolesAvailable,user:{id:session.id,username:session.username,avatar,...userPermissions}});
}

async function requireOwner(request, env) {
  const session=await readSession(request,env.SESSION_SECRET);
  if (!session) return {error:json({success:false,error:"Nicht angemeldet."},401)};
  if (session.id!==ownerUserId(env)) return {error:json({success:false,error:"Keine Admin-Berechtigung."},403)};
  return {session};
}

async function listUploadAccess(request, env) { const auth = await requireOwner(request, env); if (auth.error) return auth.error; if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503); const result = await env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM upload_access ORDER BY created_at DESC").all(); return json({ success: true, grants: result.results || [] }); }
async function grantUploadAccess(request, env) { const auth = await requireOwner(request, env); if (auth.error) return auth.error; if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503); let body; try { body = await request.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); } const userId = String(body.userId || "").trim(); if (!/^\d{16,22}$/.test(userId)) return json({ success: false, error: "Ungültige Discord User ID." }, 400); await env.ACCESS_DB.prepare("INSERT INTO upload_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by, created_at = CURRENT_TIMESTAMP").bind(userId, auth.session.id).run(); return json({ success: true, userId }); }
async function revokeUploadAccess(request, env) { const auth = await requireOwner(request, env); if (auth.error) return auth.error; if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503); let body; try { body = await request.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); } const userId = String(body.userId || "").trim(); if (!/^\d{16,22}$/.test(userId)) return json({ success: false, error: "Ungültige Discord User ID." }, 400); await env.ACCESS_DB.prepare("DELETE FROM upload_access WHERE user_id = ?").bind(userId).run(); return json({ success: true, userId }); }

function ghHeaders(env) { const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lmu-setups-worker" }; if (env.GITHUB_TOKEN) h.Authorization = `Bearer ${env.GITHUB_TOKEN}`; return h; }
function ghRepo(env) { return `repos/${env.GITHUB_OWNER || "lukasracinglmu"}/${env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"}`; }
function ghBranch(env) { return env.GITHUB_BRANCH || "main"; }
function safe(v) { return String(v || "").trim().replace(/[/\\]+/g, "").replace(/\.\./g, "").replace(/[\u0000-\u001F\u007F]/g, ""); }
async function ghReq(path, opts, env) { return fetch(`${GITHUB_API}/${ghRepo(env)}${path}`, { ...opts, headers: { ...ghHeaders(env), ...(opts?.headers || {}) } }); }
function zipOk(file) { return file instanceof File && /\.zip$/i.test(file.name) && file.size > 0 && file.size <= MAX_SETUP_BYTES; }
function normalizeName(name) { return safe(String(name || "").slice(0, 180)); }
function clean(v,max=1000){return String(v||"").replace(/[\u0000-\u001F\u007F]/g," ").trim().slice(0,max)}
function classifySetup(name, vehicle) { const file = String(name || ""), v = String(vehicle || ""); const variant = /(^|[^a-z0-9])evo([^a-z0-9]|$)/i.test(file) ? "EVO" : "Standard"; let series = null; if (/oreca\s*0?7/i.test(v)) { if (/(^|[^a-z0-9])elms([^a-z0-9]|$)/i.test(file)) series = "ELMS"; else if (/(^|[^a-z0-9])wec([^a-z0-9]|$)/i.test(file)) series = "WEC"; else series = "Other"; } return { variant, series }; }
async function listSetups(request, env) { const a=await requireDatabaseAccess(request,env);if(a.error)return a.error;const u=new URL(request.url),cat=safe(u.searchParams.get("category")),veh=safe(u.searchParams.get("vehicle"));if(!cat||!veh)return json({success:false,error:"Fahrzeug fehlt."},400);const path=`/contents/setups/${encodeURIComponent(cat)}/${encodeURIComponent(veh)}?ref=${encodeURIComponent(ghBranch(env))}`;const r=await ghReq(path,{},env);if(r.status===404)return json({success:true,setups:[]});if(!r.ok)return json({success:false,error:"Setups konnten nicht geladen werden."},502);const items=await r.json();const setups=(Array.isArray(items)?items:[]).filter(i=>i.type==="file"&&/\.zip$/i.test(i.name)).map(i=>({name:i.name,sha:i.sha,download:`/api/setups/download?category=${encodeURIComponent(cat)}&vehicle=${encodeURIComponent(veh)}&name=${encodeURIComponent(i.name)}`,...classifySetup(i.name,veh)})).sort((a,b)=>a.name.localeCompare(b.name,"de",{numeric:true,sensitivity:"base"}));return json({success:true,setups}); }
async function downloadSetup(request, env) { const a=await requireDatabaseAccess(request,env);if(a.error)return a.error;const u=new URL(request.url),cat=safe(u.searchParams.get("category")),veh=safe(u.searchParams.get("vehicle")),name=safe(u.searchParams.get("name"));if(!cat||!veh||!name||!/\.zip$/i.test(name))return json({success:false,error:"Ungültiger Download."},400);const raw=await readRepoFile(env,`setups/${cat}/${veh}/${name}`);if(raw.status===404)return json({success:false,error:"Setup nicht gefunden."},404);if(!raw.ok)return json({success:false,error:"Download fehlgeschlagen."},502);const h=securityHeaders(new Headers(raw.headers));h.set("Content-Type","application/zip");h.set("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(name)}`);h.set("Cache-Control","private, no-store");return new Response(raw.body,{status:200,headers:h}); }
async function uploadSetups(request, env, suppliedForm) {
  const sizeError = validateRequestSize(request);
  if (sizeError) return sizeError;
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return json({ success:false, error:"Nicht angemeldet." }, 401);
  const permission=await resolvePermissions(session.id,env);
  if (!permission.canUpload) return json({success:false,error:permission.rolesAvailable?"Keine Upload-Berechtigung.":"Discord-Rollenprüfung nicht verfügbar.",retryable:!permission.rolesAvailable},permission.rolesAvailable?403:503);
  let form;
  try { form = suppliedForm || await readUploadForm(request); }
  catch (error) { return json({ success:false, error:error.status === 413 ? "Request zu groß." : "Ungültiger Upload.", retryable:false }, error.status === 413 ? 413 : 400); }
  const category=safe(form.get("category")), vehicle=safe(form.get("vehicle")), files=form.getAll("files");
  if (!category || !vehicle || !files.length || files.length > MAX_FILES) return json({ success:false, error:"Ungültiger Upload.", retryable:false }, 400);
  const previous=readPreviousSetups(form,files.map(file=>normalizeName(file?.name)));
  if(previous.error)return json({success:false,error:previous.error,retryable:false},400);
  const uploaded=[], errors=[];
  for (const file of files) {
    const name=previous.duplicateOf?.name||normalizeName(file?.name), originalName=String(file?.name || "Unbekannt");
    if (!zipOk(file) || !name) { errors.push({ name: name || originalName, originalName, error:"Ungültige ZIP-Datei.", retryable:false }); continue; }
    const result=await persistSetupFile({ file, name, category, vehicle, branch:ghBranch(env), replaceSha:previous.action==="replace"?previous.targets.find(target=>target.name===name)?.sha:undefined, expectedFileSha:previous.duplicateOf?.sha, preserveSha:previous.action!=="replace"?previous.targets.find(target=>target.name===name)?.sha:undefined, version:String(form.get("version")||""), githubRequest:(path,options)=>ghReq(path,options,env) });
    if (result.uploaded) uploaded.push({ name:result.name||name, originalName, sha:result.sha, alreadyExists:result.alreadyExists });
    else errors.push({ name, originalName, ...result });
  }
  const retryable=errors.some(error=>error.retryable), retryAfterMs=Math.max(0,...errors.map(error=>error.retryAfterMs || 0));
  const response=json({ success:uploaded.length>0, uploaded, errors, retryable, retryAfterMs }, uploaded.length ? 200 : retryable ? 503 : errors.some(error=>error.code==="FILE_CONFLICT") ? 409 : 400);
  if (retryAfterMs) response.headers.set("Retry-After",String(Math.ceil(retryAfterMs/1000)));
  return response;
}

async function deleteSetup(request, env) {
  const s=await readSession(request,env.SESSION_SECRET);if(!s)return json({success:false,error:"Nicht angemeldet."},401);const permission=await resolvePermissions(s.id,env);if(!permission.canUpload)return json({success:false,error:permission.rolesAvailable?"Keine Löschberechtigung.":"Discord-Rollenprüfung nicht verfügbar."},permission.rolesAvailable?403:503);
  let b;try{b=await request.json()}catch{return json({success:false,error:"Ungültige Anfrage."},400)}const cat=safe(b.category),veh=safe(b.vehicle),name=safe(b.name);if(!cat||!veh||!name||!/\.zip$/i.test(name))return json({success:false,error:"Ungültige Datei."},400);
  if(b.sha!==undefined&&!/^[a-f0-9]{40}$/.test(b.sha))return json({success:false,error:"Ungültiger Dateistand.",retryable:false},400);
  const result=await deleteGithubSetup({category:cat,vehicle:veh,name,expectedSha:b.sha,branch:ghBranch(env),githubRequest:(path,options)=>ghReq(path,options,env)});
  return json(result,result.success?200:result.status||502);
}

async function createRequest(request, env) {
  const s=await readSession(request,env.SESSION_SECRET);if(!s)return json({success:false,error:"Nicht angemeldet."},401);let b;try{b=await request.json()}catch{return json({success:false,error:"Ungültige Anfrage."},400)}const vehicle=clean(b.vehicle,100),carClass=clean(b.carClass,80),track=clean(b.track,100),message=clean(b.message,1000);if(!vehicle||!track)return json({success:false,error:"Fahrzeug und Strecke sind erforderlich."},400);const content=["**Setup Request**",`**Fahrer:** ${s.username} (<@${s.id}>)`,`**Fahrzeug:** ${vehicle}`,carClass?`**Klasse:** ${carClass}`:null,`**Strecke:** ${track}`,message?`**Nachricht:** ${message}`:null].filter(Boolean).join("\n");const r=await sendDiscord(env,content,{parse:[],users:[s.id]});if(!r.ok)return json({success:false,error:"Request konnte nicht gesendet werden."},502);return json({success:true});
}

async function discordChannels(request, env) { const s=await readSession(request,env.SESSION_SECRET); if(!s)return json({success:false,error:"Nicht angemeldet."},401); const channels=await df(`/guilds/${env.DISCORD_GUILD_ID}/channels`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}}); if(!channels.ok)return json({success:false,error:"Channels konnten nicht geladen werden."},502); const member=await fetchGuildMember(s.id,env); if(!member.ok||!member.member)return json({success:true,channels:[]}); const roles=await df(`/guilds/${env.DISCORD_GUILD_ID}/roles`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}}); if(!roles.ok)return json({success:false,error:"Rollen konnten nicht geladen werden."},502); const rs=await roles.json(); const roleMap=new Map(rs.map(r=>[r.id,BigInt(r.permissions||"0")])); const guildPerm=computeGuildPermissions(member.member,roleMap,env.DISCORD_GUILD_ID); const all=await channels.json(); const visible=all.filter(c=>DISCORD_DISPLAY_CHANNEL_TYPES.has(c.type)&&canViewChannel(c,member.member,guildPerm,roleMap,env.DISCORD_GUILD_ID)); return json({success:true,channels:visible.map(c=>({id:c.id,name:c.name,type:c.type,parentId:c.parent_id||null,position:c.position||0}))}); }
async function discordMessages(request, env) { const s=await readSession(request,env.SESSION_SECRET); if(!s)return json({success:false,error:"Nicht angemeldet."},401); const url=new URL(request.url); const id=url.searchParams.get("channelId"); const c=await getAuthorizedChannel(id,s,env,false); if(c.error)return c.error; const r=await df(`/channels/${id}/messages?limit=20`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}}); if(!r.ok)return json({success:false,error:"Nachrichten konnten nicht geladen werden."},502); const msgs=await r.json(); return json({success:true,messages:msgs.reverse().map(x=>({id:x.id,content:x.content||"",author:x.author?.global_name||x.author?.username||"Unbekannt",authorId:x.author?.id||null,timestamp:x.timestamp||null}))}); }
async function discordSendMessage(request, env) { const s=await readSession(request,env.SESSION_SECRET); if(!s)return json({success:false,error:"Nicht angemeldet."},401); let b;try{b=await request.json()}catch{return json({success:false,error:"Ungültige Anfrage."},400)}const id=String(b.channelId||"");const content=clean(b.content,2000);if(!content)return json({success:false,error:"Nachricht fehlt."},400);const c=await getAuthorizedChannel(id,s,env,true);if(c.error)return c.error;const r=await df(`/channels/${id}/messages`,{method:"POST",headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({content,allowed_mentions:{parse:[]}})});if(!r.ok)return json({success:false,error:"Nachricht konnte nicht gesendet werden."},502);return json({success:true}); }
async function getAuthorizedChannel(id,s,env,send){if(!/^\d{16,22}$/.test(id))return{error:json({success:false,error:"Ungültiger Channel."},400)};const cr=await df(`/channels/${id}`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});if(!cr.ok)return{error:json({success:false,error:"Channel nicht gefunden."},404)};const c=await cr.json();if(c.guild_id!==env.DISCORD_GUILD_ID||!DISCORD_DISPLAY_CHANNEL_TYPES.has(c.type))return{error:json({success:false,error:"Channel nicht erlaubt."},403)};const member=await fetchGuildMember(s.id,env);if(!member.ok||!member.member)return{error:json({success:false,error:"Kein Channel-Zugriff."},403)};const rr=await df(`/guilds/${env.DISCORD_GUILD_ID}/roles`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});if(!rr.ok)return{error:json({success:false,error:"Rollen konnten nicht geprüft werden."},502)};const rs=await rr.json();const roleMap=new Map(rs.map(r=>[r.id,BigInt(r.permissions||"0")]));const gp=computeGuildPermissions(member.member,roleMap,env.DISCORD_GUILD_ID);if(!canViewChannel(c,member.member,gp,roleMap,env.DISCORD_GUILD_ID))return{error:json({success:false,error:"Kein Channel-Zugriff."},403)};if(send&&!canSendChannel(c,member.member,gp,roleMap,env.DISCORD_GUILD_ID))return{error:json({success:false,error:"Keine Schreibberechtigung."},403)};return{channel:c}}
function computeGuildPermissions(member,roleMap,guildId){let p=roleMap.get(guildId)||0n;for(const rid of member.roles||[])p|=roleMap.get(rid)||0n;if((p&PERM_ADMINISTRATOR)!==0n)return (1n<<53n)-1n;return p}function applyOverwrite(p,allow,deny){p&=~deny;p|=allow;return p}function channelPermissions(c,member,gp,roleMap,guildId){if((gp&PERM_ADMINISTRATOR)!==0n)return gp;let p=gp;const ow=c.permission_overwrites||[];const everyone=ow.find(x=>x.type===0&&x.id===guildId);if(everyone)p=applyOverwrite(p,BigInt(everyone.allow||"0"),BigInt(everyone.deny||"0"));let allow=0n,deny=0n;for(const x of ow){if(x.type===0&&(member.roles||[]).includes(x.id)){allow|=BigInt(x.allow||"0");deny|=BigInt(x.deny||"0")}}p=applyOverwrite(p,allow,deny);const user=ow.find(x=>x.type===1&&x.id===member.user.id);if(user)p=applyOverwrite(p,BigInt(user.allow||"0"),BigInt(user.deny||"0"));return p}function canViewChannel(c,m,gp,rm,gid){return (channelPermissions(c,m,gp,rm,gid)&PERM_VIEW_CHANNEL)!==0n}function canSendChannel(c,m,gp,rm,gid){const p=channelPermissions(c,m,gp,rm,gid);return (p&PERM_VIEW_CHANNEL)!==0n&&(p&PERM_SEND_MESSAGES)!==0n&&DISCORD_TEXT_CHANNEL_TYPES.has(c.type)}

async function registerRequestCommand(request, env) { const auth=await requireOwner(request,env); if(auth.error)return auth.error; if(!env.DISCORD_CLIENT_ID||!env.DISCORD_GUILD_ID||!env.DISCORD_BOT_TOKEN)return json({success:false,error:"Discord Bot nicht vollständig konfiguriert."},503); const cmd={name:"request",description:"Setup für LMU anfragen",type:1}; const r=await df(`/applications/${env.DISCORD_CLIENT_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,{method:"POST",headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify(cmd)}); if(!r.ok)return json({success:false,error:"/request konnte nicht registriert werden."},502); return json({success:true}); }
async function discordInteraction(request,env){if(!await verifyDiscord(request,env))return new Response("invalid request signature",{status:401});const b=await request.json();if(b.type===1)return json({type:1});if(b.type===2&&b.data?.name==="request")return json({type:9,data:{custom_id:REQUEST_MODAL_ID,title:"Setup anfragen",components:[{type:1,components:[{type:4,custom_id:"vehicle",label:"Fahrzeug",style:1,required:true,max_length:100}]},{type:1,components:[{type:4,custom_id:"car_class",label:"Klasse",style:1,required:false,max_length:80}]},{type:1,components:[{type:4,custom_id:"track",label:"Strecke",style:1,required:true,max_length:100}]},{type:1,components:[{type:4,custom_id:"message",label:"Nachricht",style:2,required:false,max_length:1000}]}]}});if(b.type===5&&b.data?.custom_id===REQUEST_MODAL_ID){const f={};for(const row of b.data.components||[])for(const x of row.components||[])f[x.custom_id]=clean(x.value,x.custom_id==="message"?1000:100);const uid=b.member?.user?.id||b.user?.id;const uname=b.member?.user?.global_name||b.member?.user?.username||b.user?.global_name||b.user?.username||"Unbekannt";const content=["**Setup Request**",uid?`**Fahrer:** ${uname} (<@${uid}>)`:`**Fahrer:** ${uname}`,`**Fahrzeug:** ${f.vehicle||"-"}`,f.car_class?`**Klasse:** ${f.car_class}`:null,`**Strecke:** ${f.track||"-"}`,f.message?`**Nachricht:** ${f.message}`:null].filter(Boolean).join("\n");const r=await sendDiscord(env,content,{parse:[],users:uid?[uid]:[]});return r.ok?json({type:4,data:{content:"Setup Request wurde gesendet.",flags:64}}):json({type:4,data:{content:"Setup Request konnte nicht gesendet werden.",flags:64}})}return json({type:4,data:{content:"Nicht unterstützt.",flags:64}})}
async function verifyDiscord(request,env){if(!env.DISCORD_PUBLIC_KEY)return false;const sig=request.headers.get("X-Signature-Ed25519"),ts=request.headers.get("X-Signature-Timestamp");if(!sig||!ts)return false;const body=await request.clone().text();try{const key=await getVerifyKey(env.DISCORD_PUBLIC_KEY);return crypto.subtle.verify({name:"Ed25519"},key,hex(sig),new TextEncoder().encode(ts+body))}catch{return false}}async function getVerifyKey(h){if(discordVerifyKeyCache.key&&discordVerifyKeyCache.expiresAt>Date.now())return discordVerifyKeyCache.key;const key=await crypto.subtle.importKey("raw",hex(h),{name:"Ed25519"},false,["verify"]);discordVerifyKeyCache={key,expiresAt:Date.now()+3600000};return key}
function hex(s){const out=new Uint8Array(s.length/2);for(let i=0;i<out.length;i++)out[i]=parseInt(s.slice(i*2,i*2+2),16);return out}
async function df(path,opts={}){return fetch(`${DISCORD_API}${path}`,opts)}async function sendDiscord(env,content,allowed_mentions={parse:[]}){if(!env.DISCORD_CHANNEL_ID||!env.DISCORD_BOT_TOKEN)return{ok:false};return df(`/channels/${env.DISCORD_CHANNEL_ID}/messages`,{method:"POST",headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({content,allowed_mentions})})}
function parseCookies(h){return Object.fromEntries(h.split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]}))}
function cookie(n,v,age){return `${n}=${encodeURIComponent(v)}; Max-Age=${age}; Path=/; HttpOnly; Secure; SameSite=Lax`}
async function createSession(p,secret){const data=btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(data)));return `${data}.${bytesToBase64(sig).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}`}
async function readSession(req,secret){if(!secret)return null;const raw=parseCookies(req.headers.get("Cookie")||"")[SESSION_COOKIE];if(!raw)return null;const [d,s]=raw.split(".");if(!d||!s)return null;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);const sig=base64ToBytes(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4));if(!await crypto.subtle.verify("HMAC",key,sig,new TextEncoder().encode(d)))return null;let p;try{p=JSON.parse(decodeURIComponent(escape(atob(d.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-d.length%4)%4)))))}catch{return null}if(!p.exp||p.exp<Math.floor(Date.now()/1000))return null;return p}
function bytesToBase64(bytes){let b="";for(let i=0;i<bytes.length;i+=0x8000)b+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(b)}
function base64ToBytes(b){const s=atob(b),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a}
function logout(){const h=securityHeaders(new Headers({Location:"/"}));h.append("Set-Cookie",cookie(SESSION_COOKIE,"",0));return new Response(null,{status:302,headers:h})}
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:securityHeaders(new Headers({"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}))})}
async function serveHome(request,env){const r=await readSiteFile(request,env,"index.html");const h=securityHeaders(new Headers(r.headers));h.set("Content-Type",r.ok?"text/html; charset=utf-8":"text/plain; charset=utf-8");h.set("Cache-Control","no-store");return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h})}
