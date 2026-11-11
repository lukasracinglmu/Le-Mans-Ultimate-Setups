import { initHeaderActions } from './home/header-actions.js';
initHeaderActions();

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const params = new URLSearchParams(location.search);
const eventId = params.get('id');
let activeEvent = null;
let timer = null;

function parts(date) {
  return new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'long',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date)).reduce((a,p)=>(a[p.type]=p.value,a),{});
}
function shortDate(date) {
  return new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(date));
}
function rankBadge(value) {
  const raw=String(value||'').toUpperCase();
  const match=raw.match(/\b([BSGP])\s*[0-3]?\b/);
  const word=raw.match(/\b(BRONZE|SILVER|GOLD|PLATINUM)\b/);
  const prefix=match?.[1]||({BRONZE:'B',SILVER:'S',GOLD:'G',PLATINUM:'P'}[word?.[1]]||'');
  const rank=({B:'bronze',S:'silver',G:'gold',P:'platinum'})[prefix]||'unranked';
  const label=({B:'Bronze',S:'Silver',G:'Gold',P:'Platinum'})[prefix]||'Kein SR';
  return '<span class="pill safety-badge '+rank+'">'+label+'</span>';
}
function classBadges(event) {
  const classes=Array.isArray(event.classes)&&event.classes.length?event.classes:[event.class];
  return classes.filter(Boolean).map(name=>'<span class="pill class-badge '+esc(String(name).toLowerCase().replace(/[^a-z0-9-]/g,'-'))+'">'+esc(name==='HYPER-K'?'HY':name)+'</span>').join('');
}
function countdown() {
  const node=$('#raceCountdown');
  if(!node||!activeEvent)return;
  const ms=Date.parse(activeEvent.startTime)-Date.now();
  if(ms<=0){node.textContent='STARTED';node.className='race-countdown started';return;}
  let seconds=Math.floor(ms/1000);
  const days=Math.floor(seconds/86400);seconds%=86400;
  const hours=Math.floor(seconds/3600);seconds%=3600;
  const minutes=Math.floor(seconds/60);seconds%=60;
  node.textContent=(days?days+'d ':'')+[hours,minutes,seconds].map(n=>String(n).padStart(2,'0')).join(':');
  node.className='race-countdown '+(ms<=5*60000?'urgent':ms<=10*60000?'soon':'ready');
}
function objectText(value) {
  if(value===null||value===undefined||value==='')return '';
  if(Array.isArray(value))return value.map(objectText).filter(Boolean).join(', ');
  if(typeof value==='object')return objectText(value.name??value.label??value.value??value.title??value.description??value.temperature??'');
  if(typeof value==='boolean')return value?'Ja':'Nein';
  return String(value);
}
function normalizedKey(value){return String(value).toLowerCase().replace(/[^a-z0-9]/g,'');}
function lookup(event, aliases) {
  const sources=[event.seriesData||{},event.eventData||{}];
  const wanted=new Set(aliases.map(normalizedKey));
  for(const source of sources){
    for(const [key,value] of Object.entries(source)){
      if(wanted.has(normalizedKey(key))&&objectText(value))return objectText(value);
    }
  }
  for(const source of sources){
    for(const value of Object.values(source)){
      if(value&&typeof value==='object'&&!Array.isArray(value)){
        for(const [key,nested] of Object.entries(value)){
          if(wanted.has(normalizedKey(key))&&objectText(nested))return objectText(nested);
        }
      }
    }
  }
  return '';
}
function fact(label,value) {
  if(!value)return '';
  return '<div class="race-fact"><div class="race-fact-label">'+esc(label)+'</div><div class="race-fact-value">'+esc(value)+'</div></div>';
}
function renderNext(events) {
  const next=events.filter(item=>item.id!==activeEvent.id&&Date.parse(item.startTime)>Date.now()).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime)).slice(0,3);
  $('#nextStarts').innerHTML=next.length?next.map((item,index)=>{
    const p=parts(item.startTime);
    return '<article class="next-start '+(index===0?'nearest':'')+'">'+(index===0?'<div class="next-start-tag">NEXT UP</div>':'')+
      '<div class="next-start-time">'+p.hour+':'+p.minute+'</div><div class="next-start-date">'+esc(shortDate(item.startTime))+'</div>'+
      '<div class="next-start-name">'+esc(item.race)+'</div><div class="next-start-track">'+esc(item.track||'')+'</div></article>';
  }).join(''):'<div class="race-fact">Keine weiteren Starts in den geladenen Kalenderdaten.</div>';
}

