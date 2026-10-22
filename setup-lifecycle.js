import { githubFailure } from './upload-storage.js';

export function setupManufacturer(name) {
  const n=String(name||'').toUpperCase();
  if(n.includes('HYMO'))return 'HYMO';
  if(n.includes('BEALIEN')||n.includes('BE_ALIEN'))return 'beAlien';
  if(n.includes(' GO')||n.includes('_GO')||/\bGO\b/.test(n))return 'GO';
  return null;
}
const validName=name=>typeof name==='string'&&name.length>0&&name.length<=180&&!/[\/\\\u0000-\u001f\u007f]/.test(name)&&!name.includes('..')&&/\.zip$/i.test(name);
export function readPreviousSetups(form, names) {
  const raw=form.get('previousSetups');
  if(raw===null||raw==='')return {action:'keep',targets:[]};
  if(typeof raw!=='string'||raw.length>40000)return {error:'Ungültige Auswahl alter Setups.'};
  let plan;try{plan=JSON.parse(raw);}catch{return {error:'Ungültige Auswahl alter Setups.'};}
  if(!['keep','outdate','replace'].includes(plan?.action)||!Array.isArray(plan.targets)||plan.targets.length>100)return {error:'Ungültige Auswahl alter Setups.'};
  if(plan.duplicateOf){
    const target=plan.duplicateOf;
    if(plan.action!=='keep'||names.length!==1||!validName(target.name)||!/^[a-f0-9]{40}$/.test(target.sha||'')||!setupManufacturer(names[0])||setupManufacturer(target.name)!==setupManufacturer(names[0]))return {error:'Ungültige identische Bestandsdatei.'};
    return {action:'keep',targets:[],duplicateOf:{name:target.name,sha:target.sha}};
  }
  if(plan.action==='keep'&&!plan.targets.length)return {action:'keep',targets:[]};
  // Each browser job contains exactly one new ZIP. Never accept cross-vendor cleanup.
  if(names.length!==1||!validName(names[0]))return {error:'Alte Setups bitte je neuer ZIP auswählen.'};
  const vendor=setupManufacturer(names[0]);
  if(!vendor||!plan.targets.length)return {error:'Hersteller oder Auswahl alter Setups fehlt.'};
  const seen=new Set();
  for(const target of plan.targets){
    if(!validName(target?.name)||!/^[a-f0-9]{40}$/.test(target?.sha||'')||seen.has(target.name)||setupManufacturer(target.name)!==vendor)return {error:'Nur ausgewählte Setups desselben Herstellers sind erlaubt.'};
    if(plan.action==='keep'&&target.name!==names[0])return {error:'Beim Behalten ist nur die gleichnamige bestehende Datei als Namenskonflikt erlaubt.'};
    seen.add(target.name);
  }
  return {action:plan.action,targets:plan.targets.map(({name,sha})=>({name,sha}))};
}
export function repoJsonRequest(env,path,options={}) {
  const owner=encodeURIComponent(env.GITHUB_OWNER||'lukasracinglmu'),repo=encodeURIComponent(env.GITHUB_REPO||'Le-Mans-Ultimate-Setups');
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`,{...options,signal:options.signal||AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github.object+json','User-Agent':'lmu-setups-worker','X-GitHub-Api-Version':'2022-11-28',...(env.GITHUB_TOKEN?{Authorization:`Bearer ${env.GITHUB_TOKEN}`} : {}),...options.headers}});
}
const filePath=(category,vehicle,name)=>'/contents/setups/'+[category,vehicle,name].map(encodeURIComponent).join('/');
async function inspect(githubRequest,path,branch){
  const response=await githubRequest(path+'?ref='+encodeURIComponent(branch),{headers:{Accept:'application/vnd.github.object+json','Cache-Control':'no-cache'}});
  const data=await response.json().catch(()=>({}));
  return {response,data};
}
const changed=()=>({success:false,status:409,error:'Die Datei wurde inzwischen geändert. Bitte die Liste neu laden und erneut auswählen.',retryable:false});
export async function deleteGithubSetup({category,vehicle,name,expectedSha,branch,githubRequest}) {
  const path=filePath(category,vehicle,name);
  let pinnedSha=expectedSha,attempted=false,lastFailure;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const {response,data}=await inspect(githubRequest,path,branch);
      if(response.status===404)return {success:true,deleted:attempted,alreadyDeleted:!attempted};
      if(!response.ok)return {success:false,status:502,...githubFailure(response,data)};
      if(!data.sha)return {success:false,status:502,error:'Ungültige GitHub-Antwort.',retryable:true};
      if(pinnedSha&&data.sha!==pinnedSha)return changed();
      pinnedSha=data.sha;attempted=true;
      const deletion=await githubRequest(path,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:`Delete setup: ${vehicle} - ${name}`,sha:pinnedSha,branch})});
      const result=await deletion.json().catch(()=>({}));
      if(deletion.ok)return {success:true,deleted:true};
      if(deletion.status!==409&&deletion.status!==422&&deletion.status<500)return {success:false,status:502,...githubFailure(deletion,result)};
      lastFailure={success:false,status:503,error:'Gleichzeitige GitHub-Änderung. Bitte erneut versuchen.',retryable:true};
    }catch{lastFailure={success:false,status:503,error:'Verbindung unterbrochen. Bitte erneut versuchen; der Löschstand wird geprüft.',retryable:true};}
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));
  }
  return lastFailure;
}

export async function applyPreviousSetups({plan,category,vehicle,replacement,env}) {
  if(plan.action==='keep')return {success:true,retired:[]};
  if(plan.action==='outdate'&&!env.ACCESS_DB)return {success:false,status:503,error:'Statusdatenbank nicht verfügbar. Neue ZIP wurde gespeichert, alte Dateien bleiben erhalten.',retryable:true};
  const githubRequest=(path,options)=>repoJsonRequest(env,path,options),branch=env.GITHUB_BRANCH||'main';
  try{
    // Confirm the new bytes before touching any selected old file.
    const current=await inspect(githubRequest,filePath(category,vehicle,replacement.name),branch);
    if(!current.response.ok||current.data.sha!==replacement.sha)return {success:false,status:503,error:'Neue ZIP noch nicht bestätigt. Alte Dateien bleiben erhalten.',retryable:true};
    const present=[];
    for(const target of plan.targets){
      if(target.name===replacement.name)continue; // Same-name PUT already replaced it with a SHA guard.
      const old=await inspect(githubRequest,filePath(category,vehicle,target.name),branch);
      if(old.response.status===404)continue;
      if(!old.response.ok)return {success:false,status:502,...githubFailure(old.response,old.data)};
      if(old.data.sha!==target.sha)return changed();
      present.push(target);
    }
    const retired=[];
    for(const target of present){
      if(plan.action==='replace'){
        const result=await deleteGithubSetup({category,vehicle,name:target.name,expectedSha:target.sha,branch,githubRequest});
        if(!result.success)return result;
        retired.push({...target,action:'delete'});
      }else{
        await env.ACCESS_DB.prepare('INSERT INTO setup_lifecycle (category, vehicle, file_name, file_sha, outdated, updated_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(category, vehicle, file_name) DO UPDATE SET file_sha = excluded.file_sha, outdated = 1, updated_at = CURRENT_TIMESTAMP').bind(category,vehicle,target.name,target.sha).run();
        retired.push({...target,action:'outdate'});
      }
    }
    return {success:true,retired};
  }catch{return {success:false,status:503,error:'Neue ZIP gespeichert. Alte Setups konnten noch nicht vollständig bearbeitet werden; erneuter Versuch folgt.',retryable:true};}
}
export async function enrichSetupLifecycle(setups,category,vehicle,env){
  if(!env.ACCESS_DB)return setups;
  try{
    const rows=await env.ACCESS_DB.prepare('SELECT file_name, file_sha, outdated FROM setup_lifecycle WHERE category = ? AND vehicle = ?').bind(category,vehicle).all();
    const states=new Map((rows.results||[]).map(row=>[row.file_name,row]));
    return setups.map(setup=>({...setup,outdated:states.get(setup.name)?.file_sha===setup.sha&&Number(states.get(setup.name)?.outdated)===1}));
  }catch{return setups;}
}
