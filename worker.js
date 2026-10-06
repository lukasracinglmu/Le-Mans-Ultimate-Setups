const DISCORD_API="https://discord.com/api/v10";
const DISCORD_OAUTH="https://discord.com/oauth2";
const SESSION_COOKIE="lmu_session";
const STATE_COOKIE="lmu_oauth_state";
const SESSION_TTL=604800;

export default {
 async fetch(request,env){
  try{
   const url=new URL(request.url);
   if(url.pathname==="/auth/discord")return discordLogin(env);
   if(url.pathname==="/auth/discord/callback")return discordCallback(request,env);
   if(url.pathname==="/auth/logout")return logout();
   if(url.pathname==="/api/me"&&request.method==="GET")return currentUser(request,env);
   if(url.pathname==="/api/channel"&&request.method==="GET")return channelInfo(request,env);
   if(url.pathname==="/api/discord/channels"&&request.method==="GET")return discordChannels(request,env);
   if(url.pathname==="/api/discord/messages"&&request.method==="GET")return discordMessages(request,env);
   if(url.pathname==="/api/discord/messages"&&request.method==="POST")return discordSendMessage(request,env);
   if(url.pathname==="/api/request"&&request.method==="POST")return createRequest(request,env);
   if(request.method==="GET"&&url.pathname==="/")return serveHome(request,env);
   return env.ASSETS.fetch(request);
  }catch(error){
   console.error("Worker error",error);
   return json({success:false,error:"Interner Serverfehler."},500);
  }
 }
};

function config(env){
 return !!(env.DISCORD_CLIENT_ID&&env.DISCORD_CLIENT_SECRET&&env.DISCORD_GUILD_ID&&env.DISCORD_BOT_TOKEN&&env.DISCORD_CHANNEL_ID&&env.SITE_URL&&env.SESSION_SECRET);
}
function redirectUri(env){return `${env.SITE_URL}/auth/discord/callback`}

function discordLogin(env){
 if(!env.DISCORD_CLIENT_ID||!env.SITE_URL)return json({success:false,error:"Discord Login ist derzeit nicht verfügbar."},500);
 const state=crypto.randomUUID();
 const p=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:"code",redirect_uri:redirectUri(env),scope:"identify",state});
 const h=new Headers({Location:`${DISCORD_OAUTH}/authorize?${p}`});
 h.append("Set-Cookie",cookie(STATE_COOKIE,state,600));
 return new Response(null,{status:302,headers:h});
}

