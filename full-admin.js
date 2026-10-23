import { writeSetupAuditEvent } from "./audit-log.js";
import { createManualBackup } from "./automatic-backup.js";
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validUserId=v=>/^\d{16,22}$/.test(String(v||'').trim())?String(v).trim():null;

async function ensure(env){
  if(!env.ACCESS_DB)throw Error('db');
  await env.ACCESS_DB.prepare(`CREATE TABLE IF NOT EXISTS full_admin_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, username TEXT)`).run();
  try{await env.ACCESS_DB.prepare('ALTER TABLE full_admin_access ADD COLUMN username TEXT').run()}catch{}
}
async function ownerOnly(request,env,ctx,productionWorker){
  const r=await productionWorker.fetch(new Request(new URL('/api/me',request.url),{headers:request.headers}),env,ctx);
  const me=await r.json().catch(()=>null);
  if(!me?.loggedIn)return {error:json({success:false,error:'Nicht angemeldet.'},401)};
  if(!me.user?.isOwner&&!me.user?.fullAdmin)return {error:json({success:false,error:'Nur Full-Admins dürfen diese Einstellungen verwalten.'},403)};
  return {user:me.user};
}
export async function isMaintenanceActive(env){try{const row=await env.ACCESS_DB?.prepare("SELECT value FROM site_settings WHERE key='maintenance'").first();return row?.value==='1'}catch{return false}}
export async function maintenanceState(env){try{const rows=await env.ACCESS_DB?.prepare("SELECT key,value FROM site_settings WHERE key IN ('maintenance','maintenance_message')").all();const out=Object.fromEntries((rows?.results||[]).map(x=>[x.key,x.value]));return {enabled:out.maintenance==='1',message:out.maintenance_message||'Die Website ist momentan wegen Wartungsarbeiten nicht erreichbar.'}}catch{return {enabled:false,message:''}}}
async function discordProfile(userId,env){
  if(!env.DISCORD_BOT_TOKEN||!env.DISCORD_GUILD_ID)return null;
  try{
    const headers={Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`};
    let r=env.DISCORD_GUILD_ID?await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`,{headers,signal:AbortSignal.timeout(8000)}):null;
    let member=r?.ok?await r.json():null;
    if(!member){r=await fetch(`https://discord.com/api/v10/users/${userId}`,{headers,signal:AbortSignal.timeout(8000)});if(!r.ok)return null;member={user:await r.json()};}
    const user=member?.user;return user?{username:user.global_name||user.username||null,avatar:user.avatar?`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`:`https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id)>>22n)%6}.png`}:null;
  }catch{return null}
}
export async function fullAdminApi(request,env,ctx,productionWorker){
  const path=new URL(request.url).pathname;
  const auth=await ownerOnly(request,env,ctx,productionWorker);if(auth.error)return auth.error;
  try{await ensure(env);await env.ACCESS_DB.prepare(`CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)`).run()}catch{return json({success:false,error:'Rechte-Datenbank nicht verfügbar.'},503)}
  if(path==='/api/admin/backup'){if(!auth.user?.isOwner)return json({success:false,error:'Nur der Owner darf Backups erstellen.'},403);if(request.method!=='POST')return json({success:false,error:'Methode nicht erlaubt.'},405);const backup=await createManualBackup(env);return json(backup,backup.success?200:503)}
  if(path==='/api/admin/maintenance'){if(request.method==='GET')return json({success:true,...await maintenanceState(env)});let body;try{body=await request.json()}catch{return json({success:false,error:'Ungültige Anfrage.'},400)}const message=String(body?.message||'').trim().slice(0,500);await env.ACCESS_DB.batch([env.ACCESS_DB.prepare("INSERT INTO site_settings (key,value) VALUES ('maintenance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(body?.enabled?'1':'0'),env.ACCESS_DB.prepare("INSERT INTO site_settings (key,value) VALUES ('maintenance_message',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(message||'Die Website ist momentan wegen Wartungsarbeiten nicht erreichbar.')]);return json({success:true,enabled:Boolean(body?.enabled),message});}
  if(request.method==='GET'){
    const r=await env.ACCESS_DB.prepare('SELECT user_id,granted_by,created_at FROM full_admin_access ORDER BY created_at DESC').all();
    const grants=[];for(const row of r.results||[]){const profile=await discordProfile(row.user_id,env);const username=profile?.username||row.username||null;grants.push({...row,username,avatar:profile?.avatar||null});}
    return json({success:true,grants});
  }
  let body;try{body=await request.json()}catch{return json({success:false,error:'Ungültige Anfrage.'},400)}
  const userId=validUserId(body?.userId);if(!userId)return json({success:false,error:'Ungültige Discord User ID.'},400);
  const profile=await discordProfile(userId,env);const username=profile?.username||null;
  if(userId===String(auth.user.id))return json({success:false,error:'Deine Haupt-Admin-Rechte können hier nicht geändert werden.'},400);
  if(request.method==='POST'){
    await env.ACCESS_DB.batch([
      env.ACCESS_DB.prepare('INSERT INTO full_admin_access (user_id,granted_by,created_at,username) VALUES (?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by,created_at=CURRENT_TIMESTAMP,username=excluded.username').bind(userId,auth.user.id,username),
      env.ACCESS_DB.prepare('INSERT INTO database_access (user_id,granted_by,created_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by').bind(userId,auth.user.id),
      env.ACCESS_DB.prepare('INSERT INTO upload_access (user_id,granted_by,created_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by').bind(userId,auth.user.id)
    ]);
    const event={action:'PERMISSION_GRANT',discordAccount:auth.user.username||null,discordUserId:auth.user.id,targetDiscordUserId:userId,permission:'FULL_ADMIN_ACCESS',oldValue:'DENIED',newValue:'GRANTED',result:'SUCCESS'};ctx?.waitUntil?.(writeSetupAuditEvent(event,env).catch(()=>{}));return json({success:true,userId,fullAdmin:true});
  }
  if(request.method==='DELETE'){
    await env.ACCESS_DB.prepare('DELETE FROM full_admin_access WHERE user_id=?').bind(userId).run();
    const event={action:'PERMISSION_REVOKE',discordAccount:auth.user.username||null,discordUserId:auth.user.id,targetDiscordUserId:userId,permission:'FULL_ADMIN_ACCESS',oldValue:'GRANTED',newValue:'DENIED',result:'SUCCESS'};ctx?.waitUntil?.(writeSetupAuditEvent(event,env).catch(()=>{}));return json({success:true,userId,fullAdmin:false});
  }
  return json({success:false,error:'Methode nicht erlaubt.'},405);
}
