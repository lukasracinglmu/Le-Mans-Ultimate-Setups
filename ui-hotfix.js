import productionWorker from "./production-worker.js";

const HOTFIX_CSS = `
/* Production UI synchronization + access gate */
.brand-logo{display:block!important;visibility:visible!important;opacity:1!important;width:96px!important;height:48px!important;min-width:96px!important;object-fit:contain!important;position:relative!important;z-index:10!important}
.layout{display:flex!important;align-items:flex-start!important;width:100%!important;max-width:none!important}
.layout>main{flex:1 1 auto!important;min-width:0!important}
.upcoming-dock{display:flex!important;flex-direction:column!important;flex:0 0 auto!important;position:sticky!important;top:68px!important;align-self:flex-start!important;width:var(--upcoming-width,260px)!important;min-width:220px!important;max-width:min(460px,34vw)!important;height:calc(100vh - 68px)!important;margin:0!important;overflow:hidden!important;resize:none!important;border-radius:0!important;right:0!important}
.upcoming-dock .race-list{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important}
.upcoming-resize-handle{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:ew-resize;z-index:20;touch-action:none}
.upcoming-resize-handle:after{content:"";position:absolute;left:3px;top:0;bottom:0;width:2px;background:transparent;transition:background .15s}
.upcoming-resize-handle:hover:after,.upcoming-resize-handle.active:after{background:var(--accent)}
.car-mfr-filter{margin:0 0 14px}
.car-mfr-filter .mfr-btn[data-mfr="GO"].active{background:#8d2328!important;border-color:#ff5a5f!important;color:#fff!important}
.car-mfr-filter .mfr-btn[data-mfr="HYMO"].active{background:#6f1a90!important;border-color:#e879ff!important;color:#fff!important}
.car-mfr-filter .mfr-btn[data-mfr="beAlien"].active{background:#14532d!important;border-color:#4ade80!important;color:#fff!important}
.vendor-section{margin:26px 0 32px}
.vendor-section>.vendor-section-title{font-size:14px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;margin:0 0 10px;color:var(--muted)}
.vendor-section>.vendor-section-title.GO{color:#ff5a5f}.vendor-section>.vendor-section-title.HYMO{color:#e879ff}.vendor-section>.vendor-section-title.beAlien{color:#4ade80}
.vendor-section .setup-group{margin:18px 0 24px}
.vehicle-setup-count{position:relative;z-index:1;margin-top:8px;color:var(--muted);font-size:12px}
.database-access-state{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;margin:0 0 26px;box-shadow:var(--shadow)}
.database-access-state h2{margin:0 0 8px;font-size:24px}.database-access-state p{margin:0;color:var(--muted);line-height:1.55}.database-access-state .discord-button{display:inline-block;margin-top:16px;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700}
html:not([data-db-access="authorized"]) #homePage>.hero,
html:not([data-db-access="authorized"]) #mfrFilter,
html:not([data-db-access="authorized"]) #search,
html:not([data-db-access="authorized"]) #categories,
html:not([data-db-access="authorized"]) .request-section,
html:not([data-db-access="authorized"]) #carPage{display:none!important}
@media(max-width:800px){.layout{display:block!important}.brand-logo{width:72px!important;height:38px!important;min-width:72px!important}.upcoming-dock{position:relative!important;top:auto!important;width:calc(100% - 28px)!important;min-width:0!important;max-width:none!important;height:280px!important;margin:14px!important;resize:none!important;border-radius:12px!important}.upcoming-resize-handle{display:none!important}}
`;