async function discordCallback(request,env){
 const url=new URL(request.url);
 const code=url.searchParams.get("code"), returnedState=url.searchParams.get("state");
 if(url.searchParams.get("error"))return new Response("Discord-Anmeldung wurde abgebrochen.",{status:400});
 const cookies=parseCookies(request.headers.get("Cookie")||"");
 if(!code||!returnedState||cookies[STATE_COOKIE]!==returnedState)return new Response("Ungültige Anmeldung. Bitte erneut versuchen.",{status:400});
 if(!config(env))return new Response("Discord Login ist derzeit nicht korrekt konfiguriert.",{status:500});

 const token=await discordFetch("/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:redirectUri(env)})});
 if(!token.ok){console.error("Discord token error",token.status,await token.text());return new Response("Discord-Anmeldung fehlgeschlagen.",{status:502})}
 const tokenData=await token.json();
 const userResponse=await discordFetch("/users/@me",{headers:{Authorization:`Bearer ${tokenData.access_token}`}});
 if(!userResponse.ok){console.error("Discord user error",userResponse.status);return new Response("Discord-Anmeldung fehlgeschlagen.",{status:502})}
 const user=await userResponse.json();

 const session=await createSession({id:user.id,username:user.global_name||user.username,exp:Math.floor(Date.now()/1000)+SESSION_TTL},env.SESSION_SECRET);
 const h=new Headers({Location:"/"});
 h.append("Set-Cookie",cookie(SESSION_COOKIE,session,SESSION_TTL));
 h.append("Set-Cookie",cookie(STATE_COOKIE,"",0));
 return new Response(null,{status:302,headers:h});
}

async function currentUser(request,env){
 const s=await readSession(request,env.SESSION_SECRET);
 if(!s)return json({loggedIn:false});
 return json({loggedIn:true,user:{id:s.id,username:s.username}});
}

async function serveHome(request,env){
 const response=await env.ASSETS.fetch(request);
 const type=response.headers.get("content-type")||"";
 if(!type.includes("text/html"))return response;
 const html=await response.text();

 // The current GitHub frontend already contains the Discord client.
 // This fallback keeps the live Cloudflare asset compatible until the
 // static assets are redeployed.
 if(html.includes('id="discordClient"'))return new Response(html,response);

 const injection=String.raw`
<style>
main{width:min(1400px,calc(100% - 24px))!important;max-width:1400px!important;margin:0 auto!important;padding:10px 0 40px!important;display:grid!important;grid-template-columns:minmax(0,1fr) 360px!important;gap:14px!important;align-items:start!important}
main>.content{grid-column:1!important;grid-row:1!important;min-width:0;padding:40px 12px 40px}
main>.discord-area{grid-column:2!important;grid-row:1!important;width:360px!important;height:600px!important;min-height:600px!important;max-height:600px!important;background:#ed1c24;padding:4px;position:sticky;top:74px;margin:0;align-self:start;border:1px solid #111;z-index:5}
.discord-area{color:#dbdee1;font-family:Arial,Helvetica,sans-serif}
.discord-client{height:100%;background:#313338;display:flex;flex-direction:column;overflow:hidden}
.discord-topbar{height:52px;flex:0 0 52px;background:#2b2d31;border-bottom:1px solid #1f2023;display:flex;align-items:center;justify-content:space-between;padding:0 14px}
.discord-server-name{font-size:15px;font-weight:700;color:#f2f3f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.discord-online{font-size:11px;color:#949ba4}
.discord-body{flex:1;min-height:0;display:grid;grid-template-columns:125px minmax(0,1fr)}
.discord-channels{background:#2b2d31;overflow-y:auto;padding:12px 7px}
.discord-category{color:#949ba4;font-size:10px;font-weight:700;text-transform:uppercase;margin:12px 6px 5px}
.discord-category:first-child{margin-top:0}
.discord-channel{width:100%;border:0;background:transparent;color:#949ba4;padding:7px;border-radius:4px;text-align:left;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.discord-channel:hover{background:#35373c;color:#dbdee1}
.discord-channel.active{background:#404249;color:#fff}
.discord-channel.voice{cursor:default}
.discord-messages{min-width:0;min-height:0;display:flex;flex-direction:column;background:#313338}
.discord-channel-header{height:52px;flex:0 0 52px;display:flex;align-items:center;gap:8px;padding:0 15px;border-bottom:1px solid #26272b;color:#f2f3f5;font-weight:700;font-size:14px}
.discord-message-list{flex:1;overflow-y:auto;padding:12px 10px 8px}
.discord-message{display:flex;gap:8px;padding:6px 3px;border-radius:4px}
.discord-message:hover{background:rgba(0,0,0,.08)}
.discord-avatar{width:28px;height:28px;flex:0 0 28px;border-radius:50%;background:#5865f2;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.discord-message-content{min-width:0}
.discord-author{font-size:12px;font-weight:700;color:#fff}
.discord-time{margin-left:5px;color:#949ba4;font-size:9px;font-weight:400}
.discord-text{margin-top:2px;color:#dbdee1;font-size:12px;line-height:1.35;word-break:break-word;white-space:pre-wrap}
.discord-input{flex:0 0 auto;padding:9px;background:#313338}
.discord-input form{display:flex;gap:6px}
.discord-input input{min-width:0;flex:1;border:0;outline:0;border-radius:6px;background:#383a40;color:#dbdee1;padding:10px;font-size:12px}
.discord-input button{border:0;border-radius:6px;background:#5865f2;color:#fff;padding:0 10px;font-size:12px}
.discord-login{height:100%;display:flex;align-items:center;justify-content:center;padding:25px;text-align:center;background:#313338}
.discord-login h2{margin:0 0 8px;color:#fff;font-size:19px}
.discord-login p{color:#b5bac1;font-size:12px;line-height:1.45;margin:0 0 18px}
.discord-error,.discord-empty{color:#949ba4;font-size:12px;line-height:1.4;padding:20px 8px;text-align:center}
.discord-status{padding:6px 10px 0;color:#949ba4;font-size:10px}
#homePage .request-section{display:none!important}
@media(max-width:950px){main{grid-template-columns:1fr!important}main>.content{grid-column:1!important;grid-row:1!important}main>.discord-area{grid-column:1!important;grid-row:2!important;position:relative;top:auto;width:100%!important;height:600px;min-height:600px;max-height:600px;order:2}}
@media(max-width:650px){main{width:calc(100% - 20px)!important;padding:0 0 30px!important}main>.content{padding:40px 5px 10px}.discord-body{grid-template-columns:105px minmax(0,1fr)}.discord-channel{font-size:11px}}
</style>
<script>
(function(){
 const area=document.createElement("aside");
 area.className="discord-area";
 area.innerHTML=
 '<div id="discordLogin" class="discord-login"><div><h2>Discord</h2><p>Melde dich mit Discord an, um den Discord-Server direkt hier zu öffnen.</p><a href="/auth/discord" style="text-decoration:none"><button class="discord-button">Mit Discord anmelden</button></a></div></div>'+
 '<div id="discordClient" class="discord-client" style="display:none">'+
 '<div class="discord-topbar"><div><div class="discord-server-name">LMU Discord</div><div class="discord-online">Verbunden</div></div></div>'+
 '<div class="discord-body"><div id="discordChannels" class="discord-channels"><div class="discord-empty">Kanäle werden geladen...</div></div>'+
 '<div class="discord-messages"><div class="discord-channel-header"># <span id="discordCurrentChannel">Kanal auswählen</span></div>'+
 '<div id="discordMessageList" class="discord-message-list"><div class="discord-empty">Wähle links einen Kanal aus.</div></div>'+
 '<div class="discord-input"><form id="discordMessageForm"><input id="discordMessageInput" maxlength="2000" autocomplete="off" placeholder="Nachricht schreiben..."><button>Senden</button></form><div id="discordStatus" class="discord-status"></div></div></div></div></div>';
 const main=document.querySelector("main");
 if(main){
  const content=document.createElement("div");
  content.className="content";
  while(main.firstChild)content.appendChild(main.firstChild);
  main.appendChild(content);
  main.appendChild(area);
 }
 let channels=[],current=null;
 const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
 async function init(){
  try{
   const me=await fetch("/api/me",{cache:"no-store"}).then(r=>r.json());
   if(!me.loggedIn)return;
   document.getElementById("loginButton")?.classList.add("hidden");
   const account=document.getElementById("account");
   if(account)account.style.display="flex";
   const name=document.getElementById("accountName");
   if(name)name.textContent=me.user.username;
   document.getElementById("discordLogin").style.display="none";
   document.getElementById("discordClient").style.display="flex";
   const r=await fetch("/api/discord/channels",{cache:"no-store"});
   const d=await r.json();
   if(!d.success)throw new Error(d.error||"Discord-Kanäle konnten nicht geladen werden.");
   channels=d.channels||[];
   renderChannels();
   const first=channels.find(c=>[0,5,15].includes(c.type));
   if(first)selectChannel(first.id);
  }catch(e){document.getElementById("discordChannels").innerHTML='<div class="discord-error">'+esc(e.message)+'</div>';console.error(e)}
 }
 function renderChannels(){
  const box=document.getElementById("discordChannels");box.innerHTML="";
  const cats=new Map(channels.filter(c=>c.type===4).map(c=>[c.id,c.name]));
  const groups={};
  channels.filter(c=>c.type!==4).forEach(c=>(groups[c.parent_id||"__none"]??=[]).push(c));
  Object.keys(groups).forEach(key=>{
   const h=document.createElement("div");h.className="discord-category";h.textContent=key==="__none"?"Kanäle":(cats.get(key)||"Kanäle");box.appendChild(h);
   groups[key].sort((a,b)=>(a.position||0)-(b.position||0)).forEach(c=>{
    const b=document.createElement("button");b.className="discord-channel"+([2,13].includes(c.type)?" voice":"");b.textContent=([2,13].includes(c.type)?"🔊 ":"# ")+c.name;b.dataset.id=c.id;
    if([0,5,15].includes(c.type))b.onclick=()=>selectChannel(c.id);else b.title="Dieser Kanal unterstützt hier keine Nachrichten.";
    box.appendChild(b);
   });
  });
 }
 async function selectChannel(id){
  const c=channels.find(x=>x.id===id);if(!c||![0,5,15].includes(c.type))return;current=id;
  document.getElementById("discordCurrentChannel").textContent=c.name;
  document.querySelectorAll(".discord-channel").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
  await loadMessages(id);
 }
 async function loadMessages(id){
  const list=document.getElementById("discordMessageList");list.innerHTML='<div class="discord-empty">Nachrichten werden geladen...</div>';
  try{
   const r=await fetch("/api/discord/messages?channel="+encodeURIComponent(id),{cache:"no-store"}),d=await r.json();
   if(!d.success)throw new Error(d.error||"Nachrichten konnten nicht geladen werden.");
   list.innerHTML="";
   if(!d.messages.length){list.innerHTML='<div class="discord-empty">Noch keine Nachrichten in diesem Kanal.</div>';return}
   d.messages.forEach(m=>{
    const row=document.createElement("div");row.className="discord-message";
    row.innerHTML='<div class="discord-avatar">'+esc((m.author.name||"?").trim().charAt(0).toUpperCase())+'</div><div class="discord-message-content"><div class="discord-author">'+esc(m.author.name)+' <span class="discord-time">'+esc(m.timestamp?new Date(m.timestamp).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):"")+'</span></div><div class="discord-text">'+esc(m.content)+'</div></div>';
    list.appendChild(row);
   });
   list.scrollTop=list.scrollHeight;
   document.getElementById("discordStatus").textContent="Verbunden mit Discord.";
  }catch(e){list.innerHTML='<div class="discord-error">'+esc(e.message)+'</div>';console.error(e)}
 }
 document.addEventListener("submit",async e=>{
  if(e.target.id!=="discordMessageForm")return;e.preventDefault();
  const input=document.getElementById("discordMessageInput"),status=document.getElementById("discordStatus"),message=input.value.trim();
  if(!current||!message)return;input.disabled=true;status.textContent="Nachricht wird gesendet...";
  try{const r=await fetch("/api/discord/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channelId:current,message})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Nachricht konnte nicht gesendet werden.");input.value="";await loadMessages(current)}catch(e){status.textContent=e.message;console.error(e)}finally{input.disabled=false;input.focus()}
 });
 init();
})();
</script>`;
 return new Response(html.replace("</body>",injection+"</body>"),response);
}
async function channelInfo(request,env){
 const s=await readSession(request,env.SESSION_SECRET);
 if(!s)return json({success:false,error:"Nicht angemeldet."},401);
 if(!env.DISCORD_BOT_TOKEN||!env.DISCORD_CHANNEL_ID)return json({success:false,error:"Discord Channel ist nicht konfiguriert."},500);
 const r=await discordFetch(`/channels/${env.DISCORD_CHANNEL_ID}`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});
 if(!r.ok){console.error("Discord channel error",r.status,await r.text());return json({success:false,error:"Discord Channel konnte nicht geladen werden."},502)}
 const channel=await r.json();
 return json({success:true,channel:{id:channel.id,name:channel.name||"setup-request-test",type:channel.type}});
}

