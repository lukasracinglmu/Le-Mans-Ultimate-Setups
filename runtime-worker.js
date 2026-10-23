import { submitBugReport } from "./bug-reports.js";
import { ticketApi, isTicketOwner } from "./bug-tickets.js";
import { fullAdminApi } from "./full-admin.js";
import productionWorker from "./access-worker.js";
import { readSiteFile } from "./repo-read.js";
import { writeSetupAuditEvent } from "./audit-log.js";

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/bug-report'&&request.method==='GET'){
      const me=await readMe(request,env,ctx);
      if(!hasSiteAccess(me))return new Response('Nicht gefunden.',{status:404,headers:{'Cache-Control':'private, no-store'}});
      return sitePage(request,env,'bug-report.html',true);
    }
    if(url.pathname==='/request'&&request.method==='GET'){
      const me=await readMe(request,env,ctx);
      if(!hasSiteAccess(me))return new Response('Nicht gefunden.',{status:404,headers:{'Cache-Control':'private, no-store'}});
      return sitePage(request,env,'request.html',true);
    }
    if(url.pathname==='/bug-tickets'&&request.method==='GET'){
      if(!await isTicketOwner(request,env,ctx,productionWorker))return new Response('Nicht gefunden.',{status:404,headers:{'Cache-Control':'private, no-store'}});
      return sitePage(request,env,'bug-tickets.html',true);
    }
    if(url.pathname==='/admin'&&request.method==='GET'){
      const me=await readMe(request,env,ctx);
      if(!me?.loggedIn||!me.user?.canManageDatabaseAccess)return new Response('Nicht gefunden.',{status:404,headers:{'Cache-Control':'private, no-store'}});
      return sitePage(request,env,'admin.html',true);
    }
    if(url.pathname==='/api/admin/full-admin')return fullAdminApi(request,env,ctx,productionWorker);
    if(url.pathname==='/api/bug-reports'){
      if(request.method!=='POST')return Response.json({success:false,error:'Methode nicht erlaubt.'},{status:405});
      const me=await readMe(request,env,ctx);
      if(!hasSiteAccess(me))return Response.json({success:false,error:'Keine Berechtigung.'},{status:403,headers:{'Cache-Control':'no-store'}});
      return submitBugReport(request,me.user,env);
    }
    if(url.pathname.startsWith('/api/admin/bug-tickets'))return ticketApi(request,env,ctx,productionWorker);
    if(request.method==='GET'&&url.pathname==='/setups.json'){
      const me=await readMe(request,env,ctx);
      if(!me?.loggedIn)return Response.json({success:false,error:'Nicht angemeldet.'},{status:401});
      if(!me?.databaseAccess)return Response.json({success:false,error:'Erforderliche Discord-Rolle fehlt.'},{status:403});
      const source=await readSiteFile(request,env,'setups.json');
      return new Response(source.body,{status:source.ok?200:502,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
    }
    const permissionChange=isPermissionChange(request.method,url.pathname);
    if(permissionChange){
      const bodyRequest=request.clone(),actor=await readMe(request,env,ctx);let targetUserId=null;
      try{targetUserId=String((await bodyRequest.json())?.userId||'').trim()||null}catch{}
      const response=await productionWorker.fetch(request,env,ctx);
      if(response.ok&&actor?.loggedIn&&actor?.user?.id&&targetUserId){let result=null;try{result=await response.clone().json()}catch{}if(result?.success){const task=writeSetupAuditEvent(permissionAuditEvent(request.method,url.pathname,actor.user,targetUserId),env).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(task)}}
      return response;
    }
    const response=await productionWorker.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/'&&response.headers.get('content-type')?.includes('text/html')){
      let html=await response.text();
      html=injectHomeLogo(html);
      html=injectRoleHeader(html);
      html=hideEmbeddedSections(html);
      const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Cache-Control','private, no-store');
      return new Response(html,{status:response.status,headers});
    }
    return response;
  },
  async queue(batch,env,ctx){for(const message of batch.messages){try{message.ack?.()}catch{message.retry?.({delaySeconds:10})}}}
};