const HOTFIX_JS = `<script>
(()=>{
  const manufacturers=[
    {src:'/assets/manufacturers/go-setups.webp',alt:'GO Setups'},
    {src:'/assets/manufacturers/hymo-setups.webp',alt:'HYMO Setups'},
    {src:'/assets/manufacturers/bealien.webp',alt:'beAlien Setups'}
  ];
  const vendors=['GO','HYMO','beAlien'];
  const widthKey='tpr-upcoming-width';
  const classify=(name)=>typeof classifyVendor==='function'?classifyVendor(name):(()=>{const n=String(name||'').toUpperCase();if(n.includes('HYMO'))return'HYMO';if(n.includes('BEALIEN')||n.includes('BE_ALIEN'))return'beAlien';if(n.includes(' GO')||n.includes('_GO')||/\\bGO\\b/.test(n))return'GO';return null;})();
  const currentMfr=()=>typeof activeMfr==='string'?activeMfr:(document.querySelector('#mfrFilter .mfr-btn.active')?.dataset.mfr||'');
  const clampWidth=(value)=>{const min=220;const viewport=document.documentElement.clientWidth||window.innerWidth;const max=Math.max(min,Math.min(460,Math.floor(viewport*0.34),Math.max(min,viewport-520)));return Math.max(min,Math.min(max,Math.round(value||260)));};

  const initResize=()=>{
    const panel=document.getElementById('upcoming');
    if(!panel||window.matchMedia('(max-width:800px)').matches)return;
    panel.classList.add('upcoming-dock');
    const apply=(w)=>{const width=clampWidth(w);panel.style.setProperty('--upcoming-width',width+'px');return width;};
    const saved=Number(localStorage.getItem(widthKey));apply(Number.isFinite(saved)&&saved?saved:panel.getBoundingClientRect().width||260);
    let handle=panel.querySelector('.upcoming-resize-handle');if(!handle){handle=document.createElement('div');handle.className='upcoming-resize-handle';handle.setAttribute('aria-hidden','true');panel.prepend(handle);}
    let startX=0,startWidth=0;
    const move=(e)=>{const next=apply(startWidth+(startX-e.clientX));localStorage.setItem(widthKey,String(next));};
    const up=(e)=>{handle.classList.remove('active');handle.releasePointerCapture?.(e.pointerId);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
    handle.addEventListener('pointerdown',(e)=>{e.preventDefault();startX=e.clientX;startWidth=panel.getBoundingClientRect().width;handle.classList.add('active');handle.setPointerCapture?.(e.pointerId);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);});
    window.addEventListener('resize',()=>apply(Number(localStorage.getItem(widthKey))||panel.getBoundingClientRect().width));
  };

  const initLogo=()=>{const logo=document.querySelector('.brand-logo');if(!logo)return;logo.src='/assets/header-logo.webp';logo.alt='Three Peaks Racing';logo.width=96;logo.height=48;logo.removeAttribute('hidden');logo.style.display='block';logo.style.visibility='visible';logo.style.opacity='1';logo.onerror=null;};
  const initManufacturerCarousel=()=>{
    const original=document.getElementById('manufacturerImage');if(!original)return;
    const img=original.cloneNode(false);original.replaceWith(img);
    ['manufacturerPrev','manufacturerNext'].forEach(id=>{const old=document.getElementById(id);if(old){const clean=old.cloneNode(false);old.replaceWith(clean);clean.remove();}});
    let index=0,timer=0,swapTimer=0;
    const show=(next)=>{index=(next+manufacturers.length)%manufacturers.length;const item=manufacturers[index];img.style.opacity='0';clearTimeout(swapTimer);swapTimer=setTimeout(()=>{img.src=item.src;img.alt=item.alt;img.style.opacity='1';},140);};
    show(0);timer=setInterval(()=>show(index+1),5000);window.addEventListener('pagehide',()=>{clearInterval(timer);clearTimeout(swapTimer);},{once:true});
  };

  const accessBox=()=>{
    let box=document.getElementById('databaseAccessState');
    if(!box){box=document.createElement('section');box.id='databaseAccessState';box.className='database-access-state';const main=document.querySelector('.layout>main');main?.prepend(box);}
    return box;
  };
  const showAccessState=(mode,user)=>{
    const box=accessBox();if(!box)return;
    document.documentElement.dataset.dbAccess=mode;
    if(mode==='authorized'){box.remove();return;}
    const login=document.getElementById('loginButton');
    if(mode==='checking'){box.innerHTML='<h2>Setup Database</h2><p>Zugriff wird geprüft…</p>';return;}
    if(mode==='login'){box.innerHTML='<h2>Setup Database</h2><p>Melde dich mit Discord an, um auf die Setup Database zuzugreifen.</p><a class="discord-button" href="/auth/discord">Mit Discord anmelden</a>';if(login)login.classList.remove('hidden');return;}
    box.innerHTML='<h2>Setup Database</h2><p>Du hast aktuell nicht die erforderliche Discord-Rolle für den Zugriff auf die Setup Database.</p>';
  };

  const syncCarFilter=()=>{
    if(document.documentElement.dataset.dbAccess!=='authorized')return;
    const carPage=document.getElementById('carPage');const trackSearch=document.getElementById('trackSearch');if(!carPage||!trackSearch)return;
    let holder=document.getElementById('carMfrFilter');if(!holder){holder=document.createElement('div');holder.id='carMfrFilter';holder.className='mfr-filter car-mfr-filter';holder.innerHTML='<button class="mfr-btn" data-mfr="">Alle</button><button class="mfr-btn" data-mfr="GO">GO</button><button class="mfr-btn" data-mfr="HYMO">HYMO</button><button class="mfr-btn" data-mfr="beAlien">beAlien</button>';trackSearch.before(holder);}
    const homeButtons=[...document.querySelectorAll('#mfrFilter .mfr-btn')];const carButtons=[...holder.querySelectorAll('.mfr-btn')];const paint=(value)=>carButtons.forEach(b=>b.classList.toggle('active',(b.dataset.mfr||'')===value));paint(currentMfr());
    carButtons.forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.addEventListener('click',()=>{const target=homeButtons.find(b=>(b.dataset.mfr||'')===(btn.dataset.mfr||''));if(target)target.click();paint(btn.dataset.mfr||'');});});
    homeButtons.forEach(btn=>{if(btn.dataset.carSync)return;btn.dataset.carSync='1';btn.addEventListener('click',()=>{paint(btn.dataset.mfr||'');refreshVehicleCounts();});});
  };

  const buildSetup=(s)=>{const el=document.createElement('div');el.className='setup';const info=document.createElement('div');info.className='setup-info';const name=document.createElement('div');name.className='setup-track';const vendor=classify(s.name);const tag=vendor?'<span class="vendor-tag '+vendor+'">'+vendor+'</span>':'';name.innerHTML=esc(s.name)+tag;const meta=document.createElement('div');meta.className='setup-meta';meta.textContent=[s.series,s.variant,'ZIP'].filter(Boolean).join(' · ');info.append(name,meta);const actions=document.createElement('div');actions.className='setup-actions';const dl=document.createElement('a');dl.className='download';dl.href=s.download;dl.download='';dl.textContent='Download';actions.appendChild(dl);if(currentUser?.canUpload){const del=document.createElement('button');del.className='delete-btn';del.style.display='flex';del.title='Setup löschen';del.setAttribute('aria-label','Setup löschen');del.textContent='🗑';del.addEventListener('click',()=>openDeleteModal(s.name));actions.appendChild(del);}el.append(info,actions);return el;};
  const renderVendorSetups=(setups)=>{const list=document.getElementById('setupList');if(!list||document.documentElement.dataset.dbAccess!=='authorized')return;list.innerHTML='';const mfr=currentMfr();const track=(typeof trackSearchVal==='string'?trackSearchVal:'').trim().toLowerCase();const filtered=setups.filter(s=>{const vendor=classify(s.name);if(mfr&&vendor!==mfr)return false;if(track&&!String(s.name||'').toLowerCase().includes(track))return false;return true;});if(!filtered.length){list.innerHTML='<div class="empty">'+(setups.length?'Keine Setups für diesen Filter.':'Noch keine Setups für dieses Fahrzeug verfügbar.')+'</div>';return;}const visibleVendors=mfr?[mfr]:vendors;for(const vendor of visibleVendors){const vendorItems=filtered.filter(s=>classify(s.name)===vendor);if(!vendorItems.length)continue;const section=document.createElement('section');section.className='vendor-section';const vendorTitle=document.createElement('div');vendorTitle.className='vendor-section-title '+vendor;vendorTitle.textContent=vendor;section.appendChild(vendorTitle);for(const [group,items] of groupSetups(vendorItems)){const wrap=document.createElement('section');wrap.className='setup-group';const title=document.createElement('div');title.className='setup-group-title';title.textContent=group;wrap.appendChild(title);items.forEach(s=>wrap.appendChild(buildSetup(s)));section.appendChild(wrap);}list.appendChild(section);}const unclassified=filtered.filter(s=>!classify(s.name));if(!mfr&&unclassified.length){for(const [group,items] of groupSetups(unclassified)){const wrap=document.createElement('section');wrap.className='setup-group';const title=document.createElement('div');title.className='setup-group-title';title.textContent=group;wrap.appendChild(title);items.forEach(s=>wrap.appendChild(buildSetup(s)));list.appendChild(wrap);}}};
  const countFor=(setups)=>{const mfr=currentMfr();return setups.filter(s=>!mfr||classify(s.name)===mfr).length;};
  let countRun=0;
  const refreshVehicleCounts=async()=>{if(document.documentElement.dataset.dbAccess!=='authorized'||typeof getCarSetups!=='function')return;const run=++countRun;const cards=[...document.querySelectorAll('#categories .vehicle')];let cursor=0;const worker=async()=>{while(cursor<cards.length){const card=cards[cursor++];if(run!==countRun)return;const vehicle=card.querySelector('.vehicle-name')?.textContent?.trim();const category=card.querySelector('.vehicle-class')?.textContent?.trim();if(!vehicle||!category)continue;let count=0;try{const key=setupCacheKey(category,vehicle);setupCache.delete(key);setupPending.delete(key);const data=await getCarSetups(category,vehicle);count=countFor(Array.isArray(data?.setups)?data.setups:[]);}catch{}if(run!==countRun)return;let label=card.querySelector('.vehicle-setup-count');if(!label){label=document.createElement('div');label.className='vehicle-setup-count';card.appendChild(label);}label.textContent='Verfügbare Setups: '+count;}};await Promise.all(Array.from({length:Math.min(4,cards.length)},worker));};
  window.refreshVehicleCounts=refreshVehicleCounts;

  const authorize=async()=>{
    showAccessState('checking');
    try{
      const r=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});const d=await r.json();
      if(!d.loggedIn){currentUser=null;showAccessState('login');return;}
      currentUser=d.user||null;
      const login=document.getElementById('loginButton');const account=document.getElementById('account');const accountName=document.getElementById('accountName');const accountAvatar=document.getElementById('accountAvatar');
      if(login)login.classList.add('hidden');if(account)account.style.display='flex';if(accountName)accountName.textContent=d.user?.username||'';if(accountAvatar&&d.user?.avatar){accountAvatar.src=d.user.avatar;accountAvatar.style.display='block';}
      if(!d.databaseAccess){showAccessState('forbidden',d.user);return;}
      showAccessState('authorized',d.user);
      if(typeof loadData==='function')await loadData();
      syncCarFilter();setTimeout(refreshVehicleCounts,0);
    }catch{showAccessState('login');}
  };

  const init=()=>{
    initLogo();initManufacturerCarousel();const layout=document.querySelector('.layout');const upcoming=document.getElementById('upcoming');const main=layout?.querySelector('main');if(layout&&upcoming&&main&&upcoming.previousElementSibling!==main)layout.appendChild(upcoming);initResize();
    window.renderSetups=renderVendorSetups;
    const originalShowCar=window.showCar;if(typeof originalShowCar==='function'&&!originalShowCar.__hotfixed){const wrapped=async function(...args){if(document.documentElement.dataset.dbAccess!=='authorized')return;const r=await originalShowCar.apply(this,args);syncCarFilter();renderVendorSetups(currentCarSetups);return r;};wrapped.__hotfixed=true;window.showCar=wrapped;}
    const categories=document.getElementById('categories');if(categories)new MutationObserver(()=>refreshVehicleCounts()).observe(categories,{childList:true,subtree:false});
    authorize();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>`;

function applyHotfix(html){
  let out=html;
  out=out.replace(/loadTheme\(\);initManufacturer\(\);checkLogin\(\);loadData\(\);/g,'loadTheme();');
  if(out.includes('</style>')) out=out.replace('</style>',HOTFIX_CSS+'\n</style>');
  else out=out.replace('</head>','<style>'+HOTFIX_CSS+'</style></head>');
  out=out.replace('</body>',HOTFIX_JS+'\n</body>');
  return out;
}

export default {
  async fetch(request, env, ctx){
    const response=await productionWorker.fetch(request,env,ctx);
    const url=new URL(request.url);const type=response.headers.get('content-type')||'';
    if(request.method!=='GET'||url.pathname!=='/'||!type.includes('text/html')) return response;
    const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.delete('Content-Length');
    return new Response(applyHotfix(await response.text()),{status:response.status,statusText:response.statusText,headers});
  }
};