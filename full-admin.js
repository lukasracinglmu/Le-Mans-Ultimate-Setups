import { writeSetupAuditEvent } from "./audit-log.js";
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validUserId=v=>/^\d{16,22}$/.test(String(v||'').trim())?String(v).trim():null;

async function ensure(env){
  if(!env.ACCESS_DB)throw Error('db');
  await env.ACCESS_DB.prepare(`CREATE TABLE IF NOT EXISTS full_admin_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}
async function ownerOnly(request,env,ctx,productionWorker){
  const r=await productionWorker.fetch(new Request(new URL('/api/me',request.url),{headers:request.headers}),env,ctx);
  const me=await r.json().catch(()=>null);
  if(!me?.loggedIn)return {error:json({success:false,error:'Nicht angemeldet.'},401)};
  if(!me.user?.isOwner)return {error:json({success:false,error:'Nur der Haupt-Admin darf Full Admin Rechte verwalten.'},403)};
  return {user:me.user};
}
export async function fullAdminApi(request,env,ctx,productionWorker){
  const auth=await ownerOnly(request,env,ctx,productionWorker);if(auth.error)return auth.error;
  try{await ensure(env)}catch{return json({success:false,error:'Rechte-Datenbank nicht verfügbar.'},503)}
  if(request.method==='GET'){
    const r=await env.ACCESS_DB.prepare('SELECT user_id,granted_by,created_at FROM full_admin_access ORDER BY created_at DESC').all();
    return json({success:true,grants:r.results||[]});
  }
  let body;try{body=await request.json()}catch{return json({success:false,error:'Ungültige Anfrage.'},400)}
  const userId=validUserId(body?.userId);if(!userId)return json({success:false,error:'Ungültige Discord User ID.'},400);
  if(userId===String(auth.user.id))return json({success:false,error:'Deine Haupt-Admin-Rechte können hier nicht geändert werden.'},400);
  if(request.method==='POST'){
    await env.ACCESS_DB.batch([
      env.ACCESS_DB.prepare('INSERT INTO full_admin_access (user_id,granted_by,created_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by,created_at=CURRENT_TIMESTAMP').bind(userId,auth.user.id),
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
