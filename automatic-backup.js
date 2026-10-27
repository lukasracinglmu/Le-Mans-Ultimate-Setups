/* @file-notes: Erstellt manuelle und geplante Backups, verwaltet Backup-Links und entfernt alte Backups. */
const GITHUB_API='https://api.github.com';

function backupOwner(env){return env.BACKUP_GITHUB_OWNER||env.GITHUB_OWNER||'lukasracinglmu';}
function backupRepoName(env){return env.BACKUP_GITHUB_REPO||'LMU-Database-Backups';}
function backupBranch(env){return env.BACKUP_GITHUB_BRANCH||'KNOWN_GOOD_ROLLBACK';}
function headers(env){
  return {Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'lmu-automatic-backup','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${env.GITHUB_TOKEN}`};
}
function localBackupSlot(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const value=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const hour=value.hour==='00'&&value.minute==='00';
  return hour?value:null;
}
function formatBackupSize(bytes){
  if(!Number.isFinite(bytes)||bytes<0)return 'Nicht verfügbar';
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(2)} MB`;
}
function formatBackupDate(now){
  return new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'medium'}).format(now);
}
async function backupSize(env,sha){
  try{
    const response=await fetch(`${GITHUB_API}/repos/${backupOwner(env)}/${backupRepoName(env)}/git/trees/${sha}?recursive=1`,{headers:headers(env)});
    if(!response.ok)return null;
    const data=await response.json();
    return (data.tree||[]).reduce((total,item)=>total+Number(item.type==='blob'?item.size||0:0),0);
  }catch{return null}
}
async function notifyOwner(env,tag,now,size){
  if(!env.DISCORD_BOT_TOKEN||!env.DISCORD_OWNER_USER_ID)return;
  const headers={Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json'};
  const channel=await fetch('https://discord.com/api/v10/users/@me/channels',{method:'POST',headers,body:JSON.stringify({recipient_id:String(env.DISCORD_OWNER_USER_ID)})});
  if(!channel.ok)return;
  const data=await channel.json();
  const downloadLink=`https://github.com/${backupOwner(env)}/${backupRepoName(env)}/archive/refs/tags/${tag}.zip`;
  const viewLink=`https://github.com/${backupOwner(env)}/${backupRepoName(env)}/tree/${tag}`;
  const embed={title:'Backup wurde erfolgreich erstellt',color:0x2b9b68,fields:[
    {name:'Datum und Uhrzeit',value:formatBackupDate(now),inline:true},
    {name:'Größe',value:formatBackupSize(size),inline:true},
    {name:'Backup ansehen',value:`[Dateien auf GitHub ansehen](${viewLink})`,inline:false},
    {name:'Backup herunterladen',value:`[ZIP herunterladen](${downloadLink})`,inline:false}
  ],footer:{text:'Three Peaks Racing Setup Database'}};
  await fetch(`https://discord.com/api/v10/channels/${data.id}/messages`,{method:'POST',headers,body:JSON.stringify({embeds:[embed]})});
}
async function backupIndexFile(env,tag){
  const match=String(tag).match(/^backup-(?:\\d{2}-\\d{2}-\\d{4}|\\d{4}-\\d{2}-\\d{2})/);
  const date=match?match[0].slice(7):'unknown-date';
  return `backups/${date}/${tag}.md`;
}
async function writeBackupIndex(env,tag,now){
  const repo=`${backupOwner(env)}/${backupRepoName(env)}`;
  const path=await backupIndexFile(env,tag);
  const text=`# LMU Backup

**Backup name:** \`${tag}\`
**Created:** \`${formatBackupDate(now)}\`

[Download this complete backup as ZIP](https://github.com/${repo}/archive/refs/tags/${tag}.zip)
`;
  const response=await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`,{method:'PUT',headers:headers(env),body:JSON.stringify({message:`Add backup ${tag} to index`,content:btoa(text),branch:backupBranch(env)})});
  if(!response.ok&&response.status!==422)throw Error('Backup-Übersicht konnte nicht aktualisiert werden.');
}
async function removeBackupIndex(env,tag){
  const repo=`${backupOwner(env)}/${backupRepoName(env)}`;
  const path=await backupIndexFile(env,tag);
  const current=await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(backupBranch(env))}`,{headers:headers(env)});
  if(!current.ok)return;
  const data=await current.json();
  await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`,{method:'DELETE',headers:headers(env),body:JSON.stringify({message:`Remove expired backup ${tag} from index`,sha:data.sha,branch:backupBranch(env)})});
}
function backupTagDate(tag){
  const current=String(tag||'').match(/^backup-(\\d{2})-(\\d{2})-(\\d{4})-(\\d{2})-(\\d{2})-(\\d{2})(?:-|$)/);
  if(current){const date=new Date(Date.UTC(Number(current[3]),Number(current[2])-1,Number(current[1]),Number(current[4]),Number(current[5]),Number(current[6])));return Number.isNaN(date.getTime())?null:date;}
  const legacy=String(tag||'').match(/^backup-(\\d{4})-(\\d{2})-(\\d{2})(?:-|$)/);
  if(!legacy)return null;
  const date=new Date(Date.UTC(Number(legacy[1]),Number(legacy[2])-1,Number(legacy[3]),23,59,59));
  return Number.isNaN(date.getTime())?null:date;
}
async function cleanupOldBackups(env,now=new Date()){
  if(!env.GITHUB_TOKEN||!backupOwner(env)||!backupRepoName(env))return {deleted:0};
  const cutoff=now.getTime()-5*24*60*60*1000;
  const repo=`${backupOwner(env)}/${backupRepoName(env)}`;
  const response=await fetch(`${GITHUB_API}/repos/${repo}/git/refs/tags?per_page=100`,{headers:headers(env)});
  if(!response.ok)return {deleted:0};
  const refs=await response.json();
  let deleted=0;
  for(const ref of Array.isArray(refs)?refs:[]){
    const tag=String(ref?.ref||'').replace(/^refs\/tags\//,'');
    const date=backupTagDate(tag);
    if(!tag.startsWith('backup-')||!date||date.getTime()>=cutoff)continue;
    const removed=await fetch(`${GITHUB_API}/repos/${repo}/git/refs/tags/${encodeURIComponent(tag)}`,{method:'DELETE',headers:headers(env)});
    if(removed.ok||removed.status===404){
      await removeBackupIndex(env,tag).catch(()=>{});
      deleted++;
      if(env.ACCESS_DB)await env.ACCESS_DB.prepare('DELETE FROM automatic_backups WHERE tag=?').bind(tag).run().catch(()=>{});
    }
  }
  return {deleted};
}
async function createBackup(env,now=new Date(),force=false){
  const slot=localBackupSlot(now);
  if((!slot&&!force)||!env.GITHUB_TOKEN||!backupOwner(env)||!backupRepoName(env))return {skipped:true};
  const backupDate=slot||Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
  const key=`${backupDate.year}-${backupDate.month}-${backupDate.day}`;
  if(env.ACCESS_DB){
    await env.ACCESS_DB.prepare('CREATE TABLE IF NOT EXISTS automatic_backups (slot TEXT PRIMARY KEY, tag TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
    if(!force&&await env.ACCESS_DB.prepare('SELECT slot FROM automatic_backups WHERE slot=?').bind(key).first())return {skipped:true,reason:'already-created'};
  }
  const repo=`${backupOwner(env)}/${backupRepoName(env)}`;
  const branch=await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/${backupBranch(env)}`,{headers:headers(env)});
  if(!branch.ok)throw Error('GitHub main ref konnte nicht gelesen werden.');
  const branchData=await branch.json(),sha=branchData.object?.sha;
  if(!sha)throw Error('GitHub main SHA fehlt.');
  const stamp=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const tag=`backup-${stamp.day}-${stamp.month}-${stamp.year}-${stamp.hour}-${stamp.minute}-${stamp.second}${force?`-${Date.now()}`:''}`;
  const response=await fetch(`${GITHUB_API}/repos/${repo}/git/refs`,{method:'POST',headers:headers(env),body:JSON.stringify({ref:`refs/tags/${tag}`,sha})});
  if(!response.ok&&response.status!==422)throw Error('GitHub Backup konnte nicht erstellt werden.');
  await writeBackupIndex(env,tag,now).catch(()=>{});
  if(env.ACCESS_DB)await env.ACCESS_DB.prepare('INSERT OR REPLACE INTO automatic_backups (slot,tag) VALUES (?,?)').bind(key,tag).run();
  const size=await backupSize(env,sha);
  await notifyOwner(env,tag,now,size).catch(()=>{});
  return {success:true,tag,sha};
}

export async function createScheduledBackup(env,now=new Date()){await cleanupOldBackups(env,now).catch(()=>{});return createBackup(env,now,false)}
export async function createManualBackup(env,now=new Date()){await cleanupOldBackups(env,now).catch(()=>{});return createBackup(env,now,true)}
