(()=>{
  const rows=new Map([
    ['Hypercar\u0000Alpine A424',0],
    ['Hypercar\u0000BMW M Hybrid V8',1],
    ['Hypercar\u0000Cadillac V-Series.R',2],
    ['Hypercar\u0000Ferrari 499P',3],
    ['Hypercar\u0000Glickenhaus SCG 007',4],
    ['Hypercar\u0000Isotta Fraschini Tipo6-C',5],
    ['Hypercar\u0000Lamborghini SC63',6],
    ['Hypercar\u0000Peugeot 9X8',7],
    ['Hypercar\u0000Porsche 963',8],
    ['Hypercar\u0000Toyota GR010',9],
    ['Hypercar\u0000Vanwall Vandervell 680',10],
    ['LMP2\u0000Oreca 07 Gibson',11],
    ['LMP3\u0000Adess AD25',12],
    ['LMP3\u0000Duqueine D09',13],
    ['LMP3\u0000Ginetta G61-LT-P325',14],
    ['LMP3\u0000Ligier JS P325',15],
    ['LMGT3\u0000Aston Martin Vantage AMR LMGT3',16],
    ['LMGT3\u0000BMW M4 LMGT3',17],
    ['LMGT3\u0000Chevrolet Corvette Z06 LMGT3.R',18],
    ['LMGT3\u0000Ferrari 296 LMGT3',19],
    ['LMGT3\u0000Ford Mustang LMGT3',20],
    ['LMGT3\u0000Lamborghini Huracán LMGT3',21],
    ['LMGT3\u0000Lexus RC F LMGT3',22],
    ['LMGT3\u0000McLaren 720S LMGT3',23],
    ['LMGT3\u0000Mercedes-AMG LMGT3',24],
    ['LMGT3\u0000Porsche 911 GT3 R',25]
  ]);

  const style=document.createElement('style');
  style.textContent=`
    .car-detail-heading{display:flex;align-items:center;gap:24px;margin:0 0 22px;min-height:64px}
    .car-detail-heading-copy{min-width:0}
    .car-detail-heading .car-title{margin:0 0 7px}
    .car-detail-heading .car-subtitle{margin-bottom:0}
    .car-detail-image{--car-row:0;display:none;width:180px;height:64px;flex:0 0 180px;background:url('/assets/cars/car-detail-sprite.webp') 0 calc(var(--car-row) * -64px)/180px 1664px no-repeat;overflow:hidden}
    @media(max-width:650px){.car-detail-heading{gap:12px;align-items:center}.car-detail-image{width:135px;height:48px;flex-basis:135px;background-size:135px 1248px;background-position:0 calc(var(--car-row) * -48px)}}
    @media(max-width:430px){.car-detail-heading{align-items:flex-start;flex-wrap:wrap}.car-detail-image{width:135px;height:48px;flex-basis:135px}}
  `;
  document.head.appendChild(style);

  const ensureHeading=()=>{
    const title=document.getElementById('carTitle');
    const subtitle=document.getElementById('carSubtitle');
    if(!title||!subtitle)return null;
    let image=document.getElementById('carDetailImage');
    if(image)return image;
    const heading=document.createElement('div');
    heading.className='car-detail-heading';
    const copy=document.createElement('div');
    copy.className='car-detail-heading-copy';
    title.before(heading);
    copy.append(title,subtitle);
    image=document.createElement('div');
    image.id='carDetailImage';
    image.className='car-detail-image';
    image.setAttribute('aria-hidden','true');
    heading.append(copy,image);
    return image;
  };

  const showImage=(category,vehicle)=>{
    const image=ensureHeading();
    if(!image)return;
    const row=rows.get(String(category||'')+'\u0000'+String(vehicle||''));
    if(row===undefined){image.style.display='none';image.style.removeProperty('--car-row');return;}
    image.style.setProperty('--car-row',String(row));
    image.style.display='block';
  };

  const init=()=>{
    ensureHeading();
    const original=window.showCar;
    if(typeof original==='function'&&!original.__carImages){
      const wrapped=async function(category,vehicle,...rest){
        const result=await original.call(this,category,vehicle,...rest);
        showImage(category,vehicle);
        return result;
      };
      wrapped.__carImages=true;
      window.showCar=wrapped;
    }
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
