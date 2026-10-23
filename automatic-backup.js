const GITHUB_API='https://api.github.com';

function headers(env){
  return {Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'lmu-automatic-backup','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${env.GITHUB_TOKEN}`};
}
function localBackupSlot(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const value=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const day=['Mon','Wed','Sat'].includes(value.weekday),hour=value.hour==='12'&&value.minute==='00';
  return day&&hour?value:null;
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
    const response=await fetch(`${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/trees/${sha}?recursive=1`,{headers:headers(env)});
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
  const downloadLink=`https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/archive/refs/tags/${tag}.zip`;
  const viewLink=`https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/tree/${tag}`;
  const embed={title:'Backup wurde erfolgreich erstellt',color:0x2b9b68,fields:[
    {name:'Datum und Uhrzeit',value:formatBackupDate(now),inline:true},
    {name:'Größe',value:formatBackupSize(size),inline:true},
    {name:'Backup ansehen',value:`[Dateien auf GitHub ansehen](${viewLink})`,inline:false},
    {name:'Backup herunterladen',value:`[ZIP herunterladen](${downloadLink})`,inline:false}
  ],footer:{text:'Three Peaks Racing Setup Database'}};
  await fetch(`https://discord.com/api/v10/channels/${data.id}/messages`,{method:'POST',headers,body:JSON.stringify({embeds:[embed]})});
}
function backupTagDate(tag){
  const match=String(tag||'').match(/^backup-(\d{4})-(\d{2})-(\d{2})(?:-|$)/);
  if(!match)return null;
  const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),23,59,59));
  return Number.isNaN(date.getTime())?null:date;
}
async function cleanupOldBackups(env,now=new Date()){
  if(!env.GITHUB_TOKEN||!env.GITHUB_OWNER||!env.GITHUB_REPO)return {deleted:0};
  const cutoff=now.getTime()-14*24*60*60*1000;
  const repo=`${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
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
      deleted++;
      if(env.ACCESS_DB)await env.ACCESS_DB.prepare('DELETE FROM automatic_backups WHERE tag=?').bind(tag).run().catch(()=>{});
    }
  }
  return {deleted};
}
async function createBackup(env,now=new Date(),force=false){
  const slot=localBackupSlot(now);
  if((!slot&&!force)||!env.GITHUB_TOKEN||!env.GITHUB_OWNER||!env.GITHUB_REPO)return {skipped:true};
  const backupDate=slot||Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
  const key=`${backupDate.year}-${backupDate.month}-${backupDate.day}`;
  if(env.ACCESS_DB){
    await env.ACCESS_DB.prepare('CREATE TABLE IF NOT EXISTS automatic_backups (slot TEXT PRIMARY KEY, tag TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
    if(!force&&await env.ACCESS_DB.prepare('SELECT slot FROM automatic_backups WHERE slot=?').bind(key).first())return {skipped:true,reason:'already-created'};
  }
  const repo=`${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const branch=await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/${env.GITHUB_BRANCH||'main'}`,{headers:headers(env)});
  if(!branch.ok)throw Error('GitHub main ref konnte nicht gelesen werden.');
  const branchData=await branch.json(),sha=branchData.object?.sha;
  if(!sha)throw Error('GitHub main SHA fehlt.');
  const tag=`backup-${key}${force?`-${Date.now()}`:''}`;
  const response=await fetch(`${GITHUB_API}/repos/${repo}/git/refs`,{method:'POST',headers:headers(env),body:JSON.stringify({ref:`refs/tags/${tag}`,sha})});
  if(!response.ok&&response.status!==422)throw Error('GitHub Backup konnte nicht erstellt werden.');
  if(env.ACCESS_DB)await env.ACCESS_DB.prepare('INSERT OR REPLACE INTO automatic_backups (slot,tag) VALUES (?,?)').bind(key,tag).run();
  const size=await backupSize(env,sha);
  await notifyOwner(env,tag,now,size).catch(()=>{});
  return {success:true,tag,sha};
}

export async function createScheduledBackup(env,now=new Date()){await cleanupOldBackups(env,now).catch(()=>{});return createBackup(env,now,false)}
export async function createManualBackup(env,now=new Date()){await cleanupOldBackups(env,now).catch(()=>{});return createBackup(env,now,true)}
