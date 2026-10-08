import productionWorker from "./production-worker.js";

const HOTFIX_CSS = `
/* Production UI synchronization hotfix */
.brand-logo{display:block!important;visibility:visible!important;opacity:1!important;width:96px!important;height:48px!important;min-width:96px!important;object-fit:contain!important;position:relative!important;z-index:10!important}
.layout{display:flex!important;align-items:flex-start!important;width:100%!important;max-width:none!important}
.layout>main{flex:1 1 auto!important;min-width:0!important}
.upcoming-dock{display:flex!important;flex-direction:column!important;flex:0 0 auto!important;position:sticky!important;top:68px!important;align-self:flex-start!important;width:260px!important;min-width:220px!important;max-width:min(460px,34vw)!important;height:calc(100vh - 68px)!important;margin:0!important;overflow:hidden!important;resize:horizontal!important;border-radius:0!important}
.upcoming-dock .race-list{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important}
@media(max-width:800px){.layout{display:block!important}.brand-logo{width:72px!important;height:38px!important;min-width:72px!important}.upcoming-dock{position:relative!important;top:auto!important;width:calc(100% - 28px)!important;min-width:0!important;max-width:none!important;height:280px!important;margin:14px!important;resize:none!important;border-radius:12px!important}}
`;

const HOTFIX_JS = `<script>
(()=>{
  const manufacturers=[
    {src:'/assets/manufacturers/go-setups.webp',alt:'GO Setups'},
    {src:'/assets/manufacturers/hymo-setups.webp',alt:'HYMO Setups'},
    {src:'/assets/manufacturers/bealien.webp',alt:'beAlien Setups'}
  ];

  const init=()=>{
    const logo=document.querySelector('.brand-logo');
    if(logo){
      logo.src='/assets/three-peaks-racing-logo.webp';
      logo.alt='Three Peaks Racing';
      logo.style.display='block';
      logo.onerror=()=>{logo.onerror=null;logo.src='/assets/header-logo.webp';};
    }

    const img=document.getElementById('manufacturerImage');
    const prev=document.getElementById('manufacturerPrev');
    const next=document.getElementById('manufacturerNext');
    if(img){
      if(window.__tprManufacturerCarouselTimer) clearInterval(window.__tprManufacturerCarouselTimer);
      if(window.__tprManufacturerCarouselTimeout) clearTimeout(window.__tprManufacturerCarouselTimeout);

      let index=0;
      let generation=0;

      const preload=src=>{const i=new Image();i.src=src;};
      manufacturers.forEach(item=>preload(item.src));

      const show=value=>{
        generation+=1;
        const currentGeneration=generation;
        index=(value+manufacturers.length)%manufacturers.length;
        const item=manufacturers[index];
        img.style.opacity='0';
        if(window.__tprManufacturerCarouselTimeout) clearTimeout(window.__tprManufacturerCarouselTimeout);
        window.__tprManufacturerCarouselTimeout=setTimeout(()=>{
          if(currentGeneration!==generation)return;
          img.src=item.src;
          img.alt=item.alt;
          img.style.opacity='1';
        },160);
      };

      const restart=()=>{
        if(window.__tprManufacturerCarouselTimer) clearInterval(window.__tprManufacturerCarouselTimer);
        window.__tprManufacturerCarouselTimer=setInterval(()=>show(index+1),4000);
      };

      show(0);
      restart();
      if(prev) prev.onclick=()=>{show(index-1);restart();};
      if(next) next.onclick=()=>{show(index+1);restart();};
    }

    const layout=document.querySelector('.layout');
    const upcoming=document.getElementById('upcoming');
    const main=layout?.querySelector('main');
    if(layout&&upcoming&&main&&upcoming.previousElementSibling!==main){layout.appendChild(upcoming);}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>`;

function stripLegacyManufacturerCarousel(html){
  return html.replace(/<script>\s*\(\(\) => \{[\s\S]*?const mfrs=\[[\s\S]*?restartMfr\(\);[\s\S]*?<\/script>/, "");
}

function applyHotfix(html){
  let out=stripLegacyManufacturerCarousel(html);
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