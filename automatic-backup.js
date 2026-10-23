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
export async function createScheduledBackup(env,now=new Date()){
  const slot=localBackupSlot(now);
  if(!slot||!env.GITHUB_TOKEN||!env.GITHUB_OWNER||!env.GITHUB_REPO)return {skipped:true};
  const key=`${slot.year}-${slot.month}-${slot.day}`;
  if(env.ACCESS_DB){
    await env.ACCESS_DB.prepare('CREATE TABLE IF NOT EXISTS automatic_backups (slot TEXT PRIMARY KEY, tag TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
    if(await env.ACCESS_DB.prepare('SELECT slot FROM automatic_backups WHERE slot=?').bind(key).first())return {skipped:true,reason:'already-created'};
  }
  const repo=`${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const branch=await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/${env.GITHUB_BRANCH||'main'}`,{headers:headers(env)});
  if(!branch.ok)throw Error('GitHub main ref konnte nicht gelesen werden.');
  const branchData=await branch.json(),sha=branchData.object?.sha;
  if(!sha)throw Error('GitHub main SHA fehlt.');
  const tag=`backup-${key}`;
  const response=await fetch(`${GITHUB_API}/repos/${repo}/git/refs`,{method:'POST',headers:headers(env),body:JSON.stringify({ref:`refs/tags/${tag}`,sha})});
  if(!response.ok&&response.status!==422)throw Error('GitHub Backup konnte nicht erstellt werden.');
  if(env.ACCESS_DB)await env.ACCESS_DB.prepare('INSERT OR REPLACE INTO automatic_backups (slot,tag) VALUES (?,?)').bind(key,tag).run();
  return {success:true,tag,sha};
}
