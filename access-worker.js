import { readDisplayName, displayNameStatement, readStoredDisplayName } from "./setup-display-name.js";
import uiWorker from "./ui-hotfix.js";
import { enrichSetupVersions, storeSetupVersion } from "./setup-version.js";
import { writeSetupAuditEvent } from "./audit-log.js";

const DISCORD_API = "https://discord.com/api/v10";
const GITHUB_API = "https://api.github.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === "/api/me" && method === "GET") return augmentedMe(request, env, ctx);
    if (path === "/api/admin/database-access" && method === "GET") return listDatabaseAccess(request, env, ctx);
    if (path === "/api/admin/database-access" && method === "POST") return grantDatabaseAccess(request, env, ctx);
    if (path === "/api/admin/database-access" && method === "DELETE") return revokeDatabaseAccess(request, env, ctx);
    if (path === "/api/admin/access" && method === "GET") return listCombinedAccess(request, env, ctx);
    if (path === "/api/admin/admin-panel-access" && (method === "POST" || method === "DELETE")) return changeAdminPanelAccess(request, env, ctx);

    if ((path === "/api/admin/upload-access" || path === "/api/admin/all-access") && (method === "POST" || method === "DELETE")) {
      return changeManagedAccess(request, env, ctx, path === "/api/admin/all-access");
    }

    if (path === "/api/setups/upload" && method === "POST") {
      const permission = await requireUploadDeleteAccess(request, env, ctx);
      if (permission.error) return permission.error;
      const response = await uiWorker.fetch(request, env, ctx);
      if (response.ok) {
        const data = await safeJson(response.clone());
        if (data?.success) {
          const vehicle=cleanPath(data.vehicle), version=String(data.version || "");
          for (const item of Array.isArray(data.uploaded) ? data.uploaded : []) {
            if (!item?.name || (data.duplicate&&item.alreadyExists)) continue;
            // Finish this audit before the browser writes the next ZIP to the same branch.
            await new Promise(resolve=>setTimeout(resolve,1100));
            await safeAudit({ action:"SETUP_UPLOAD", discordAccount:permission.user.username, discordUserId:permission.user.id, setup:item.name, vehicle, manufacturer:classifyManufacturer(item.name), track:inferTrack(item.name), version, result:"SUCCESS" }, env);
          }
          for(const old of data.retired||[]){
            await new Promise(resolve=>setTimeout(resolve,1100));
            await safeAudit({action:old.action==="delete"?"SETUP_DELETE":"SETUP_OUTDATED",discordAccount:permission.user.username,discordUserId:permission.user.id,setup:old.name,vehicle,manufacturer:classifyManufacturer(old.name),track:inferTrack(old.name),newValue:old.action==="delete"?"Ersetzt":"Veraltet",result:"SUCCESS"},env);
          }
        }
      }
      return response;
    }

    if (path === "/api/setups/version" && method === "POST") {
      const permission = await requireUploadDeleteAccess(request, env, ctx);
      if (permission.error) return permission.error;
      let body;
      try { body = await request.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); }
      const category = cleanPath(body?.category), vehicle = cleanPath(body?.vehicle), name = cleanPath(body?.name);
      const hasVersion=Object.hasOwn(body,'version'),hasName=Object.hasOwn(body,'displayName');
      if(!hasVersion&&!hasName)return json({success:false,error:"Keine Änderung angegeben."},400);
      if(hasVersion&&typeof body.version!=='string')return json({success:false,error:"Ungültige Version."},400);
      const version=hasVersion?body.version.trim():null;
      if (!category || !vehicle || !name || !/\.zip$/i.test(name)) return json({ success: false, error: "Ungültiges Setup." }, 400);
      if(hasVersion&&(version.length>40||/[\u0000-\u001F\u007F]/.test(version)))return json({success:false,error:"Ungültige Version (maximal 40 Zeichen)."},400);
      const parsedName=hasName?readDisplayName(body.displayName):null;
      if(parsedName?.error)return json({success:false,error:parsedName.error},400);
      if(!env.ACCESS_DB)return json({success:false,error:"Metadaten-Datenbank nicht verfügbar."},503);
      const filePath = `/${ghRepo(env)}/contents/setups/${enc(category)}/${enc(vehicle)}/${enc(name)}?ref=${enc(ghBranch(env))}`;
      let existing;
      try{existing=await ghReq(filePath,{signal:AbortSignal.timeout(15000)},env);}catch{return json({success:false,error:"Setup konnte nicht geprüft werden."},502);}
      if(existing.status===404)return json({success:false,error:"Setup wurde nicht gefunden."},404);
      if(!existing.ok)return json({success:false,error:"Setup konnte nicht geprüft werden."},502);
      const file=await safeJson(existing);
      if(hasName&&!/^[a-f0-9]{40}$/.test(file?.sha||''))return json({success:false,error:"Dateistand konnte nicht bestätigt werden."},502);
      const oldVersion=await readStoredVersion(category,vehicle,name,env);
      let oldName=null;
      try{
        if(hasName)oldName=await readStoredDisplayName(category,vehicle,name,file.sha,env);
        if(hasVersion&&hasName){
          await env.ACCESS_DB.batch([
            env.ACCESS_DB.prepare("INSERT INTO setup_versions (category, vehicle, file_name, version, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(category, vehicle, file_name) DO UPDATE SET version = excluded.version, updated_at = CURRENT_TIMESTAMP").bind(category,vehicle,name,version),
            displayNameStatement(env,category,vehicle,name,file.sha,parsedName.displayName)
          ]);
        }else if(hasName)await displayNameStatement(env,category,vehicle,name,file.sha,parsedName.displayName).run();
        else await storeSetupVersion(category,vehicle,name,version,env);
      }catch{return json({success:false,error:"Änderungen konnten nicht gespeichert werden. Bitte erneut versuchen."},503);}
      runAuditTasks([(async()=>{
        const common={discordAccount:permission.user.username,discordUserId:permission.user.id,setup:name,vehicle,manufacturer:classifyManufacturer(name),track:inferTrack(name),result:"SUCCESS"};
        if(hasVersion&&version!==(oldVersion||''))await safeAudit({...common,action:"SETUP_VERSION_UPDATE",oldValue:oldVersion,newValue:version},env);
        if(hasName&&parsedName.displayName!==(oldName||''))await safeAudit({...common,action:"SETUP_DISPLAY_NAME_UPDATE",oldValue:oldName,newValue:parsedName.displayName},env);
      })()],ctx);
      return json({success:true,category,vehicle,name,version:hasVersion?version:oldVersion,...(hasName?{displayName:parsedName.displayName||null}:{})});
    }

    if (path === "/api/setups/delete" && method === "POST") {
      const permission = await requireUploadDeleteAccess(request, env, ctx);
      if (permission.error) return permission.error;
      const clone = request.clone();
      let meta = { category:"", vehicle:"", name:"", version:null };
      try {
        const body = await clone.json();
        meta.category = cleanPath(body?.category); meta.vehicle = cleanPath(body?.vehicle); meta.name = cleanPath(body?.name);
        if (meta.category && meta.vehicle && meta.name) meta.version = await readStoredVersion(meta.category, meta.vehicle, meta.name, env);
      } catch {}
      const response = await uiWorker.fetch(request, env, ctx);
      if (response.ok) {
        const data = await safeJson(response.clone());
        if (data?.success && data.deleted !== false && meta.name) runAuditTasks([safeAudit({ action:"SETUP_DELETE", discordAccount:permission.user.username, discordUserId:permission.user.id, setup:meta.name, vehicle:meta.vehicle, manufacturer:classifyManufacturer(meta.name), track:inferTrack(meta.name), version:meta.version, result:"SUCCESS" }, env)], ctx);
      }
      return response;
    }

    if ((path === "/api/setups" || path === "/api/setups/download") && method === "GET") {
      const me = await getBaseMe(request, env, ctx);
      if (!me?.loggedIn) return json({ success: false, error: "Nicht angemeldet." }, 401);
      if (!me.databaseAccess) return json({success:false,error:me.rolesAvailable===false?"Discord-Rollenprüfung nicht verfügbar.":"Kein Zugriff auf die Setup Database."},me.rolesAvailable===false?503:403);
      return uiWorker.fetch(request, env, ctx);
    }

    const response = await uiWorker.fetch(request, env, ctx);
    if (method === "GET" && path === "/" && response.headers.get("content-type")?.includes("text/html")) {
      let html = await response.text();
      html = fixHeaderLogo(html);
      html = injectAdminUi(html);
      const headers = new Headers(response.headers);
      headers.set("Content-Length", String(new TextEncoder().encode(html).length));
      return new Response(html, { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  }
};

async function getBaseMe(request, env, ctx) {
  const meRequest = new Request(new URL("/api/me", request.url), { method: "GET", headers: request.headers });
  const response = await uiWorker.fetch(meRequest, env, ctx);
  return safeJson(response);
}

async function augmentedMe(request, env, ctx) {
  return uiWorker.fetch(request, env, ctx);
}

async function requireOwner(request, env, ctx, capability="canManageDatabaseAccess") {
  const me=await getBaseMe(request,env,ctx);
  if (!me?.loggedIn) return {error:json({success:false,error:"Nicht angemeldet."},401)};
  if (!me.user?.[capability]) return {error:json({success:false,error:me.rolesAvailable===false?"Discord-Rollenprüfung nicht verfügbar.":"Keine Admin-Berechtigung."},me.rolesAvailable===false?503:403)};
  return {user:me.user};
}

async function requireFullAdmin(request, env, ctx) {
  const me=await getBaseMe(request,env,ctx);
  if(!me?.loggedIn) return {error:json({success:false,error:"Nicht angemeldet."},401)};
  if(!me.user?.fullAdmin) return {error:json({success:false,error:"Nur Full-Admins dürfen Admin-Rechte verwalten."},403)};
  return {user:me.user};
}
async function hasUploadGrant(userId, env) {
  if (!userId || !env.ACCESS_DB) return false;
  try { const row = await env.ACCESS_DB.prepare("SELECT user_id FROM upload_access WHERE user_id = ? LIMIT 1").bind(String(userId)).first(); return Boolean(row?.user_id); }
  catch { return false; }
}
async function requireUploadDeleteAccess(request, env, ctx) {
  const me=await getBaseMe(request,env,ctx);
  if (!me?.loggedIn || !me.user?.id) return {error:json({success:false,error:"Nicht angemeldet."},401)};
  if (!me.user.canUpload) return {error:json({success:false,error:me.rolesAvailable===false?"Discord-Rollenprüfung nicht verfügbar.":"Keine Upload/Delete-Berechtigung.",retryable:me.rolesAvailable===false},me.rolesAvailable===false?503:403)};
  return {user:me.user};
}

function validUserId(value) { const id = String(value || "").trim(); return /^\d{16,22}$/.test(id) ? id : null; }
async function readUserId(request) { try { return validUserId((await request.json())?.userId); } catch { return null; } }

async function listDatabaseAccess(request, env, ctx) { const auth = await requireOwner(request, env, ctx); if (auth.error) return auth.error; if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503); const result = await env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM database_access ORDER BY created_at DESC").all(); return json({ success: true, grants: result.results || [] }); }
async function grantDatabaseAccess(request, env, ctx) { const auth = await requireOwner(request, env, ctx); if (auth.error) return auth.error; if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503); const userId = await readUserId(request); if (!userId) return json({ success: false, error: "Ungültige Discord User ID." }, 400); await env.ACCESS_DB.prepare("INSERT INTO database_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by").bind(userId, auth.user.id).run(); return json({ success: true, userId }); }
async function revokeDatabaseAccess(request, env, ctx) { const auth = await requireOwner(request, env, ctx); if (auth.error) return auth.error; if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503); const userId = await readUserId(request); if (!userId) return json({ success: false, error: "Ungültige Discord User ID." }, 400); if (await hasUploadGrant(userId, env)) return json({ success: false, error: "Database Access kann nicht entfernt werden, solange Upload/Delete freigegeben ist." }, 409); await env.ACCESS_DB.prepare("DELETE FROM database_access WHERE user_id = ?").bind(userId).run(); return json({ success: true, userId }); }
async function changeManagedAccess(request, env, ctx, all) {
  const auth = await requireOwner(request, env, ctx, "canManageUploadAccess");
  if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return json({success:false,error:"Rechte-Datenbank nicht konfiguriert."},503);
  const userId = await readUserId(request);
  if (!userId) return json({success:false,error:"Ungültige Discord User ID."},400);
  const grant = request.method === "POST";
  const tables = grant ? ["database_access", "upload_access"] : all ? ["upload_access", "database_access"] : ["upload_access"];
  const statements = tables.map(table => grant
    ? env.ACCESS_DB.prepare(`INSERT INTO ${table} (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by`).bind(userId, auth.user.id)
    : env.ACCESS_DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId));
  try {
    await env.ACCESS_DB.batch(statements);
    return json({success:true,userId});
  } catch { return json({success:false,error:"Freigaben konnten nicht gespeichert werden."},503); }
}

