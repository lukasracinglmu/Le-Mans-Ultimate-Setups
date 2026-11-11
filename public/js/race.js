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
function render(event, events) {
  activeEvent=event;
  const p=parts(event.startTime);
  $('#raceName').textContent=event.race;
  $('#raceTrack').textContent=event.track||'';
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
