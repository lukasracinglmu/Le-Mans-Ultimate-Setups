export function readDisplayName(value){
  if(typeof value!=='string')return {error:'Ungültiger Anzeigename.'};
  const displayName=value.trim();
  if(displayName.length>160)return {error:'Anzeigename ist zu lang (maximal 160 Zeichen).'};
  if(/[\u0000-\u001f\u007f]/.test(displayName))return {error:'Ungültiger Anzeigename.'};
  return {displayName};
}
export function displayNameStatement(env,category,vehicle,name,sha,displayName){
  return env.ACCESS_DB.prepare('INSERT INTO setup_display_names (category, vehicle, file_name, file_sha, display_name, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(category, vehicle, file_name) DO UPDATE SET file_sha = excluded.file_sha, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP').bind(category,vehicle,name,sha,displayName);
}
export async function readStoredDisplayName(category,vehicle,name,sha,env){
  const row=await env.ACCESS_DB.prepare('SELECT display_name, file_sha FROM setup_display_names WHERE category = ? AND vehicle = ? AND file_name = ?').bind(category,vehicle,name).first();
  return row?.file_sha===sha?row.display_name||null:null;
}
export async function enrichDisplayNames(setups,category,vehicle,env){
  if(!env.ACCESS_DB)return setups;
  try{
    const result=await env.ACCESS_DB.prepare('SELECT file_name, file_sha, display_name FROM setup_display_names WHERE category = ? AND vehicle = ?').bind(category,vehicle).all();
    const rows=new Map((result.results||[]).map(row=>[row.file_name,row]));
    return setups.map(setup=>({...setup,displayName:rows.get(setup.name)?.file_sha===setup.sha?rows.get(setup.name)?.display_name||null:null}));
  }catch{return setups;}
}
