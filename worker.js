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
 if(html.includes('id="channelBox"'))return new Response(html,response);
 const injected=`
<div id="channelBox" style="display:none;margin:24px 0 20px;background:#fff;border:1px solid #d8d8d2;border-radius:7px;padding:16px;font-family:Arial,Helvetica,sans-serif">
 <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
  <div><div style="font-size:12px;color:#60605c;text-transform:uppercase;letter-spacing:1px;font-weight:800;margin-bottom:5px">Discord Setup-Request-Kanal</div><div id="channelName" style="font-size:17px;font-weight:800">#setup-request-test</div></div>
  <a id="channelLink" href="https://discord.com/channels/1367893409234161846/1557002876906377258" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;padding:8px 11px;border:1px solid #d8d8d2;border-radius:6px;background:#eeeeeb;text-decoration:none;font-size:12px;font-weight:700;color:#111">In Discord öffnen</a>
 </div>
 <div id="channelStatus" style="font-size:12px;color:#60605c;margin-top:8px">Der hinterlegte Kanal ist aktiv.</div>
</div>
<script>
(async function(){
 try{
  const me=await fetch("/api/me",{cache:"no-store"}).then(r=>r.json());
  const box=document.getElementById("channelBox");
  if(!box||!me.loggedIn)return;
  const r=await fetch("/api/channel",{cache:"no-store"});
  const d=await r.json();
  box.style.display="block";
  if(d.success){
   document.getElementById("channelName").textContent="#"+d.channel.name;
   document.getElementById("channelLink").href="https://discord.com/channels/1367893409234161846/"+encodeURIComponent(d.channel.id);
  }
 }catch(e){}
})();
</script>`;
 return new Response(html.replace("</body>",injected+"</body>"),response);
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
