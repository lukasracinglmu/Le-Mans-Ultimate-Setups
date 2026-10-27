/* @file-notes: Gemeinsame Streckenliste und Suche für Website und Discord-Bot.
 * Namen und Layouts entsprechen der bestätigten Liste. Keine externen APIs erforderlich.
 */
export const REQUEST_TRACKS = Object.freeze([
  [
    "Algarve / Portimão",
    [
      "Algarve",
      "Portimao",
      "Portimão",
      "Algarve International Circuit"
    ],
    "portimao",
    "default"
  ],
  [
    "Bahrain – Grand Prix",
    [
      "Bahrain",
      "Bahrain GP",
      "Bahrain International Circuit"
    ],
    "bahrain",
    "default"
  ],
  [
    "Bahrain – Endurance",
    [
      "Bahrain Endurance",
      "Bahrain International Endurance Circuit"
    ],
    "bahrain",
    "endurance"
  ],
  [
    "Bahrain – Outer",
    [
      "Bahrain Outer",
      "Bahrain International Outer Circuit"
    ],
    "bahrain",
    "outer"
  ],
  [
    "Bahrain – Paddock",
    [
      "Bahrain Paddock",
      "Bahrain International Paddock Circuit"
    ],
    "bahrain",
    "paddock"
  ],
  [
    "Barcelona-Catalunya",
    [
      "Barcelona",
      "Catalunya",
      "Circuit de Barcelona-Catalunya"
    ],
    "barcelona",
    "default"
  ],
  [
    "Circuit of the Americas / COTA",
    [
      "COTA",
      "Circuit of the Americas",
      "COTA GP"
    ],
    "cota",
    "default"
  ],
  [
    "COTA – National",
    [
      "COTA National",
      "Circuit of the Americas National"
    ],
    "cota",
    "national"
  ],
  [
    "Daytona International Speedway",
    [
      "Daytona"
    ],
    "daytona",
    "default"
  ],
  [
    "Fuji International Speedway",
    [
      "Fuji",
      "Fuji Speedway"
    ],
    "fuji",
    "default"
  ],
  [
    "Fuji – Classic, ohne Schikane",
    [
      "Fuji Classic",
      "Fuji No Chicane",
      "Fuji ohne Schikane"
    ],
    "fuji",
    "classic"
  ],
  [
    "Imola",
    [
      "Autodromo Internazionale Enzo e Dino Ferrari"
    ],
    "imola",
    "default"
  ],
  [
    "Imola – ELMS",
    [
      "Imola ELMS"
    ],
    "imola",
    "elms"
  ],
  [
    "Interlagos",
    [
      "Autódromo José Carlos Pace",
      "Sao Paulo"
    ],
    "interlagos",
    "default"
  ],
  [
    "Laguna Seca",
    [
      "WeatherTech Raceway Laguna Seca"
    ],
    "laguna",
    "default"
  ],
  [
    "Le Mans / Circuit de la Sarthe",
    [
      "Le Mans",
      "Circuit de la Sarthe",
      "Sarthe"
    ],
    "lemans",
    "default"
  ],
  [
    "Long Beach",
    [
      "Streets of Long Beach"
    ],
    "longbeach",
    "default"
  ],
  [
    "Lusail",
    [
      "Lusail International Circuit",
      "Losail",
      "Qatar"
    ],
    "lusail",
    "default"
  ],
  [
    "Lusail – Short",
    [
      "Lusail Short",
      "Losail Short",
      "Qatar Short"
    ],
    "lusail",
    "short"
  ],
  [
    "Monza",
    [
      "Autodromo Nazionale Monza"
    ],
    "monza",
    "default"
  ],
  [
    "Monza – Curva Grande",
    [
      "Monza Curva Grande"
    ],
    "monza",
    "curvagrande"
  ],
  [
    "Paul Ricard",
    [
      "Circuit Paul Ricard",
      "Paul Ricard Default",
      "Paul Ricard Standard"
    ],
    "paulricard",
    "default"
  ],
  [
    "Paul Ricard – 1A",
    [
      "Paul Ricard 1a"
    ],
    "paulricard",
    "1a"
  ],
  [
    "Paul Ricard – 1A V2",
    [
      "Paul Ricard 1av2",
      "Paul Ricard 1a v2"
    ],
    "paulricard",
    "1av2"
  ],
  [
    "Paul Ricard – 1A V2 Short",
    [
      "Paul Ricard 1av2-short",
      "Paul Ricard 1a v2 short"
    ],
    "paulricard",
    "1av2short"
  ],
  [
    "Paul Ricard – 3A",
    [
      "Paul Ricard 3a"
    ],
    "paulricard",
    "3a"
  ],
  [
    "Road Atlanta",
    [
      "Michelin Raceway Road Atlanta"
    ],
    "roadatlanta",
    "default"
  ],
  [
    "Sebring",
    [
      "Sebring International Raceway"
    ],
    "sebring",
    "default"
  ],
  [
    "Sebring – School",
    [
      "Sebring School",
      "Sebring School Circuit"
    ],
    "sebring",
    "school"
  ],
  [
    "Silverstone – GP / WEC",
    [
      "Silverstone",
      "Silverstone GP",
      "Silverstone WEC"
    ],
    "silverstone",
    "default"
  ],
  [
    "Silverstone – National",
    [
      "Silverstone National"
    ],
    "silverstone",
    "national"
  ],
  [
    "Silverstone – International",
    [
      "Silverstone International"
    ],
    "silverstone",
    "international"
  ],
  [
    "Spa-Francorchamps",
    [
      "Spa",
      "Circuit de Spa-Francorchamps"
    ],
    "spa",
    "default"
  ]
].map(([name,aliases,family,layout])=>Object.freeze({name,aliases:Object.freeze(aliases),family,layout})));