async function changeAdminPanelAccess(request, env, ctx) {
  const auth = await requireFullAdmin(request, env, ctx); if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return json({success:false,error:"Rechte-Datenbank nicht konfiguriert."},503);
  let body; try { body = await request.json(); } catch { return json({success:false,error:"Ungültige Anfrage."},400); }
  const userId = String(body?.userId || "").trim();
  if (!/^\d{16,22}$/.test(userId)) return json({success:false,error:"Ungültige Discord User ID."},400);
  await env.ACCESS_DB.prepare("CREATE TABLE IF NOT EXISTS admin_panel_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  if (request.method === "POST") {
    await env.ACCESS_DB.prepare("INSERT INTO admin_panel_access (user_id,granted_by,created_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by,created_at=CURRENT_TIMESTAMP").bind(userId,auth.user.id).run();
    return json({success:true,userId,adminPanel:true});
  }
  await env.ACCESS_DB.prepare("DELETE FROM admin_panel_access WHERE user_id=?").bind(userId).run();
  return json({success:true,userId,adminPanel:false});
}
async function listCombinedAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx); if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const [db, upload, panel] = await Promise.all([env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM database_access").all(),env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM upload_access").all(),env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM admin_panel_access").all().catch(()=>({results:[]}))]);
  const users = new Map();
  for (const row of db.results || []) users.set(row.user_id, { userId: row.user_id, databaseAccess: true, databaseGrantedAt: row.created_at, uploadAccess: false, uploadGrantedAt: null });
  for (const row of panel.results || []) { const item = users.get(row.user_id) || { userId: row.user_id, databaseAccess: false, databaseGrantedAt: null, uploadAccess: false, uploadGrantedAt: null }; item.adminPanelAccess = true; item.adminPanelGrantedAt = row.created_at; users.set(row.user_id, item); }
  for (const row of upload.results || []) { const item = users.get(row.user_id) || { userId: row.user_id, databaseAccess: false, databaseGrantedAt: null, uploadAccess: false, uploadGrantedAt: null }; item.uploadAccess = true; item.uploadGrantedAt = row.created_at; item.databaseAccess = true; users.set(row.user_id, item); }
  const out = [];
  for (const item of users.values()) { const member = await fetchGuildMember(item.userId, env); if(member?.missing){await env.ACCESS_DB.batch(["database_access","upload_access","admin_panel_access"].map(table=>env.ACCESS_DB.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(item.userId)));continue;} item.username = member?.user?.global_name || member?.user?.username || "Unbekannt / nicht verfügbar"; item.avatar = member?.user?.avatar ? `https://cdn.discordapp.com/avatars/${item.userId}/${member.user.avatar}.png?size=128` : null; item.permission = item.uploadAccess ? "Datenbank ansehen, Setups ändern" : "Datenbank nur ansehen";if(item.adminPanelAccess)item.permission += ", Admin-Panel sehen"; out.push(item); }
  out.sort((a,b)=>String(a.username).localeCompare(String(b.username), "de"));
  return json({ success: true, users: out });
}
async function fetchGuildMember(userId, env) { if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !userId) return null; try { const r = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }); if (r.status===404) return {missing:true}; if (!r.ok) return null; return await r.json(); } catch { return null; } }

