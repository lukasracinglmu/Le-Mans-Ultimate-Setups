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
async function notifyOwner(env,tag){
  if(!env.DISCORD_BOT_TOKEN||!env.DISCORD_OWNER_USER_ID)return;
  const headers={Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json'};
  const channel=await fetch('https://discord.com/api/v10/users/@me/channels',{method:'POST',headers,body:JSON.stringify({recipient_id:String(env.DISCORD_OWNER_USER_ID)})});
  if(!channel.ok)return;
  const data=await channel.json();
  const link=`https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/tree/${tag}`;
  await fetch(`https://discord.com/api/v10/channels/${data.id}/messages`,{method:'POST',headers,body:JSON.stringify({content:`✅ Backup erfolgreich erstellt.\n\n${link}`})});
}
async function createBackup(env,now=new Date(),force=false){
  const slot=localBackupSlot(now);
  if((!slot&&!force)||!env.GITHUB_TOKEN||!env.GITHUB_OWNER||!env.GITHUB_REPO)return {skipped:true};
  const backupDate=slot||Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
  const key=`${backupDate.year}-${backupDate.month}-${backupDate.day}`;
  if(env.ACCESS_DB){
    await env.ACCESS_DB.prepare('CREATE TABLE IF NOT EXISTS automatic_backups (slot TEXT PRIMARY KEY, tag TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
    if(await env.ACCESS_DB.prepare('SELECT slot FROM automatic_backups WHERE slot=?').bind(key).first())return {skipped:true,reason:'already-created'};
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
  await notifyOwner(env,tag).catch(()=>{});
  return {success:true,tag,sha};
}

export async function createScheduledBackup(env,now=new Date()){return createBackup(env,now,false)}
export async function createManualBackup(env,now=new Date()){return createBackup(env,now,true)}