export function normalizeRequestTrack(value) {
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
}

/* Exakte Namen und gebräuchliche Kurzformen sind erlaubt; unbekannte Strecken nicht. */
export function resolveRequestTrack(value) {
  const query=normalizeRequestTrack(value);
  return query?REQUEST_TRACKS.find(track=>[track.name,...track.aliases].some(name=>normalizeRequestTrack(name)===query))||null:null;
}

/* Präfixe zuerst, danach Teiltreffer; maximal 25 Vorschläge für Discord. */
export function searchRequestTracks(value,limit=8) {
  const query=normalizeRequestTrack(value);
  return REQUEST_TRACKS.map((track,index)=>{
    const names=[track.name,...track.aliases].map(normalizeRequestTrack);
    const shortHit=[track.name,...track.aliases].some(name=>String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z0-9]+/).some(word=>word.startsWith(query)));
    const score=!query||names.some(name=>name.startsWith(query))?0:(query.length<=3?shortHit:names.some(name=>name.includes(query)))?1:2;
    return {track,index,score};
  }).filter(item=>item.score<2).sort((a,b)=>a.score-b.score||a.index-b.index).slice(0,Math.max(0,Math.min(25,limit))).map(item=>item.track);
}

/* Dateinamen verwenden oft Kurzformen. Layouts werden zuerst erkannt, damit ein
 * vorhandenes GP-Setup keinen Request für ein anderes Layout fälschlich blockiert.
 */
const FILE_FAMILIES = {
  portimao:['portimao','algarve'],bahrain:['bahrain','bah'],barcelona:['barcelona','catalunya','bar'],
  cota:['cota','circuitoftheamericas'],daytona:['daytona'],fuji:['fuji','fuj'],imola:['imola','imo'],
  interlagos:['interlagos','josecarlospace','saopaulo'],laguna:['lagunaseca'],lemans:['lemans','sarthe'],
  longbeach:['longbeach'],lusail:['lusail','losail','qatar'],monza:['monza'],paulricard:['paulricard'],
  roadatlanta:['roadatlanta'],sebring:['sebring'],silverstone:['silverstone'],spa:['spa','spafrancorchamps']
};
export function requestTrackFromFilename(value) {
  const words=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=normalizeRequestTrack(words);
  const family=Object.keys(FILE_FAMILIES).find(key=>FILE_FAMILIES[key].some(alias=>alias.length<=3?words.split(' ').includes(alias):compact.includes(alias)));
  if(!family)return null;
  // Die ausdrücklich entfernten Layouts gehören nicht zur anfragbaren Liste.
  if((family==='portimao'&&/\belms\b/.test(words))||(family==='spa'&&/\bendurance\b/.test(words))||(family==='lemans'&&/mulsanne|nochicane|ohneschikane/.test(compact)))return null;
  const layouts={
    bahrain:[['endurance',/endurance/],['outer',/outer/],['paddock',/paddock/]],
    cota:[['national',/national/]],fuji:[['classic',/classic|nochicane|ohneschikane/]],
    imola:[['elms',/elms/]],lusail:[['short',/short/]],monza:[['curvagrande',/curvagrande/]],
    paulricard:[['1av2short',/1av2short/],['1av2',/1av2/],['3a',/3a/],['1a',/1a/]],
    sebring:[['school',/school/]],silverstone:[['international',/international/],['national',/national/]]
  };
  const layout=(layouts[family]||[]).find(([,pattern])=>pattern.test(compact))?.[0]||'default';
  return REQUEST_TRACKS.find(track=>track.family===family&&track.layout===layout)||null;
}
export function matchingRequestSetups(files,value) {
  const requested=resolveRequestTrack(value);
  if(!requested)return [];
  return (Array.isArray(files)?files:[]).filter(file=>requestTrackFromFilename(file.name)?.name===requested.name);
}
