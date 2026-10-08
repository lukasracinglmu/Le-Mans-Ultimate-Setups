import uiWorker from "./ui-hotfix.js";

const DISCORD_API = "https://discord.com/api/v10";
const GITHUB_API = "https://api.github.com";
const OWNER_ID = "1033453785416208564";

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

    if (path === "/api/admin/upload-access" && method === "POST") {
      const response = await uiWorker.fetch(request, env, ctx);
      if (response.ok) {
        const body = await safeJson(response.clone());
        if (body?.success && body?.userId && env.ACCESS_DB) {
          const owner = await requireOwner(request, env, ctx);
          if (!owner.error) {
            await env.ACCESS_DB.prepare(
              "INSERT INTO database_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO NOTHING"
            ).bind(String(body.userId), owner.user.id).run();
          }
        }
      }
      return response;
    }

    if (path === "/api/setups/upload" && method === "POST") {
      const permission = await requireUploadDeleteAccess(request, env, ctx);
      if (permission.error) return permission.error;
      return uiWorker.fetch(request, env, ctx);
    }

    if (path === "/api/setups/delete" && method === "POST") {
      const permission = await requireUploadDeleteAccess(request, env, ctx);
      if (permission.error) return permission.error;
      return uiWorker.fetch(request, env, ctx);
    }

    if ((path === "/api/setups" || path === "/api/setups/download") && method === "GET") {
      const me = await getBaseMe(request, env, ctx);
      if (!me?.loggedIn) return json({ success: false, error: "Nicht angemeldet." }, 401);
      const individualDb = await hasDatabaseGrant(me.user?.id, env);
      const uploadDeleteAccess = await hasUploadDeleteAccess(me.user?.id, env);
      if (!me.databaseAccess && !individualDb && !uploadDeleteAccess) return json({ success: false, error: "Kein Zugriff auf die Setup Database." }, 403);
      if (me.databaseAccess) return uiWorker.fetch(request, env, ctx);
      return path === "/api/setups" ? listSetupsForGrantedUser(request, env) : downloadSetupForGrantedUser(request, env);
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
  const meRequest = new Request(request.url, { method: "GET", headers: request.headers });
  const response = await uiWorker.fetch(meRequest, env, ctx);
  const me = await safeJson(response);
  if (!me?.loggedIn || !me?.user?.id) return response;
  const individualDb = await hasDatabaseGrant(me.user.id, env);
  const uploadDeleteAccess = await hasUploadDeleteAccess(me.user.id, env);
  const databaseAccess = Boolean(me.databaseAccess || individualDb || uploadDeleteAccess);
  return json({ ...me, databaseAccess, user: { ...me.user, canUpload: uploadDeleteAccess, individualDatabaseAccess: individualDb, individualUploadAccess: await hasUploadGrant(me.user.id, env) } }, response.status);
}

async function requireOwner(request, env, ctx) {
  const me = await getBaseMe(request, env, ctx);
  if (!me?.loggedIn) return { error: json({ success: false, error: "Nicht angemeldet." }, 401) };
  if (!me?.user?.isOwner && me?.user?.id !== OWNER_ID) return { error: json({ success: false, error: "Keine Admin-Berechtigung." }, 403) };
  return { user: me.user };
}

async function hasDatabaseGrant(userId, env) {
  if (!userId || !env.ACCESS_DB) return false;
  try {
    const row = await env.ACCESS_DB.prepare("SELECT user_id FROM database_access WHERE user_id = ? LIMIT 1").bind(String(userId)).first();
    return Boolean(row?.user_id);
  } catch { return false; }
}

async function hasUploadGrant(userId, env) {
  if (!userId || !env.ACCESS_DB) return false;
  try {
    const row = await env.ACCESS_DB.prepare("SELECT user_id FROM upload_access WHERE user_id = ? LIMIT 1").bind(String(userId)).first();
    return Boolean(row?.user_id);
  } catch { return false; }
}

