const DISCORD_API='https://discord.com/api/v10';
export const TICKET_OWNER_ID='1033453785416208564';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validTicket=value=>Number.isInteger(Number(value))&&Number(value)>0;
export const ticketLabel=id=>'Ticket '+String(id).padStart(4,'0');

async function ensureSchema(env){
  if(!env.ACCESS_DB)throw Error('db');
  await env.ACCESS_DB.batch([
    env.ACCESS_DB.prepare(`CREATE TABLE IF NOT EXISTS bug_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id TEXT NOT NULL UNIQUE, reporter_id TEXT NOT NULL, reporter_name TEXT NOT NULL, description TEXT NOT NULL, image_key TEXT, image_type TEXT, status TEXT NOT NULL DEFAULT 'open', resolution TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TEXT, closed_by TEXT)`),
    env.ACCESS_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_bug_tickets_status_id ON bug_tickets(status,id DESC)`)
  ]);
}
async function owner(request,env,ctx,productionWorker){
  const meResponse=await productionWorker.fetch(new Request(new URL('/api/me',request.url),{headers:request.headers}),env,ctx);
  const me=await meResponse.json().catch(()=>null);
  if(!me?.loggedIn||!me.user?.id)return {error:json({success:false,error:'Nicht angemeldet.'},401)};
  if(String(me.user.id)!==TICKET_OWNER_ID)return {error:json({success:false,error:'Kein Zugriff.'},403)};
  return {user:me.user};
}
export async function isTicketOwner(request,env,ctx,productionWorker){const auth=await owner(request,env,ctx,productionWorker);return !auth.error;}
async function discord(path,env,options){return fetch(DISCORD_API+path,{...options,signal:AbortSignal.timeout(20000),headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN,...(options.headers||{})}});}
export async function createTicket({reportId,user,description,image},env){
  await ensureSchema(env);
  let imageKey=null,imageType=null;
  if(image&&env.UPLOADS_R2){imageKey='bug-tickets/'+crypto.randomUUID();imageType=image.type;await env.UPLOADS_R2.put(imageKey,await image.arrayBuffer(),{httpMetadata:{contentType:image.type}});}
  try{
    const row=await env.ACCESS_DB.prepare(`INSERT INTO bug_tickets (report_id,reporter_id,reporter_name,description,image_key,image_type) VALUES (?,?,?,?,?,?) RETURNING id`).bind(reportId,String(user.id),String(user.username||'Unbekannt').slice(0,100),description,imageKey,imageType).first();
    return {id:Number(row.id),label:ticketLabel(Number(row.id))};
  }catch(error){
    if(imageKey&&env.UPLOADS_R2)await env.UPLOADS_R2.delete(imageKey).catch(()=>{});
    const existing=await env.ACCESS_DB.prepare('SELECT id FROM bug_tickets WHERE report_id=?').bind(reportId).first();
    if(existing?.id)return {id:Number(existing.id),label:ticketLabel(Number(existing.id)),existing:true};
    throw error;
  }
}
export async function ticketApi(request,env,ctx,productionWorker){
  const auth=await owner(request,env,ctx,productionWorker);if(auth.error)return auth.error;
  try{await ensureSchema(env);}catch{return json({success:false,error:'Ticket-Datenbank nicht verfügbar.'},503);}
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/admin\/bug-tickets(?:\/(\d+)(?:\/(image|close))?)?$/);
  if(!match)return json({success:false,error:'Nicht gefunden.'},404);
  const id=match[1]?Number(match[1]):null,action=match[2]||null;
  if(request.method==='GET'&&!id){const status=url.searchParams.get('status');if(status&&!['open','closed'].includes(status))return json({success:false,error:'Ungültiger Status.'},400);const sql=status?`SELECT id,reporter_id,reporter_name,description,status,created_at,closed_at,resolution,image_key IS NOT NULL AS has_image FROM bug_tickets WHERE status=? ORDER BY id DESC LIMIT 250`:`SELECT id,reporter_id,reporter_name,description,status,created_at,closed_at,resolution,image_key IS NOT NULL AS has_image FROM bug_tickets ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,id DESC LIMIT 250`;const r=status?await env.ACCESS_DB.prepare(sql).bind(status).all():await env.ACCESS_DB.prepare(sql).all();return json({success:true,tickets:r.results||[]});}
  if(request.method==='GET'&&validTicket(id)&&!action){const row=await env.ACCESS_DB.prepare(`SELECT id,reporter_id,reporter_name,description,status,created_at,closed_at,resolution,image_key IS NOT NULL AS has_image FROM bug_tickets WHERE id=?`).bind(id).first();return row?json({success:true,ticket:row}):json({success:false,error:'Ticket nicht gefunden.'},404);}
  if(request.method==='GET'&&validTicket(id)&&action==='image'){const row=await env.ACCESS_DB.prepare('SELECT image_key,image_type FROM bug_tickets WHERE id=?').bind(id).first();if(!row?.image_key||!env.UPLOADS_R2)return new Response('Nicht gefunden',{status:404});const obj=await env.UPLOADS_R2.get(row.image_key);if(!obj)return new Response('Nicht gefunden',{status:404});return new Response(obj.body,{headers:{'Content-Type':row.image_type||'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
  if(request.method==='POST'&&validTicket(id)&&action==='close'){
    let body;try{body=await request.json();}catch{return json({success:false,error:'Ungültige Anfrage.'},400);}
    const resolution=String(body?.resolution||'').trim();if(resolution.length<3||resolution.length>2000)return json({success:false,error:'Bitte 3 bis 2000 Zeichen eingeben.'},400);
    const row=await env.ACCESS_DB.prepare('SELECT id,reporter_id,reporter_name,status FROM bug_tickets WHERE id=?').bind(id).first();if(!row)return json({success:false,error:'Ticket nicht gefunden.'},404);if(row.status==='closed')return json({success:false,error:'Ticket ist bereits geschlossen.'},409);
    if(!env.DISCORD_BOT_TOKEN)return json({success:false,error:'Discord Bot ist nicht verfügbar.'},503);
    const opened=await discord('/users/@me/channels',env,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipient_id:row.reporter_id})});const channel=await opened.json().catch(()=>({}));if(!opened.ok||!channel.id)return json({success:false,error:'Discord Nachricht konnte nicht zugestellt werden.'},502);
    const message={allowed_mentions:{parse:[]},embeds:[{title:ticketLabel(id)+' geschlossen',description:'Deine Bugmeldung wurde bearbeitet.',fields:[{name:'Nachricht',value:resolution}],footer:{text:'Three Peaks Racing Setup Database'},timestamp:new Date().toISOString()}]};
    const sent=await discord('/channels/'+channel.id+'/messages',env,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)});if(!sent.ok)return json({success:false,error:'Discord Nachricht konnte nicht zugestellt werden.'},502);
    await env.ACCESS_DB.prepare(`UPDATE bug_tickets SET status='closed',resolution=?,closed_at=CURRENT_TIMESTAMP,closed_by=? WHERE id=? AND status='open'`).bind(resolution,auth.user.id,id).run();
    return json({success:true,id,label:ticketLabel(id)});
  }
  return json({success:false,error:'Methode nicht erlaubt.'},405);
}