function ghHeaders(env) { const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lmu-setups-worker" }; if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`; return headers; }
function ghRepo(env) { return `repos/${env.GITHUB_OWNER || "lukasracinglmu"}/${env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"}`; }
function ghBranch(env) { return env.GITHUB_BRANCH || "main"; }
function enc(value) { return encodeURIComponent(String(value)); }
function cleanPath(value) { return String(value || "").trim().replace(/[/\\]+/g, "").replace(/\.\./g, "").replace(/[\u0000-\u001F\u007F]/g, ""); }
async function ghReq(path, opts, env) { return fetch(GITHUB_API + path, { ...opts, headers: { ...ghHeaders(env), ...(opts?.headers || {}) } }); }
function classifySetup(name, vehicle) { const file = String(name || ""), v = String(vehicle || ""); const variant = /(^|[^a-z0-9])evo([^a-z0-9]|$)/i.test(file) ? "EVO" : "Standard"; let series = null; if (/oreca\s*0?7/i.test(v)) { if (/(^|[^a-z0-9])elms([^a-z0-9]|$)/i.test(file)) series = "ELMS"; else if (/(^|[^a-z0-9])wec([^a-z0-9]|$)/i.test(file)) series = "WEC"; else series = "Other"; } return { variant, series }; }
function classifyManufacturer(name) { const n=String(name||"").toUpperCase(); if(n.includes("HYMO"))return"HYMO"; if(n.includes("BEALIEN")||n.includes("BE_ALIEN"))return"beAlien"; if(n.includes(" GO")||n.includes("_GO")||/\bGO\b/.test(n))return"GO"; return null; }
function inferTrack(name) { return String(name||"").replace(/\.zip$/i,"").replace(/[_-]+/g," ").replace(/\s+/g," ").trim() || null; }
async function readStoredVersion(category,vehicle,name,env){ if(!env.ACCESS_DB)return null; try{const row=await env.ACCESS_DB.prepare("SELECT version FROM setup_versions WHERE category = ? AND vehicle = ? AND file_name = ? LIMIT 1").bind(String(category),String(vehicle),String(name)).first(); return row?.version ?? null;}catch{return null;} }
async function safeAudit(event,env){ try{return await writeSetupAuditEvent(event,env);}catch(e){console.error("Audit log failed",e instanceof Error?e.message:"unknown");return null;} }
function runAuditTasks(tasks,ctx){const work=Promise.allSettled(tasks);if(ctx?.waitUntil)ctx.waitUntil(work);else work.catch(()=>{});}

async function listSetupsForGrantedUser(request, env) {
  const url = new URL(request.url), cat = cleanPath(url.searchParams.get("category")), veh = cleanPath(url.searchParams.get("vehicle")); if (!cat || !veh) return json({ success: false, error: "Fahrzeug fehlt." }, 400);
  const path = `/${ghRepo(env)}/contents/setups/${enc(cat)}/${enc(veh)}?ref=${enc(ghBranch(env))}`; const r = await ghReq(path, {}, env); if (r.status === 404) return json({ success: true, setups: [] }); if (!r.ok) return json({ success: false, error: "Setups konnten nicht geladen werden." }, 502);
  const items = await r.json(); let setups = (Array.isArray(items) ? items : []).filter(i => i.type === "file" && /\.zip$/i.test(i.name)).map(i => ({ name: i.name, sha: i.sha, download: `/api/setups/download?category=${enc(cat)}&vehicle=${enc(veh)}&name=${enc(i.name)}`, ...classifySetup(i.name, veh) })).sort((a,b)=>a.name.localeCompare(b.name,"de",{numeric:true,sensitivity:"base"}));
  setups = await enrichSetupVersions(setups, cat, veh, env); return json({ success: true, setups });
}
async function downloadSetupForGrantedUser(request, env) {
  const url = new URL(request.url), cat = cleanPath(url.searchParams.get("category")), veh = cleanPath(url.searchParams.get("vehicle")), name = cleanPath(url.searchParams.get("name")); if (!cat || !veh || !name || !/\.zip$/i.test(name)) return json({ success: false, error: "Ungültiger Download." }, 400);
  const path = `/${ghRepo(env)}/contents/setups/${enc(cat)}/${enc(veh)}/${enc(name)}?ref=${enc(ghBranch(env))}`; const meta = await ghReq(path, {}, env); if (meta.status === 404) return json({ success: false, error: "Setup nicht gefunden." }, 404); if (!meta.ok) return json({ success: false, error: "Setup konnte nicht geladen werden." }, 502); const data = await meta.json(); const file = await fetch(data.download_url, { headers: { Accept: "application/octet-stream" } }); if (!file.ok) return json({ success: false, error: "Setup konnte nicht geladen werden." }, 502); const headers = new Headers(file.headers); headers.set("Content-Type", "application/zip"); headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`); headers.set("Cache-Control", "private, no-store"); headers.set("X-Content-Type-Options", "nosniff"); return new Response(file.body, { status: 200, headers });
}

function fixHeaderLogo(html) { return html.replace('<link rel="preload" href="/assets/three-peaks-racing-logo.webp" as="image" type="image/webp">','<link rel="preload" href="/assets/bp-logo.webp?v=20261023-1" as="image" type="image/webp">').replace('<img class="brand-logo" src="/assets/three-peaks-racing-logo.webp"','<img class="brand-logo" src="/assets/bp-logo.webp?v=20261023-1"').replace("logo.src='/assets/three-peaks-racing-logo.webp'","logo.src='/assets/bp-logo.webp?v=20261023-1'"); }
function injectAdminUi(html) {
  const oldPanel = '<div id="adminPanel" class="admin-panel hidden"><h3>Admin</h3><div class="admin-row"><input id="adminUserId" placeholder="Discord User ID"><button onclick="grantUploadAccess()">Upload freigeben</button><button onclick="revokeUploadAccess()">Freigabe entfernen</button><button onclick="registerRequestCommand()">/request registrieren</button></div><div id="adminResult" class="request-message"></div></div>';
  const newPanel = '<div id="adminPanel" class="admin-panel hidden"><h3>Admin</h3><p>Freigaben für die eingegebene Person. Discord-Rollen gelten weiterhin.</p><div class="admin-row"><input id="adminUserId" placeholder="Discord User ID"><button type="button" data-upload-admin onclick="adminSetAllFromInput(true)">Alles freigeben</button><button type="button" data-upload-admin onclick="adminSetAllFromInput(false)">Alles entfernen</button><button type="button" onclick="grantDatabaseAccess()">Database freigeben</button><button type="button" onclick="revokeDatabaseAccess()">Database entfernen</button><button type="button" data-upload-admin onclick="grantUploadAccess()">Upload/Delete freigeben</button><button type="button" data-upload-admin onclick="revokeUploadAccess()">Upload/Delete entfernen</button></div><div id="adminResult" class="request-message"></div><div id="adminAccessList" style="margin-top:16px;display:grid;gap:10px"></div></div>';
  html = html.replace(oldPanel, newPanel);
  const script = `<script>(()=>{let adminBusy=false;const escAdmin=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');async function loadAdminAccessList(){const panel=document.getElementById('adminPanel'),list=document.getElementById('adminAccessList');if(!panel||!list)return;try{const me=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json());if(!me?.user?.isAdmin){panel.classList.add('hidden');return;}panel.classList.remove('hidden');panel.querySelectorAll('[data-upload-admin]').forEach(button=>button.classList.toggle('hidden',!me.user.canManageUploadAccess));const r=await fetch('/api/admin/access',{cache:'no-store',credentials:'same-origin'}),d=await r.json();if(!d.success)throw new Error(d.error||'Fehler');list.innerHTML=(d.users||[]).map(u=>'<div style="border:1px solid var(--border);border-radius:8px;padding:12px"><div><strong>User ID:</strong> '+escAdmin(u.userId)+'</div><div style="margin-top:4px"><strong>Discord-Name:</strong> '+escAdmin(u.username)+'</div><div style="margin-top:4px"><strong>Recht:</strong> '+escAdmin(u.permission||'')+'</div></div>').join('')||'<div class="empty">Noch keine individuellen Freigaben.</div>';}catch(e){list.textContent=e.message||'Freigaben konnten nicht geladen werden.';}}async function mutate(url,method,userId){if(adminBusy)return;adminBusy=true;const buttons=document.querySelectorAll('#adminPanel button');buttons.forEach(b=>b.disabled=true);try{const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({userId})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.error||'Fehler.');await loadAdminAccessList();}finally{adminBusy=false;buttons.forEach(b=>b.disabled=false);}}window.adminSetAllFromInput=async grant=>{const id=document.getElementById('adminUserId')?.value.trim(),out=document.getElementById('adminResult');if(!id){out.textContent='Discord User ID fehlt.';return;}try{await mutate('/api/admin/all-access',grant?'POST':'DELETE',id);out.textContent=grant?'Datenbank und Upload/Delete freigegeben.':'Alle persönlichen Freigaben entfernt. Discord-Rollen gelten weiterhin.';}catch(e){out.textContent=e.message;}};window.adminSetDatabase=async(id,grant)=>{try{await mutate('/api/admin/database-access',grant?'POST':'DELETE',id);const out=document.getElementById('adminResult');if(out)out.textContent=grant?'Datenbank freigegeben.':'Datenbank entfernt.';}catch(e){const out=document.getElementById('adminResult');if(out)out.textContent=e.message;}};window.adminSetUpload=async(id,grant)=>{try{await mutate('/api/admin/upload-access',grant?'POST':'DELETE',id);}catch(e){const out=document.getElementById('adminResult');if(out)out.textContent=e.message;}};window.grantDatabaseAccess=async()=>{const id=document.getElementById('adminUserId')?.value.trim();if(id)await window.adminSetDatabase(id,true);};window.revokeDatabaseAccess=async()=>{const id=document.getElementById('adminUserId')?.value.trim();if(id)await window.adminSetDatabase(id,false);};window.grantUploadAccess=async()=>{const id=document.getElementById('adminUserId')?.value.trim();if(id)await window.adminSetUpload(id,true);};window.revokeUploadAccess=async()=>{const id=document.getElementById('adminUserId')?.value.trim();if(id)await window.adminSetUpload(id,false);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(loadAdminAccessList,0),{once:true});else setTimeout(loadAdminAccessList,0);})();</script>`;
  return html.replace('</body>', script+'\n</body>');
}
async function safeJson(response) { try { return await response.json(); } catch { return null; } }
function json(data, status=200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
