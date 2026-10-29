/* @file-notes: Vollständige Repo-Sicherungen über GitHub Actions; Erfolg erst nach Prüfung des kopierten Git-Baums.
 * Cloudflare plant täglich 00:00 und 12:00 Europe/Berlin. Es werden keine Secrets in Backups geschrieben.
 */
const API='https://api.github.com';
const WORKFLOW='.github/workflows/daily-repository-backup.yml';
const ISSUER='https://token.actions.githubusercontent.com';
let keyCache={expires:0,keys:[]};
const sourceRepo=env=>(env.GITHUB_OWNER||'lukasracinglmu')+'/'+(env.GITHUB_REPO||'Le-Mans-Ultimate-Setups');
const targetRepo=env=>(env.BACKUP_GITHUB_OWNER||env.GITHUB_OWNER||'lukasracinglmu')+'/'+(env.BACKUP_GITHUB_REPO||'LMU-Database-Backups');
const branch=env=>env.GITHUB_BRANCH||'main';
const ownerId=env=>String(env.DISCORD_OWNER_USER_ID||'1033453785416208564');
const site=env=>new URL(env.SITE_URL||'https://le-mans-ultimate-setups.3peaks-database.workers.dev').origin;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const encPath=value=>String(value).split('/').map(encodeURIComponent).join('/');
function ghHeaders(token){return {Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'User-Agent':'lmu-repository-backup','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}}
async function gh(env,path,options={},destination=false){
  const token=destination?(env.BACKUP_GITHUB_TOKEN||env.GITHUB_TOKEN):env.GITHUB_TOKEN;
  if(!token)throw Error(destination?'Backup-GitHub-Token fehlt.':'GitHub-Token für das Website-Repository fehlt.');
  const r=await fetch(API+'/repos/'+(destination?targetRepo(env):sourceRepo(env))+path,{...options,headers:ghHeaders(token),redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!r.ok){await r.body?.cancel();throw Error('GitHub-Anfrage fehlgeschlagen (HTTP '+r.status+').')}
  return r.status===204?null:r.json();
}
async function ensure(env){
  if(!env.ACCESS_DB)throw Error('Backup-Datenbank nicht verfügbar.');
  await env.ACCESS_DB.prepare('CREATE TABLE IF NOT EXISTS repository_backup_jobs (id TEXT PRIMARY KEY, slot TEXT NOT NULL UNIQUE, tag TEXT NOT NULL, source_sha TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, validation_only INTEGER NOT NULL DEFAULT 0, backup_path TEXT, file_count INTEGER, size_bytes INTEGER, run_id TEXT, error TEXT, notified INTEGER NOT NULL DEFAULT 0)').run();
  await env.ACCESS_DB.prepare('CREATE TABLE IF NOT EXISTS automatic_backups (slot TEXT PRIMARY KEY, tag TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
}
export function backupTimeParts(now=new Date()){
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
}
export function isBackupSlot(now=new Date()){const p=backupTimeParts(now);return ['00','12'].includes(p.hour)&&p.minute==='00'}
function publicJob(job,env){
  return {id:job.id,tag:job.tag,status:job.status,error:job.error||null,createdAt:job.created_at,sourceSha:job.source_sha,
    viewUrl:job.backup_path?'https://github.com/'+targetRepo(env)+'/tree/'+encodeURIComponent(env.BACKUP_GITHUB_BRANCH||'main')+'/'+encPath(job.backup_path)+'/repository':null,
    downloadUrl:'https://github.com/'+targetRepo(env)+'/archive/refs/tags/'+encPath(job.tag)+'.zip',
    deleteAt:new Date(Date.parse(job.created_at)+14*86400000).toISOString(),size:job.size_bytes,fileCount:job.file_count,
    notificationDelivered:Boolean(job.notified),runUrl:job.run_id?'https://github.com/'+sourceRepo(env)+'/actions/runs/'+job.run_id:'https://github.com/'+sourceRepo(env)+'/actions/workflows/daily-repository-backup.yml',verified:job.status==='completed'&&!job.validation_only};
}
async function queueBackup(env,now,manual,validationOnly=false){
  if(!manual&&!isBackupSlot(now))return {skipped:true};
  await ensure(env);
  const p=backupTimeParts(now),tag='backup-'+p.year+'-'+p.day+'-'+p.month+'/'+p.hour+'-'+p.minute+'-'+p.second;
  const slot=validationOnly?'validation:'+crypto.randomUUID():manual?'manual:'+tag:'scheduled:'+p.year+'-'+p.month+'-'+p.day+':'+p.hour;
  const existing=await env.ACCESS_DB.prepare('SELECT * FROM repository_backup_jobs WHERE slot=?').bind(slot).first();
  if(existing&&existing.status!=='failed')return {success:true,queued:existing.status==='pending',...publicJob(existing,env)};
  const head=await gh(env,'/git/ref/heads/'+encPath(branch(env)));
  if(!/^[a-f0-9]{40}$/.test(head?.object?.sha||''))throw Error('GitHub-Quellstand konnte nicht bestimmt werden.');
  const id=crypto.randomUUID(),createdAt=now.toISOString(),backupPath='backups/'+p.year+'-'+p.month+'-'+p.day+'/'+p.hour+'-'+p.minute+'-'+p.second;
  await env.ACCESS_DB.prepare('INSERT INTO repository_backup_jobs (id,slot,tag,source_sha,created_at,status,validation_only,backup_path) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(slot) DO UPDATE SET id=excluded.id,tag=excluded.tag,source_sha=excluded.source_sha,created_at=excluded.created_at,status=excluded.status,validation_only=excluded.validation_only,backup_path=excluded.backup_path,error=NULL,notified=0,run_id=NULL').bind(id,slot,tag,head.object.sha,createdAt,'pending',validationOnly?1:0,backupPath).run();
  try{
    // repository_dispatch needs the existing Contents permission, not broader Actions access.
    await gh(env,'/dispatches',{method:'POST',body:JSON.stringify({event_type:'lmu-repository-backup',client_payload:{job_id:id,tag,source_sha:head.object.sha,created_at:createdAt,backup_repository:targetRepo(env),backup_branch:env.BACKUP_GITHUB_BRANCH||'main',backup_path:backupPath,callback_url:site(env)+'/api/internal/backups/complete',validation_only:validationOnly}})});
  }catch(error){
    await env.ACCESS_DB.prepare("UPDATE repository_backup_jobs SET status='failed',error=? WHERE id=?").bind(error.message,id).run();
    throw error;
  }
  return {success:true,queued:true,id,tag,status:'pending'};
}
export async function createScheduledBackup(env,now=new Date()){
  await ensure(env);
  const retry=await env.ACCESS_DB.prepare("SELECT * FROM repository_backup_jobs WHERE status='completed' AND notified=0 AND validation_only=0 ORDER BY created_at DESC LIMIT 3").all();
  for(const job of retry.results||[])if(await notifyOwner(job,env).catch(()=>false))await env.ACCESS_DB.prepare('UPDATE repository_backup_jobs SET notified=1 WHERE id=?').bind(job.id).run();
  return queueBackup(env,now,false);
}
export async function createManualBackup(env,now=new Date()){return queueBackup(env,now,true)}
export async function validateBackupConfiguration(env,now=new Date()){return queueBackup(env,now,true,true)}

function decode(value){const text=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(text,c=>c.charCodeAt(0))}
export async function verifyBackupIdentity(request,env,now=Date.now()){
  try{
    const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
    if(!token||token.length>16000)return null;
    const parts=token.split('.');if(parts.length!==3)return null;
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const expectedWorkflow=sourceRepo(env)+'/'+WORKFLOW+'@refs/heads/'+branch(env);
    if(header.alg!=='RS256'||!header.kid||claims.iss!==ISSUER||claims.aud!==site(env)||claims.repository!==sourceRepo(env)||claims.ref!=='refs/heads/'+branch(env)||claims.workflow_ref!==expectedWorkflow||!['repository_dispatch','workflow_dispatch'].includes(claims.event_name))return null;
    const seconds=Math.floor(now/1000);
    if(!Number.isFinite(claims.exp)||claims.exp<=seconds||!Number.isFinite(claims.nbf)||claims.nbf>seconds+30||!String(claims.run_id||'').match(/^\d+$/))return null;
    if(keyCache.expires<now||!keyCache.keys.some(k=>k.kid===header.kid)){
      const r=await fetch(ISSUER+'/.well-known/jwks',{redirect:'manual',signal:AbortSignal.timeout(10000)});
      if(!r.ok)return null;
      keyCache={expires:now+300000,keys:(await r.json()).keys||[]};
    }
    const jwk=keyCache.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]))?claims:null;
  }catch{return null}
}
async function verifySnapshot(job,env){
  const ref=await gh(env,'/git/ref/tags/'+encPath(job.tag),{},true);
  if(ref.object?.type!=='commit'||!/^[a-f0-9]{40}$/.test(ref.object?.sha||''))throw Error('Ungültiger Backup-Stand.');
  const [original,copied,manifestFile]=await Promise.all([
    gh(env,'/git/commits/'+job.source_sha),gh(env,'/git/commits/'+ref.object.sha,{},true),
    gh(env,'/contents/.backup.json?ref='+encodeURIComponent(job.tag),{},true)
  ]);
  const snapshotRoot=await gh(env,'/git/trees/'+copied.tree.sha,{},true);
  const repository=snapshotRoot.tree?.find(item=>item.path==='repository'&&item.type==='tree');
  if(repository?.sha!==original.tree?.sha)throw Error('Gesicherter Git-Baum stimmt nicht mit dem Quellstand überein.');
  const manifest=JSON.parse(new TextDecoder().decode(decode(String(manifestFile.content||'').replace(/\s/g,''))));
  if(manifest.source_sha!==job.source_sha||manifest.source_tree!==original.tree.sha||manifest.job_id!==job.id)throw Error('Backup-Manifest stimmt nicht mit dem Auftrag überein.');
  const mainManifest=await gh(env,'/contents/'+encPath(job.backup_path)+'/.backup.json?ref='+encodeURIComponent(env.BACKUP_GITHUB_BRANCH||'main'),{},true);
  const indexed=JSON.parse(new TextDecoder().decode(decode(String(mainManifest.content||'').replace(/\s/g,''))));
  if(indexed.source_sha!==manifest.source_sha||indexed.source_tree!==manifest.source_tree||indexed.job_id!==job.id)throw Error('Backup-Ordner auf main wurde noch nicht bestätigt.');
  const tree=await gh(env,'/git/trees/'+repository.sha+'?recursive=1',{},true);
  if(tree.truncated||!Array.isArray(tree.tree))throw Error('Backup-Dateiliste konnte nicht vollständig geprüft werden.');
  const files=tree.tree.filter(item=>item.type==='blob');
  if(files.length!==manifest.file_count||files.reduce((n,item)=>n+Number(item.size||0),0)!==manifest.size_bytes)throw Error('Backup-Dateizahl oder Größe stimmt nicht.');
  return {fileCount:files.length,size:manifest.size_bytes};
}
async function notifyOwner(job,env){
  if(!env.DISCORD_BOT_TOKEN)return false;
  const h={Authorization:'Bot '+env.DISCORD_BOT_TOKEN,'Content-Type':'application/json'};
  const channel=await fetch('https://discord.com/api/v10/users/@me/channels',{method:'POST',headers:h,body:JSON.stringify({recipient_id:ownerId(env)}),signal:AbortSignal.timeout(15000)});
  if(!channel.ok)return false;const dm=await channel.json(),links=publicJob(job,env);
  const size=job.size_bytes<1048576?(job.size_bytes/1024).toFixed(1)+' KB':(job.size_bytes/1048576).toFixed(2)+' MB';
  const response=await fetch('https://discord.com/api/v10/channels/'+dm.id+'/messages',{method:'POST',headers:h,signal:AbortSignal.timeout(15000),body:JSON.stringify({embeds:[{title:'Backup wurde erfolgreich erstellt',color:0x2b9b68,fields:[
    {name:'Datum und Uhrzeit',value:new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'medium'}).format(new Date(job.created_at)),inline:true},
    {name:'Größe',value:size+' · '+job.file_count+' Dateien',inline:true},
    {name:'Backup ansehen',value:'[Alle gesicherten Dateien ansehen]('+links.viewUrl+')'},
    {name:'Backup herunterladen',value:'[Vollständiges Repository als ZIP]('+links.downloadUrl+')'}
  ],footer:{text:'Three Peaks Racing Setup Database'}}],allowed_mentions:{parse:[]},nonce:job.id.replace(/-/g,'').slice(0,25),enforce_nonce:true})});
  return response.ok;
}
export async function backupCompletionApi(request,env){
  if(request.method!=='POST')return json({success:false,error:'Methode nicht erlaubt.'},405);
  if(Number(request.headers.get('Content-Length')||0)>8192)return json({success:false},413);
  const claims=await verifyBackupIdentity(request,env);if(!claims)return json({success:false,error:'Ungültige Workflow-Identität.'},401);
  let body;try{body=await request.json()}catch{return json({success:false},400)}
  if(!/^[a-f0-9-]{36}$/.test(body.job_id||''))return json({success:false},400);
  await ensure(env);
  const job=await env.ACCESS_DB.prepare('SELECT * FROM repository_backup_jobs WHERE id=?').bind(body.job_id).first();
  if(!job)return json({success:false,error:'Unbekannter Backup-Auftrag.'},404);
  if(job.run_id&&String(job.run_id)!==String(claims.run_id))return json({success:false},403);
  if(job.status==='completed'||job.status==='validated')return json({success:true,status:job.status});
  const runId=String(claims.run_id);
  if(body.success!==true){
    await env.ACCESS_DB.prepare("UPDATE repository_backup_jobs SET status='failed',run_id=?,error=? WHERE id=? AND status='pending'").bind(runId,'GitHub konnte das Repository nicht vollständig sichern. Workflow-Protokoll prüfen.',job.id).run();
    return json({success:true,status:'failed'});
  }
  if(job.validation_only){
    await env.ACCESS_DB.prepare("UPDATE repository_backup_jobs SET status='validated',run_id=? WHERE id=?").bind(runId,job.id).run();
    return json({success:true,status:'validated'});
  }
  try{
    const snapshot=await verifySnapshot(job,env);
    const changed=await env.ACCESS_DB.prepare("UPDATE repository_backup_jobs SET status='completed',file_count=?,size_bytes=?,run_id=?,error=NULL WHERE id=? AND status='pending'").bind(snapshot.fileCount,snapshot.size,runId,job.id).run();
    if(changed.meta?.changes===0)return json({success:true,status:'completed'});
    const completed={...job,status:'completed',file_count:snapshot.fileCount,size_bytes:snapshot.size,run_id:runId};
    const notified=await notifyOwner(completed,env).catch(()=>false);
    if(notified)await env.ACCESS_DB.prepare('UPDATE repository_backup_jobs SET notified=1 WHERE id=?').bind(job.id).run();
    return json({success:true,status:'completed',notificationDelivered:notified});
  }catch(error){
    await env.ACCESS_DB.prepare("UPDATE repository_backup_jobs SET status='failed',run_id=?,error=? WHERE id=?").bind(runId,String(error.message).slice(0,240),job.id).run();
    return json({success:false,error:'Die Vollständigkeitsprüfung des Backups ist fehlgeschlagen.'},409);
  }
}
export async function backupJobStatus(env,id){
  await ensure(env);
  const job=await env.ACCESS_DB.prepare('SELECT * FROM repository_backup_jobs WHERE id=?').bind(id).first();
  return job?publicJob(job,env):null;
}
export async function backupOverview(env){
  await ensure(env);
  const jobs=await env.ACCESS_DB.prepare('SELECT * FROM repository_backup_jobs WHERE validation_only=0 ORDER BY created_at DESC LIMIT 100').all();
  const legacy=await env.ACCESS_DB.prepare('SELECT tag,created_at FROM automatic_backups ORDER BY created_at DESC').all();
  const rows=(jobs.results||[]).map(job=>publicJob(job,env));
  const tags=new Set(rows.map(row=>row.tag));
  for(const row of legacy.results||[]){
    if(tags.has(row.tag))continue;
    const created=new Date(String(row.created_at).includes('T')?row.created_at:String(row.created_at).replace(' ','T')+'Z');
    if(Number.isNaN(created.getTime()))continue;
    rows.push({tag:row.tag,status:'legacy',verified:false,createdAt:created.toISOString(),deleteAt:new Date(created.getTime()+14*86400000).toISOString(),viewUrl:'https://github.com/'+targetRepo(env)+'/tree/'+encPath(row.tag),downloadUrl:'https://github.com/'+targetRepo(env)+'/archive/refs/tags/'+encPath(row.tag)+'.zip'});
  }
  rows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  return {success:true,backups:rows.filter(row=>Date.parse(row.deleteAt)>Date.now()),schedule:'Täglich um 00:00 und 12:00 Uhr (Europe/Berlin)',retentionDays:14};
}