async function discordChannels(request,env){
 const s=await readSession(request,env.SESSION_SECRET);
 if(!s)return json({success:false,error:"Nicht angemeldet."},401);
 if(!env.DISCORD_BOT_TOKEN||!env.DISCORD_GUILD_ID)return json({success:false,error:"Discord Server ist nicht konfiguriert."},500);
 const r=await discordFetch(`/guilds/${env.DISCORD_GUILD_ID}/channels`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});
 if(!r.ok){console.error("Discord guild channels error",r.status,await r.text());return json({success:false,error:"Discord-Kanäle konnten nicht geladen werden."},502)}
 const channels=await r.json();
 const visible=channels
  .filter(c=>[0,2,5,10,11,12,13,15].includes(c.type))
  .sort((a,b)=>(a.position??0)-(b.position??0));
 return json({success:true,channels:visible.map(c=>({id:c.id,name:c.name,type:c.type,parent_id:c.parent_id,position:c.position}))});
}

async function discordMessages(request,env){
 const s=await readSession(request,env.SESSION_SECRET);
 if(!s)return json({success:false,error:"Nicht angemeldet."},401);
 if(!env.DISCORD_BOT_TOKEN)return json({success:false,error:"Discord Bot ist nicht konfiguriert."},500);
 const url=new URL(request.url);
 const channelId=url.searchParams.get("channel");
 if(!channelId||!/^[0-9]+$/.test(channelId))return json({success:false,error:"Ungültiger Kanal."},400);
 const r=await discordFetch(`/channels/${channelId}/messages?limit=50`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});
 if(!r.ok){console.error("Discord messages error",r.status,await r.text());return json({success:false,error:"Nachrichten konnten nicht geladen werden."},502)}
 const messages=await r.json();
 return json({success:true,messages:messages.reverse().map(m=>({id:m.id,content:m.content||"",author:{id:m.author?.id||"",name:m.author?.global_name||m.author?.username||"Unbekannt",avatar:m.author?.avatar||null},timestamp:m.timestamp,attachments:(m.attachments||[]).map(a=>({url:a.url,name:a.filename}))}))});
}