async function hasSetupRequestRole(userId, env) {
  if (!userId || !env.DISCORD_SETUP_REQUEST_ROLE_ID) return false;
  const member = await fetchGuildMember(userId, env);
  return Boolean(member && Array.isArray(member.roles) && member.roles.includes(String(env.DISCORD_SETUP_REQUEST_ROLE_ID)));
}

async function hasUploadDeleteAccess(userId, env) {
  if (!userId) return false;
  if (String(userId) === OWNER_ID) return true;
  if (await hasUploadGrant(userId, env)) return true;
  return hasSetupRequestRole(userId, env);
}

async function requireUploadDeleteAccess(request, env, ctx) {
  const me = await getBaseMe(request, env, ctx);
  if (!me?.loggedIn || !me?.user?.id) return { error: json({ success: false, error: "Nicht angemeldet." }, 401) };
  if (!await hasUploadDeleteAccess(me.user.id, env)) return { error: json({ success: false, error: "Keine Upload/Delete-Berechtigung." }, 403) };
  return { user: me.user };
}

function validUserId(value) {
  const id = String(value || "").trim();
  return /^\d{16,22}$/.test(id) ? id : null;
}

async function readUserId(request) {
  try { return validUserId((await request.json())?.userId); }
  catch { return null; }
}

async function listDatabaseAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx); if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const result = await env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM database_access ORDER BY created_at DESC").all();
  return json({ success: true, grants: result.results || [] });
}

async function grantDatabaseAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx); if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const userId = await readUserId(request);
  if (!userId) return json({ success: false, error: "Ungültige Discord User ID." }, 400);
  await env.ACCESS_DB.prepare(
    "INSERT INTO database_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by"
  ).bind(userId, auth.user.id).run();
  return json({ success: true, userId });
}

async function revokeDatabaseAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx); if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const userId = await readUserId(request);
  if (!userId) return json({ success: false, error: "Ungültige Discord User ID." }, 400);
  if (await hasUploadGrant(userId, env)) return json({ success: false, error: "Database Access kann nicht entfernt werden, solange Upload/Delete freigegeben ist." }, 409);
  await env.ACCESS_DB.prepare("DELETE FROM database_access WHERE user_id = ?").bind(userId).run();
  return json({ success: true, userId });
}

async function listCombinedAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx); if (auth.error) return auth.error;
  if (!env.ACCESS_DB) return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const [db, upload] = await Promise.all([
    env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM database_access").all(),
    env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM upload_access").all()
  ]);
  const users = new Map();
  for (const row of db.results || []) users.set(row.user_id, { userId: row.user_id, databaseAccess: true, databaseGrantedAt: row.created_at, uploadAccess: false, uploadGrantedAt: null });
  for (const row of upload.results || []) {
    const item = users.get(row.user_id) || { userId: row.user_id, databaseAccess: false, databaseGrantedAt: null, uploadAccess: false, uploadGrantedAt: null };
    item.uploadAccess = true; item.uploadGrantedAt = row.created_at; item.databaseAccess = true;
    users.set(row.user_id, item);
  }
  const out = [];
  for (const item of users.values()) {
    const member = await fetchGuildMember(item.userId, env);
    item.username = member?.user?.global_name || member?.user?.username || "Unbekannt / nicht verfügbar";
    item.permission = item.uploadAccess ? "Upload/Delete" : "Database einsehen";
    out.push(item);
  }
  out.sort((a,b)=>String(a.username).localeCompare(String(b.username), "de"));
  return json({ success: true, users: out });
}