const TRACK_LAYOUTS = [
  { keys:['bahrain','sakhir'], name:'Bahrain International Circuit', layout:'Grand Prix / Endurance reference', image:'https://cdn.sanity.io/images/5xqo0b3r/production/f3f0551a4e0d599c56294c79aa285f3ea94f3106-1920x1080.png?auto=format&fit=clip&q=75', source:'Track Titan' },
  { keys:['barcelona','catalunya'], name:'Circuit de Barcelona-Catalunya', layout:'Grand Prix layout', image:'https://res.cloudinary.com/prod-f2f3/image/upload/v1718719581/f3/articles/2024/06_June/F3-Web024_Preview_05ESP-2.jpg', source:'FIA Formula 3' },
  { keys:['le mans','sarthe','lemans'], name:'Circuit de la Sarthe', layout:'24 Hours layout', image:'https://newsroom.porsche.com/.imaging/mte/porsche-templating-theme/teaser_720x406x2/dam/press-kits/Motorsport-Guide-2019/02-World-Tour-2019-Rennserien/FIA-WEC/Strecken/WEC_2.jpg/jcr%3Acontent/WEC_2.jpg', source:'Porsche Newsroom' },
  { keys:['paul ricard'], name:'Circuit Paul Ricard', layout:'Grand Prix layout reference', image:'https://www.currusracing.com/plans/plan-circuit-paul-ricard.png', source:'Circuit Paul Ricard / Currus Racing' },
  { keys:['cota','circuit of the americas','americas'], name:'Circuit of the Americas', layout:'Grand Prix layout', image:'https://www.fia.com/sites/default/files/news/main_image/cota_2020_wec_circuitmap.png', source:'FIA' },
  { keys:['daytona'], name:'Daytona International Speedway', layout:'Road Course', image:'https://sim-lab.us/cdn/shop/files/Group_19.png?v=1763035624&width=539', source:'Sim-Lab' },
  { keys:['fuji'], name:'Fuji Speedway', layout:'WEC layout', image:'https://cdn-image.as-web.jp/2024/09/11130833/asimg_wec_6hfuji_fa66e117c0c9bc6.jpg', source:'FIA WEC' },
  { keys:['imola','enzo e dino ferrari'], name:'Autodromo Enzo e Dino Ferrari', layout:'Grand Prix layout', image:'https://cdn-image.as-web.jp/2024/04/19004703/asimg_Circuit-map-imola-wec2024_c066214077343ed.jpg', source:'FIA WEC' },
  { keys:['interlagos','jose carlos pace'], name:'Autódromo José Carlos Pace', layout:'Grand Prix layout', image:'https://img2.51gt3.com/rac/track/202304/c0bcb433231b430d8586c98f252ee4fd.png', source:'51GT3' },
  { keys:['laguna seca'], name:'WeatherTech Raceway Laguna Seca', layout:'Full Course', image:'https://dl.motorsportreg.com/3e65bb44-a667-4142-94ad-4e7e29bcf837/-/crop/1200x674/0%2C0/-/preview/', source:'MotorsportReg' },
  { keys:['lusail','qatar'], name:'Lusail International Circuit', layout:'Grand Prix layout', image:'https://cdn.sanity.io/images/5xqo0b3r/production/2ff941c026513e2dd668409cf67977242983a4f1-1920x1080.webp?auto=format&fit=clip&q=75', source:'Track Titan' },
  { keys:['monza'], name:'Autodromo Nazionale Monza', layout:'Grand Prix layout', image:'https://motorsporttickets.com/blog/wp-content/uploads/2024/08/Italy-Stats.png', source:'Motorsport Tickets' },
  { keys:['portimao','portimão','algarve'], name:'Autódromo Internacional do Algarve', layout:'Grand Prix layout', image:'https://media.formula1.com/image/upload/c_fit%2Ch_704/q_auto/v1740000001/common/f1/2027/track/2027trackalgarveinternationalcircuitdetailed.webp', source:'Formula 1' },
  { keys:['sebring'], name:'Sebring International Raceway', layout:'Full Course', image:'https://cdn.sanity.io/images/5xqo0b3r/production/9c2fcdd0fa67beee345daabe11a597c588845039-1920x1080.png?auto=format&fit=clip&q=75', source:'Track Titan' },
  { keys:['silverstone'], name:'Silverstone Circuit', layout:'Grand Prix layout', image:'https://www.pngkit.com/png/full/372-3728803_egp-united-kingdom-silverstone-silverstone-circuit.png', source:'PNGkit' },
  { keys:['spa','francorchamps'], name:'Circuit de Spa-Francorchamps', layout:'Grand Prix / Endurance reference', image:'https://cdn.sanity.io/images/5xqo0b3r/production/2e1930c0f7d04e53a11a9345028a52c66015de00-1920x1080.png?auto=format&fit=clip&q=75', source:'Track Titan' },
  { keys:['road atlanta','michelin raceway'], name:'Michelin Raceway Road Atlanta', layout:'Full Course', image:'https://thetrackmaps.com/cdn/shop/files/simplyframed_roadatl_24x30_WB.png?v=1736973978&width=1445', source:'The Track Maps' },
  { keys:['long beach'], name:'Streets of Long Beach', layout:'Street Circuit', image:'https://indymotorspeedway.com/files/IRL-Track-Layout-LongBeach.jpg', source:'Indy Motor Speedway' }
];
function trackLayoutFor(track) {
  const value=String(track||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
  return TRACK_LAYOUTS.find(item=>item.keys.some(key=>value.includes(key.normalize('NFD').replace(/[\\u0300-\\u036f]/g,''))))||null;
}
function renderTrackLayout(track) {
  const root=$('#trackLayout');
  if(!root)return;
  const item=trackLayoutFor(track);
  if(!item){root.innerHTML='<div class="track-layout-empty">Für diese Strecke ist aktuell kein verifiziertes Layout hinterlegt.</div>';return;}
  root.classList.add('has-image');
  root.innerHTML='<img class="track-layout-image" alt="Streckenlayout '+esc(item.name)+'" loading="lazy" decoding="async"><div class="track-layout-caption"><span>'+esc(item.name)+' · '+esc(item.layout)+'</span><a href="'+esc(item.image)+'" target="_blank" rel="noopener noreferrer">Bildquelle: '+esc(item.source)+'</a></div>';
  const image=root.querySelector('img');
  image.addEventListener('error',()=>{
    root.classList.remove('has-image');
    root.innerHTML='<div class="track-layout-empty">Das Streckenlayout konnte gerade nicht geladen werden. Bitte später erneut versuchen.</div>';
  },{once:true});
  image.src=item.image;
}
function render(event, events) {
  activeEvent=event;
  const p=parts(event.startTime);
  $('#raceName').textContent=event.race;
  $('#raceTrack').textContent=event.track||'';
  renderTrackLayout(event.track);
  $('#raceType').textContent=({special:'SPECIAL EVENT',weekly:'WEEKLY RACE',daily:'DAILY RACE',championship:'CHAMPIONSHIP'}[event.type]||'RACE');
  $('#raceClasses').innerHTML=classBadges(event);
  $('#raceSafety').innerHTML=rankBadge(event.safety);
  $('#raceStartAt').textContent='Rennstart: '+p.weekday+', '+p.day+'. '+p.month+' '+p.year+' · '+p.hour+':'+p.minute+' Uhr';
  const series=event.seriesData||{}, raw=event.eventData||{};
  const raceFields=[
    ['Car Class',['car_class','car_classes','class_name','class']],
    ['Duration',['race_duration_minutes','duration','race_duration']],
    ['Setup',['setup','setup_type','fixed_setup']],
    ['Grid',['grid','grid_size','max_grid_size','max_vehicles','max_cars']],
    ['Safety Ranking Multiplier',['safety_ranking_multiplier','sr_multiplier','safety_multiplier']],
    ['Tires',['tires','tyres','available_tires','available_tyres']],
    ['Race Interval',['race_interval','interval','race_interval_minutes']],
    ['Track',['track_friendly','track_name','track']],
    ['Participation',['participation','participation_requirement','entry_requirement']],
    ['Fuel',['fuel','fuel_multiplier','fuel_usage','fuel_consumption']],
    ['Driver Ranking',['driver_ranking','driver_rank','driver_rating_multiplier']],
    ['Tire Warmers',['tire_warmers','tyre_warmers','tire_warmer']]
  ];
  $('#raceFacts').innerHTML=raceFields.map(([label,keys])=>fact(label,lookup(event,keys))).join('')||'<div class="race-fact">Für dieses Rennen sind keine weiteren Angaben verfügbar.</div>';
  const sessionFields=[
    ['Practice Duration',['practice_duration','practice_duration_minutes','practice_length']],
    ['Practice In-Game Start',['practice_starts_at','practice_start','practice_in_game_start']],
    ['Track State',['track_state','track_condition','track_grip','track_conditions']],
    ['Grip',['grip','track_grip_percentage','track_state_grip']],
    ['Qualifying',['qualifying_duration','qualifying_duration_minutes','qualifying_length']],
    ['Race Session',['race_session','session_details','session']]
  ];
  $('#sessionFacts').innerHTML=sessionFields.map(([label,keys])=>fact(label,lookup(event,keys))).join('')||'<div class="race-fact">Keine Session Details vom Portal übermittelt.</div>';
  const weatherFields=[
    ['Weather',['weather','weather_condition','conditions']],
    ['Air Temperature',['air_temperature','air_temp','temperature']],
    ['Track Temperature',['track_temperature','track_temp']],
    ['Wind',['wind','wind_speed','wind_direction']],
    ['Humidity',['humidity','relative_humidity']],
    ['Rain',['rain','rain_chance','precipitation']],
    ['Cloud Cover',['cloud_cover','cloudiness']],
    ['Pressure',['pressure','air_pressure']]
  ];
  $('#weatherFacts').innerHTML=weatherFields.map(([label,keys])=>fact(label,lookup(event,keys))).join('')||'<div class="race-fact">Wetterdaten werden für dieses Event nicht übermittelt.</div>';
  renderNext(events);
  $('#raceContent').hidden=false;
  $('#raceStatus').hidden=true;
  countdown();
  if(timer)clearInterval(timer);
  timer=setInterval(countdown,1000);
  document.title=event.race+' | Renndetails';
}
async function load(){
  if(!eventId){$('#raceStatus').textContent='Keine Renn-ID angegeben.';return;}
  try{
    const response=await fetch('/api/calendar',{headers:{Accept:'application/json'}});
    const data=await response.json();
    if(!response.ok||!data.success)throw Error(data.error||'Rennkalender nicht erreichbar');
    const events=Array.isArray(data.events)?data.events:[];
    const event=events.find(item=>String(item.id)===eventId);
    if(!event)throw Error('Dieses Rennen ist in den aktuell geladenen Kalenderdaten nicht mehr enthalten.');
    render(event,events);
  }catch(error){$('#raceStatus').textContent='Renndetails konnten nicht geladen werden: '+error.message;}
}
load();