async function discordSendMessage(request,env){
 const s=await readSession(request,env.SESSION_SECRET);
 if(!s)return json({success:false,error:"Nicht angemeldet."},401);
 if(!env.DISCORD_BOT_TOKEN)return json({success:false,error:"Discord Bot ist nicht konfiguriert."},500);
 let body;try{body=await request.json()}catch{return json({success:false,error:"Ungültige Anfrage."},400)}
 const channelId=String(body.channelId||"");
 const message=clean(body.message,2000);
 if(!/^[0-9]+$/.test(channelId)||!message)return json({success:false,error:"Kanal und Nachricht sind erforderlich."},400);
 const r=await discordFetch(`/channels/${channelId}/messages`,{method:"POST",headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({content:message,allowed_mentions:{parse:[]}})});
 if(!r.ok){console.error("Discord send error",r.status,await r.text());return json({success:false,error:"Nachricht konnte nicht gesendet werden."},502)}
 const m=await r.json();
 return json({success:true,message:{id:m.id,content:m.content||message,author:{id:m.author?.id||"",name:m.author?.global_name||m.author?.username||s.username,avatar:m.author?.avatar||null},timestamp:m.timestamp}});
}

async function createRequest(request,env){
 const origin=request.headers.get("Origin");
 if(origin&&env.SITE_URL&&origin!==env.SITE_URL)return json({success:false,error:"Ungültige Anfrage."},403);
 const s=await readSession(request,env.SESSION_SECRET);
 if(!s)return json({success:false,error:"Nicht angemeldet."},401);
 let body;try{body=await request.json()}catch{return json({success:false,error:"Ungültige Anfrage."},400)}
 const vehicle=clean(body.vehicle,100),track=clean(body.track,100),message=clean(body.message,1000);
 if(!vehicle||!track)return json({success:false,error:"Fahrzeug und Strecke sind erforderlich."},400);
 const content=[
  "## Setup Request",
  "",
  `**User:** ${s.username}`,
  `**Discord ID:** ${s.id}`,
  "",
  `**Fahrzeug:** ${vehicle}`,
  `**Strecke:** ${track}`,
  message?`**Nachricht:**\\n${message}`:""
 ].filter(Boolean).join("\n");
 const r=await discordFetch(`/channels/${env.DISCORD_CHANNEL_ID}/messages`,{method:"POST",headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({content,allowed_mentions:{parse:[]}})});
 if(!r.ok){console.error("Discord request error",r.status,await r.text());return json({success:false,error:"Request konnte nicht gesendet werden."},502)}
 return json({success:true});
}