async function fetchGuildMember(userId, env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !userId) return null;
  try {
    const r = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function ghHeaders(env) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lmu-setups-worker" };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}
function ghRepo(env) { return `repos/${env.GITHUB_OWNER || "lukasracinglmu"}/${env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"}`; }
function ghBranch(env) { return env.GITHUB_BRANCH || "main"; }
function enc(value) { return encodeURIComponent(String(value)); }
function cleanPath(value) { return String(value || "").trim().replace(/[/\\]+/g, "").replace(/\.\./g, "").replace(/[\u0000-\u001F\u007F]/g, ""); }
async function ghReq(path, opts, env) { return fetch(GITHUB_API + path, { ...opts, headers: { ...ghHeaders(env), ...(opts?.headers || {}) } }); }
function classifySetup(name, vehicle) {
  const file = String(name || ""), v = String(vehicle || "");
  const variant = /(^|[^a-z0-9])evo([^a-z0-9]|$)/i.test(file) ? "EVO" : "Standard";
  let series = null;
  if (/oreca\s*0?7/i.test(v)) {
    if (/(^|[^a-z0-9])elms([^a-z0-9]|$)/i.test(file)) series = "ELMS";
    else if (/(^|[^a-z0-9])wec([^a-z0-9]|$)/i.test(file)) series = "WEC";
    else series = "Other";
  }
  return { variant, series };
}

async function listSetupsForGrantedUser(request, env) {
  const url = new URL(request.url), cat = cleanPath(url.searchParams.get("category")), veh = cleanPath(url.searchParams.get("vehicle"));
  if (!cat || !veh) return json({ success: false, error: "Fahrzeug fehlt." }, 400);
  const path = `/${ghRepo(env)}/contents/setups/${enc(cat)}/${enc(veh)}?ref=${enc(ghBranch(env))}`;
  const r = await ghReq(path, {}, env);
  if (r.status === 404) return json({ success: true, setups: [] });
  if (!r.ok) return json({ success: false, error: "Setups konnten nicht geladen werden." }, 502);
  const items = await r.json();
  const setups = (Array.isArray(items) ? items : []).filter(i => i.type === "file" && /\.zip$/i.test(i.name)).map(i => ({ name: i.name, sha: i.sha, download: `/api/setups/download?category=${enc(cat)}&vehicle=${enc(veh)}&name=${enc(i.name)}`, ...classifySetup(i.name, veh) })).sort((a,b)=>a.name.localeCompare(b.name,"de",{numeric:true,sensitivity:"base"}));
  return json({ success: true, setups });
}

async function downloadSetupForGrantedUser(request, env) {
  const url = new URL(request.url), cat = cleanPath(url.searchParams.get("category")), veh = cleanPath(url.searchParams.get("vehicle")), name = cleanPath(url.searchParams.get("name"));
  if (!cat || !veh || !name || !/\.zip$/i.test(name)) return json({ success: false, error: "Ungültiger Download." }, 400);
  const path = `/${ghRepo(env)}/contents/setups/${enc(cat)}/${enc(veh)}/${enc(name)}?ref=${enc(ghBranch(env))}`;
  const meta = await ghReq(path, {}, env);
  if (meta.status === 404) return json({ success: false, error: "Setup wurde nicht gefunden." }, 404);
  if (!meta.ok) return json({ success: false, error: "Setup konnte nicht geladen werden." }, 502);
  const item = await meta.json();
  if (!item?.download_url) return json({ success: false, error: "Setup konnte nicht geladen werden." }, 502);
  const file = await fetch(item.download_url, { cache: "no-store" });
  if (!file.ok) return json({ success: false, error: "Setup konnte nicht geladen werden." }, 502);
  const headers = new Headers(file.headers); headers.set("Content-Type", "application/zip"); headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`); headers.set("Cache-Control", "private, no-store"); headers.set("X-Content-Type-Options", "nosniff");
  return new Response(file.body, { status: 200, headers });
}

function fixHeaderLogo(html) {
  return html
    .replace('<link rel="preload" href="/assets/three-peaks-racing-logo.webp" as="image" type="image/webp">','<link rel="preload" href="/assets/header-logo.webp" as="image" type="image/webp">')
    .replace('<img class="brand-logo" src="/assets/three-peaks-racing-logo.webp"','<img class="brand-logo" src="/assets/header-logo.webp"')
    .replace("logo.src='/assets/three-peaks-racing-logo.webp'","logo.src='/assets/header-logo.webp'");
}

function injectAdminUi(html) {
  const oldPanel = '<div id="adminPanel" class="admin-panel hidden"><h3>Admin</h3><div class="admin-row"><input id="adminUserId" placeholder="Discord User ID"><button onclick="grantUploadAccess()">Upload freigeben</button><button onclick="revokeUploadAccess()">Freigabe entfernen</button><button onclick="registerRequestCommand()">/request registrieren</button></div><div id="adminResult" class="request-message"></div></div>';
  const newPanel = '<div id="adminPanel" class="admin-panel hidden"><h3>Admin</h3><div class="admin-row"><input id="adminUserId" placeholder="Discord User ID"><button type="button" onclick="grantDatabaseAccess()">Database freigeben</button><button type="button" onclick="revokeDatabaseAccess()">Database entfernen</button><button type="button" onclick="grantUploadAccess()">Upload/Delete freigeben</button><button type="button" onclick="revokeUploadAccess()">Upload/Delete entfernen</button></div><div id="adminResult" class="request-message"></div><div id="adminAccessList" style="margin-top:16px;display:grid;gap:10px"></div></div>';
  html = html.replace(oldPanel, newPanel);
  const script = `<script>
(()=>{
  const escAdmin=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  async function loadAdminAccessList(){const panel=document.getElementById('adminPanel'),list=document.getElementById('adminAccessList');if(!panel||!list)return;try{const me=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json());if(!me?.user?.isOwner){panel.classList.add('hidden');return;}panel.classList.remove('hidden');const r=await fetch('/api/admin/access',{cache:'no-store',credentials:'same-origin'}),d=await r.json();if(!d.success)throw new Error(d.error||'Fehler');list.innerHTML=(d.users||[]).map(u=>'<div style="border:1px solid var(--border);border-radius:8px;padding:12px"><div><strong>User ID:</strong> '+escAdmin(u.userId)+'</div><div style="margin-top:4px"><strong>Discord-Name:</strong> '+escAdmin(u.username)+'</div><div style="margin-top:4px"><strong>Recht:</strong> '+escAdmin(u.permission||'')+'</div></div>').join('')||'<div class="empty">Noch keine individuellen Freigaben.</div>';}catch(e){list.textContent=e.message||'Freigaben konnten nicht geladen werden.';}}
  async function mutate(url,method,userId){const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({userId})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.error||'Fehler.');await loadAdminAccessList();}
  window.adminSetDatabase=async(id,grant)=>{try{await mutate('/api/admin/database-access',grant?'POST':'DELETE',id);const out=document.getElementById('adminResult');if(out)out.textContent=grant?'Datenbank freigegeben.':'Datenbank entfernt.';}catch(e){const out=document.getElementById('adminResult');if(out)out.textContent=e.message;}};
  window.adminSetUpload=async(id,grant)=>{try{await mutate('/api/admin/upload-access',grant?'POST':'DELETE',id);}catch(e){const out=document.getElementById('adminResult');if(out)out.textContent=e.message;}};
  window.grantDatabaseAccess=async()=>{const id=document.getElementById('adminUserId')?.value.trim();if(id)await window.adminSetDatabase(id,true);};
  window.revokeDatabaseAccess=async()=>{const id=document.getElementById('adminUserId')?.value.trim();if(id)await window.adminSetDatabase(id,false);};
  const oldGrant=window.grantUploadAccess,oldRevoke=window.revokeUploadAccess;
  window.grantUploadAccess=async()=>{const id=document.getElementById('adminUserId')?.value.trim();if(id)await window.adminSetUpload(id,true);};
  window.revokeUploadAccess=async()=>{const id=document.getElementById('adminUserId')?.value.trim();if(id)await window.adminSetUpload(id,false);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(loadAdminAccessList,0),{once:true});else setTimeout(loadAdminAccessList,0);
})();
</script>`;
  return html.replace('</body>', script+'\n</body>');
}

async function safeJson(response) { try { return await response.json(); } catch { return null; } }
function json(data, status=200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