async function readMe(request,env,ctx){const r=await productionWorker.fetch(new Request(new URL('/api/me',request.url),{headers:request.headers}),env,ctx);try{return await r.json()}catch{return null}}
function hasSiteAccess(me){return Boolean(me?.loggedIn&&me?.databaseAccess&&me?.user?.id)}
async function sitePage(request,env,file,privatePage){const source=await readSiteFile(request,env,file);const headers=new Headers(source.headers);headers.set('Content-Type',source.ok?'text/html; charset=utf-8':'text/plain; charset=utf-8');headers.set('Cache-Control',privatePage?'private, no-store':'no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");return new Response(source.body,{status:source.status,headers});}
function injectHomeLogo(html){const script=`<script>(()=>{const brand=document.querySelector('header .brand');if(!brand)return;brand.style.cursor='pointer';brand.setAttribute('role','link');brand.setAttribute('tabindex','0');brand.setAttribute('aria-label','Zur Startseite');const go=()=>{location.href='/'};brand.addEventListener('click',e=>{if(e.target.closest('a,button')&&e.target.closest('a,button')!==brand)return;go()});brand.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})})();</script>`;return html.replace('</body>',script+'</body>');}

function injectRoleHeader(html){
 const css=`<style>#roleHeaderActions{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:8px;z-index:60}#roleHeaderActions a{display:inline-flex;align-items:center;gap:7px;text-decoration:none;color:var(--text);border:1px solid var(--border);background:var(--surface);border-radius:8px;padding:9px 13px;font-size:13px;font-weight:800;white-space:nowrap}#roleHeaderActions a:hover{background:var(--surface2)}#roleHeaderActions svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}#roleHeaderActions .bug-action{background:#b91c1c;border-color:#ef4444;color:#fff}#roleHeaderActions .bug-action:hover{background:#dc2626}#roleHeaderActions .ticket-action.alert{background:#b91c1c;border-color:#ef4444;color:#fff;animation:ticketAlert 1.15s ease-in-out infinite}#privateTicketCount{display:inline-flex;min-width:20px;height:20px;align-items:center;justify-content:center;margin-left:1px;padding:0 6px;border-radius:999px;background:rgba(255,255,255,.18);font-size:11px}@keyframes ticketAlert{50%{box-shadow:0 0 0 6px rgba(239,68,68,.18);filter:brightness(1.22)}}@media(max-width:950px){#roleHeaderActions{position:static;transform:none;gap:5px}#roleHeaderActions a{padding:8px 9px;font-size:12px}}@media(max-width:700px){#roleHeaderActions .action-label{display:none}#roleHeaderActions a{gap:3px}}</style>`;
 const script=`<script>(()=>{const header=document.querySelector('header');if(!header)return;const icons={ticket:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',admin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',bug:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',request:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18v3h3l6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"/></svg>'};const group=document.createElement('nav');group.id='roleHeaderActions';group.setAttribute('aria-label','Schnellzugriff');header.appendChild(group);const add=(label,href,cls,icon)=>{const a=document.createElement('a');a.href=href;a.className=cls;a.innerHTML=icons[icon]+'<span class="action-label">'+label+'</span>';group.appendChild(a);return a};fetch('/api/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).then(me=>{if(!me?.loggedIn||!me?.databaseAccess)return;const user=me.user||{};if(user.canViewTickets){const t=add('Tickets','/bug-tickets','ticket-action','ticket'),count=document.createElement('span');count.id='privateTicketCount';count.textContent='0';t.appendChild(count);const refresh=async()=>{try{const r=await fetch('/api/admin/bug-tickets?status=open',{credentials:'same-origin',cache:'no-store'}),d=await r.json();if(!r.ok)return;const n=(d.tickets||[]).length;count.textContent=n;t.classList.toggle('alert',n>0)}catch{}};refresh();setInterval(refresh,30000)}if(user.canManageDatabaseAccess)add('Admin Panel','/admin','admin-action','admin');add('Setup Request','/request','request-action','request');add('Bug melden','/bug-report','bug-action','bug')}).catch(()=>{})})();</script>`;
 return html.replace('</head>',css+'</head>').replace('</body>',script+'</body>');
}

function hideEmbeddedSections(html){const css=`<style>body.no-database-access #mfrFilter,body.no-database-access #classFilter{display:none!important}</style>`;const script=`<script>(()=>{document.body.classList.add('no-database-access');const hide=()=>{document.querySelectorAll('#adminPanel,[id*="adminAccess"],.admin-panel,.request-section,#requestForm,#requestLoginRequired').forEach(el=>{const section=el.closest('.request-section')||el;section.classList.add('hidden')});const oldBug=[...document.querySelectorAll('button,a')].find(el=>/bug melden/i.test((el.textContent||'').trim())&&!el.closest('#roleHeaderActions'));if(oldBug)oldBug.classList.add('hidden')};hide();fetch('/api/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).then(me=>{if(me?.loggedIn&&me?.databaseAccess)document.body.classList.remove('no-database-access');else document.body.classList.add('no-database-access')}).catch(()=>document.body.classList.add('no-database-access'));new MutationObserver(hide).observe(document.body,{childList:true,subtree:true})})();</script>`;return html.replace('</head>',css+'</head>').replace('</body>',script+'</body>');}
function isPermissionChange(method,path){return(method==='POST'||method==='DELETE')&&(path==='/api/admin/database-access'||path==='/api/admin/upload-access'||path==='/api/admin/all-access')}
function permissionAuditEvent(method,path,actor,targetUserId){const grant=method==='POST',database=path==='/api/admin/database-access',permission=path==='/api/admin/all-access'?'DATABASE_AND_UPLOAD_DELETE_ACCESS':database?'DATABASE_ACCESS':'UPLOAD_DELETE_ACCESS';return{action:grant?'PERMISSION_GRANT':'PERMISSION_REVOKE',discordAccount:actor.username||null,discordUserId:actor.id,targetDiscordUserId:targetUserId,permission,oldValue:grant?'DENIED':'GRANTED',newValue:grant?'GRANTED':'DENIED',result:'SUCCESS'}}