async function discordFetch(path,options={}){return fetch(DISCORD_API+path,options)}
function clean(v,max){return String(v??"").replace(/[\u0000-\u001F\u007F]/g,"").trim().slice(0,max)}

async function createSession(data,secret){
 const payload=b64(JSON.stringify(data)),sig=await sign(payload,secret);return payload+"."+sig;
}
async function readSession(request,secret){
 if(!secret)return null;
 const c=parseCookies(request.headers.get("Cookie")||""),raw=c[SESSION_COOKIE];if(!raw)return null;
 const [payload,sig]=raw.split(".");if(!payload||!sig||!(await verify(payload,sig,secret)))return null;
 try{const d=JSON.parse(unb64(payload));if(d.exp&&d.exp<Math.floor(Date.now()/1000))return null;return d}catch{return null}
}
async function sign(value,secret){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))));
}
async function verify(value,sig,secret){const expected=await sign(value,secret);return expected.length===sig.length&&timingSafe(expected,sig)}
function timingSafe(a,b){let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
function b64(input){const bytes=typeof input==="string"?new TextEncoder().encode(input):input;let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function unb64(input){const s=input.replace(/-/g,"+").replace(/_/g,"/").padEnd(input.length+(4-input.length%4)%4,"=");const bin=atob(s);return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)))}
function parseCookies(header){const out={};for(const p of header.split(";")){const i=p.indexOf("=");if(i>0)out[p.slice(0,i).trim()]=p.slice(i+1).trim()}return out}
function cookie(name,value,maxAge){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
function logout(){const h=new Headers({Location:"/"});h.append("Set-Cookie",cookie(SESSION_COOKIE,"",0));h.append("Set-Cookie",cookie(STATE_COOKIE,"",0));return new Response(null,{status:302,headers:h})}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
