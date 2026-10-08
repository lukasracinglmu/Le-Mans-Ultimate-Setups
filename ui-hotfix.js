import productionWorker from "./production-worker.js";

const HOTFIX_CSS = `
/* Production UI synchronization hotfix */
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
.vendor-section-title{font-size:15px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid var(--border)}
.vendor-section-title.GO{color:#ff5a5f}.vendor-section-title.HYMO{color:#e879ff}.vendor-section-title.beAlien{color:#4ade80}
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
  const classify=(name)=>{const n=String(name||'').toUpperCase();if(n.includes('HYMO'))return'HYMO';if(n.includes('BEALIEN')||n.includes('BE_ALIEN'))return'beAlien';if(n.includes(' GO')||n.includes('_GO')||/\\bGO\\b/.test(n))return'GO';return null;};
  const escHtml=(v)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const clampWidth=(value)=>{const min=220;const viewport=document.documentElement.clientWidth||window.innerWidth;const max=Math.max(min,Math.min(460,Math.floor(viewport*0.34),Math.max(min,viewport-520)));return Math.max(min,Math.min(max,Math.round(value||260)));};

  const initResize=()=>{
    const panel=document.getElementById('upcoming');
    if(!panel||window.matchMedia('(max-width:800px)').matches)return;
    panel.classList.add('upcoming-dock');
    let saved=Number(localStorage.getItem(widthKey));
    const apply=(w)=>{const width=clampWidth(w);panel.style.setProperty('--upcoming-width',width+'px');return width;};
    apply(Number.isFinite(saved)&&saved?saved:panel.getBoundingClientRect().width||260);
    let handle=panel.querySelector('.upcoming-resize-handle');
    if(!handle){handle=document.createElement('div');handle.className='upcoming-resize-handle';handle.setAttribute('aria-hidden','true');panel.prepend(handle);}
    let startX=0,startWidth=0;
    const move=(e)=>{const next=apply(startWidth+(startX-e.clientX));localStorage.setItem(widthKey,String(next));};
    const up=(e)=>{handle.classList.remove('active');handle.releasePointerCapture?.(e.pointerId);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
    handle.addEventListener('pointerdown',(e)=>{e.preventDefault();startX=e.clientX;startWidth=panel.getBoundingClientRect().width;handle.classList.add('active');handle.setPointerCapture?.(e.pointerId);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);});
    window.addEventListener('resize',()=>apply(Number(localStorage.getItem(widthKey))||panel.getBoundingClientRect().width));
  };

  const syncCarFilter=()=>{
    const carPage=document.getElementById('carPage');
    const trackSearch=document.getElementById('trackSearch');
    if(!carPage||!trackSearch)return;
    let holder=document.getElementById('carMfrFilter');
    if(!holder){holder=document.createElement('div');holder.id='carMfrFilter';holder.className='mfr-filter car-mfr-filter';holder.innerHTML='<button class="mfr-btn" data-mfr="">Alle</button><button class="mfr-btn" data-mfr="GO">GO</button><button class="mfr-btn" data-mfr="HYMO">HYMO</button><button class="mfr-btn" data-mfr="beAlien">beAlien</button>';trackSearch.before(holder);}
    const homeButtons=[...document.querySelectorAll('#mfrFilter .mfr-btn')];
    const carButtons=[...holder.querySelectorAll('.mfr-btn')];
    const activeValue=()=>homeButtons.find(b=>b.classList.contains('active'))?.dataset.mfr||'';
    const paint=(value)=>{carButtons.forEach(b=>b.classList.toggle('active',(b.dataset.mfr||'')===value));};
    paint(activeValue());
    carButtons.forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.addEventListener('click',()=>{const target=homeButtons.find(b=>(b.dataset.mfr||'')===(btn.dataset.mfr||''));if(target)target.click();paint(btn.dataset.mfr||'');});});
    homeButtons.forEach(btn=>{if(btn.dataset.carSync)return;btn.dataset.carSync='1';btn.addEventListener('click',()=>paint(btn.dataset.mfr||''));});
  };

  const enhanceVendorSections=()=>{
    const list=document.getElementById('setupList');
    if(!list)return;
    const apply=()=>{
      const setups=[...list.querySelectorAll(':scope > .setup-group')];
      if(!setups.length)return;
      const allActive=(document.querySelector('#mfrFilter .mfr-btn.active')?.dataset.mfr||'')==='';
      if(!allActive){list.querySelectorAll('.vendor-section-title').forEach(x=>x.remove());return;}
      setups.forEach(group=>{
        if(group.querySelector('.vendor-section-title'))return;
        const tags=[...group.querySelectorAll('.vendor-tag')].map(x=>x.textContent.trim()).filter(Boolean);
        const unique=[...new Set(tags)];
        if(unique.length===1){const v=unique[0];const t=document.createElement('div');t.className='vendor-section-title '+v;t.textContent=v;group.prepend(t);}
      });
    };
    new MutationObserver(apply).observe(list,{childList:true,subtree:true});
    apply();
  };

  const init=()=>{
    const logo=document.querySelector('.brand-logo');
    if(logo){logo.src='/assets/three-peaks-racing-logo.webp';logo.alt='Three Peaks Racing';logo.style.display='block';logo.onerror=()=>{logo.onerror=null;logo.src='/assets/header-logo.webp';};}
    const img=document.getElementById('manufacturerImage');
    const prev=document.getElementById('manufacturerPrev');
    const next=document.getElementById('manufacturerNext');
    if(img){let index=0,timer=null;const show=(value)=>{index=(value+manufacturers.length)%manufacturers.length;const item=manufacturers[index];img.src=item.src;img.alt=item.alt;img.style.opacity='1';};const restart=()=>{if(timer)clearInterval(timer);timer=setInterval(()=>show(index+1),5000);};show(0);restart();if(prev)prev.onclick=()=>{show(index-1);restart();};if(next)next.onclick=()=>{show(index+1);restart();};}
    const layout=document.querySelector('.layout');const upcoming=document.getElementById('upcoming');const main=layout?.querySelector('main');if(layout&&upcoming&&main&&upcoming.previousElementSibling!==main)layout.appendChild(upcoming);
    initResize();syncCarFilter();enhanceVendorSections();
    const originalShowCar=window.showCar;if(typeof originalShowCar==='function'&&!originalShowCar.__hotfixed){const wrapped=async function(...args){const r=await originalShowCar.apply(this,args);syncCarFilter();return r;};wrapped.__hotfixed=true;window.showCar=wrapped;}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>`;

function applyHotfix(html){
  let out=html;
  if(out.includes('</style>')) out=out.replace('</style>',HOTFIX_CSS+'\n</style>');
  else out=out.replace('</head>','<style>'+HOTFIX_CSS+'</style></head>');
  out=out.replace('</body>',HOTFIX_JS+'\n</body>');
  return out;
}

export default {
  async fetch(request, env, ctx){
    const response=await productionWorker.fetch(request,env,ctx);
    const url=new URL(request.url);
    const type=response.headers.get('content-type')||'';
    if(request.method!=='GET'||url.pathname!=='/'||!type.includes('text/html')) return response;
    const headers=new Headers(response.headers);
    headers.set('Cache-Control','no-store');
    headers.delete('Content-Length');
    return new Response(applyHotfix(await response.text()),{status:response.status,statusText:response.statusText,headers});
  }
};