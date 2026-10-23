import { enrichDisplayNames } from "./setup-display-name.js";
import baseWorker from "./worker.js";
import { readPreviousSetups, applyPreviousSetups, enrichSetupLifecycle } from "./setup-lifecycle.js";
import { readSiteFile } from "./repo-read.js";
import { enrichSetupVersions, readSetupVersion, storeSetupVersion } from "./setup-version.js";

import { readUploadForm } from "./upload-storage.js";

const DISCORD_API = "https://discord.com/api/v10";
const REQUEST_MODAL_ID = "lmu_setup_request";
const REPO_ASSETS = new Set([
  "/assets/manufacturers/go-setups.webp",
  "/assets/manufacturers/hymo-setups.webp",
  "/assets/manufacturers/bealien.webp"
]);

let discordVerifyKeyCache = { key: null, expiresAt: 0 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "POST" && path === "/api/request") return createWebsiteRequest(request, env);
      if (request.method === "POST" && path === "/interactions/discord") return discordInteraction(request, env);
      if (request.method === "GET" && REPO_ASSETS.has(path)) return serveRepoAsset(request, env);
      if (request.method === "GET" && path === "/") return serveEnhancedHome(request, env);

      if (request.method === "GET" && path === "/api/setups") {
        const response = await baseWorker.fetch(request, env, ctx);
        if (!response.ok) return response;
        const data = await safeJson(response.clone());
        if (!data?.success || !Array.isArray(data.setups)) return response;
        const category = url.searchParams.get("category") || "";
        const vehicle = url.searchParams.get("vehicle") || "";
        const setups = await enrichSetupVersions(data.setups, category, vehicle, env);
        return json({ ...data, setups:await enrichDisplayNames(await enrichSetupLifecycle(setups,category,vehicle,env),category,vehicle,env) }, response.status);
      }

      if (request.method === "POST" && path === "/api/setups/upload") {
        let form;
        try { form = await readUploadForm(request); }
        catch (error) { return json({ success:false, error:error.status === 413 ? "Request zu groß." : "Ungültiger Upload.", retryable:false }, error.status === 413 ? 413 : 400); }
        const previous=readPreviousSetups(form,form.getAll("files").map(file=>String(file?.name||"")));
        if(previous.error)return json({success:false,error:previous.error,retryable:false},400);
        const parsed = readSetupVersion(form);
        if (parsed.error) return json({ success: false, error: parsed.error }, 400);
        const category = String(form.get("category") || "").trim();
        const vehicle = String(form.get("vehicle") || "").trim();
        const response = await baseWorker.fetch(request, env, ctx, form);
        if (!response.ok) return response;
        const data = await safeJson(response.clone());
        if (!data?.success) return response;
        const retired=[];
        for (const item of Array.isArray(data.uploaded) ? data.uploaded : []) {
          if (item?.name) {
            try { if(!previous.duplicateOf||!item.alreadyExists)await storeSetupVersion(category, vehicle, item.name, parsed.version, env); }
            catch {
              return json({success:false,error:"ZIP gespeichert, Versionsdaten konnten noch nicht bestätigt werden. Erneuter Versuch folgt.",code:"VERSION_STORAGE",retryable:true},503);
            }
            const cleanup=await applyPreviousSetups({plan:previous,category,vehicle,replacement:item,env});
            if(!cleanup.success)return json({...cleanup,success:false,error:"Neue ZIP gespeichert. "+cleanup.error},cleanup.status||503);
            retired.push(...cleanup.retired);
          }
        }
        return json({ ...data, duplicate:!!previous.duplicateOf, retired, category, vehicle, version:parsed.version, uploaded: (data.uploaded || []).map(item => ({ ...item, version: parsed.version })) }, response.status);
      }

      return baseWorker.fetch(request, env, ctx);
    } catch (error) {
      console.error("Production worker route failed", error instanceof Error ? error.message : "unknown");
      return json({ success: false, error: "Interner Serverfehler." }, 500);
    }
  }
};

async function createWebsiteRequest(request, env) {
  const meRequest = new Request(new URL("/api/me", request.url), { method: "GET", headers: request.headers });
  const meResponse = await baseWorker.fetch(meRequest, env);
  const me = await safeJson(meResponse);
  if (!me?.loggedIn || !me?.user?.id || !me?.user?.username) return json({ success: false, error: "Nicht angemeldet." }, 401);
  let body;
  try { body = await request.json(); }
  catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); }
  const data = {
    userId: String(me.user.id),
    username: me.user.username,
    vehicle: clean(body.vehicle, 100),
    carClass: clean(body.carClass, 80),
    track: clean(body.track, 100),
    message: clean(body.message, 500)
  };
  if (!data.vehicle || !data.track) return json({ success: false, error: "Fahrzeug und Strecke erforderlich." }, 400);
  const catalogResponse=await readSiteFile(request,env,"setups.json");
  if(!catalogResponse.ok)return json({success:false,error:"Fahrzeugliste momentan nicht verfügbar."},503);
  let catalog;try{catalog=await catalogResponse.json();}catch{return json({success:false,error:"Fahrzeugliste momentan nicht verfügbar."},503);}
  const match=Object.entries(catalog).flatMap(([carClass,vehicles])=>Array.isArray(vehicles)?vehicles.map(v=>({name:v.name,carClass})):[]).find(v=>String(v.name).toLowerCase()===data.vehicle.toLowerCase());
  if(!match)return json({success:false,error:"Bitte ein Fahrzeug aus den Vorschlägen auswählen."},400);
  data.vehicle=match.name;data.carClass=match.carClass;
  const sent = await sendSetupRequest(data, env);
  return sent.ok ? json({ success: true }) : json({ success: false, error: sent.error }, sent.status);
}

function buildRequestContent({ userId, username, vehicle, carClass, track, message }, roleId) {
  const validUserId = /^\d{16,22}$/.test(String(userId || "")) ? String(userId) : null;
  const roleMention = roleId && /^\d{16,22}$/.test(roleId) ? `<@&${roleId}>` : null;
  const userMention = validUserId ? `<@${validUserId}>` : clean(username, 80);
  const lines = [];
  if (roleMention) lines.push(roleMention);
  lines.push(
    `**User:** ${userMention}`,
    `**Fahrzeug:** ${clean(vehicle, 100)}`,
    `**Klasse:** ${clean(carClass || "Nicht angegeben", 80)}`,
    `**Strecke:** ${clean(track, 100)}`
  );
  const extra = clean(message, 500);
  if (extra) lines.push(`**Weitere Informationen:** ${extra}`);
  return lines.join("\n").slice(0, 2000);
}

async function sendSetupRequest(data, env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) {
    return { ok: false, status: 503, error: "Request-Dienst nicht konfiguriert." };
  }
  const roleId = env.DISCORD_SETUP_REQUEST_ROLE_ID || env.DISCORD_UPLOAD_ROLE_ID || "1538601074074849330";
  const validRoleId = roleId && /^\d{16,22}$/.test(roleId) ? roleId : null;
  const validUserId = /^\d{16,22}$/.test(String(data.userId || "")) ? String(data.userId) : null;
  const content = buildRequestContent(data, validRoleId);
  const allowedMentions = { parse: [] };
  if (validRoleId) allowedMentions.roles = [validRoleId];
  if (validUserId) allowedMentions.users = [validUserId];
  const response = await fetch(`${DISCORD_API}/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: allowedMentions })
  });
  if (!response.ok) return { ok: false, status: 502, error: "Request konnte nicht gesendet werden." };
  return { ok: true };
}

async function discordInteraction(request, env) {
  const rawBody = await request.text();
  const verified = await verifyDiscordInteraction(request, rawBody, env);
  if (!verified) return new Response("invalid request signature", { status: 401 });
  let interaction;
  try { interaction = JSON.parse(rawBody); }
  catch { return new Response("bad request", { status: 400 }); }
  if (interaction.type === 1) return discordJson({ type: 1 });
  if (interaction.type === 2 && interaction.data?.name === "request") return discordJson(requestModalResponse());
  if (interaction.type === 5 && interaction.data?.custom_id === REQUEST_MODAL_ID) {
    const values = modalValues(interaction.data.components);
    const user = interaction.member?.user || interaction.user || {};
    const data = {
      userId: user.id ? String(user.id) : null,
      username: user.global_name || user.username || "Discord User",
      vehicle: clean(values.vehicle, 100),
      carClass: clean(values.class, 80),
      track: clean(values.track, 100),
      message: clean(values.message, 500)
    };
    if (!data.vehicle || !data.track) return discordJson({ type: 4, data: { content: "Fahrzeug und Strecke sind erforderlich.", flags: 64 } });
    const catalogResponse=await readSiteFile(request,env,"setups.json");
  if(!catalogResponse.ok)return json({success:false,error:"Fahrzeugliste momentan nicht verfügbar."},503);
  let catalog;try{catalog=await catalogResponse.json();}catch{return json({success:false,error:"Fahrzeugliste momentan nicht verfügbar."},503);}
  const match=Object.entries(catalog).flatMap(([carClass,vehicles])=>Array.isArray(vehicles)?vehicles.map(v=>({name:v.name,carClass})):[]).find(v=>String(v.name).toLowerCase()===data.vehicle.toLowerCase());
  if(!match)return json({success:false,error:"Bitte ein Fahrzeug aus den Vorschlägen auswählen."},400);
  data.vehicle=match.name;data.carClass=match.carClass;
  const sent = await sendSetupRequest(data, env);
    return discordJson({ type: 4, data: { content: sent.ok ? "Setup Request wurde gesendet." : "Setup Request konnte nicht gesendet werden.", flags: 64 } });
  }
  const delegated = new Request(request.url, { method: "POST", headers: request.headers, body: rawBody });
  return baseWorker.fetch(delegated, env);
}

function requestModalResponse() {
  const input = (customId, label, options = {}) => ({
    type: 1,
    components: [{ type: 4, custom_id: customId, label, style: options.paragraph ? 2 : 1, required: options.required !== false, min_length: options.required === false ? undefined : 1, max_length: options.maxLength || 100, placeholder: options.placeholder }]
  });
  return {
    type: 9,
    data: {
      custom_id: REQUEST_MODAL_ID,
      title: "Setup Request",
      components: [
        input("vehicle", "Fahrzeug", { maxLength: 100, placeholder: "z. B. Porsche 963" }),
        input("class", "Klasse", { maxLength: 80, placeholder: "z. B. Hypercar" }),
        input("track", "Strecke", { maxLength: 100, placeholder: "z. B. Le Mans" }),
        input("message", "Weitere Informationen", { required: false, paragraph: true, maxLength: 500, placeholder: "Optional" })
      ]
    }
  };
}

function modalValues(rows) {
  const result = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const component of Array.isArray(row?.components) ? row.components : []) {
      if (component?.custom_id) result[component.custom_id] = component.value || "";
    }
  }
  return result;
}

async function getDiscordVerifyKey(env) {
  if (discordVerifyKeyCache.key && discordVerifyKeyCache.expiresAt > Date.now()) return discordVerifyKeyCache.key;
  if (!env.DISCORD_BOT_TOKEN) return null;
  const response = await fetch(`${DISCORD_API}/oauth2/applications/@me`, { headers: { "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}` } });
  if (!response.ok) return null;
  const app = await response.json();
  const key = app.verify_key || null;
  if (key) discordVerifyKeyCache = { key, expiresAt: Date.now() + 60 * 60 * 1000 };
  return key;
}

async function verifyDiscordInteraction(request, rawBody, env) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp) return false;
  const publicKeyHex = await getDiscordVerifyKey(env);
  const publicKey = hexToBytes(publicKeyHex);
  const signatureBytes = hexToBytes(signature);
  if (!publicKey || !signatureBytes) return false;
  try {
    const key = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, ["verify"]);
    const message = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify("Ed25519", key, signatureBytes, message);
  } catch { return false; }
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}

async function serveEnhancedHome(request, env) {
  const response = await readSiteFile(request, env, "index.html");
  if (!response.ok) return response;
  const html = enhanceHome(await response.text());
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }
  });
}

function enhanceHome(source) {
  let html = source;

  html = html.replace(
    /<link rel="preload" href="\/assets\/three-peaks-racing-logo\.webp" as="image" type="image\/webp">/,
    '<link rel="preload" href="/assets/header-logo.webp" as="image" type="image/webp">\n<link rel="preload" href="/assets/bp-logo.webp" as="image" type="image/webp">'
  );
  html = html.replace(
    /<img class="brand-logo"[^>]*>/,
    '<img class="brand-logo" src="/assets/bp-logo.webp" alt="Three Peaks Racing" width="96" height="48">'
  );
  html = html.replace(
    'Setups für Le Mans Ultimate – übersichtlich nach Fahrzeug, Variante und Rennserie.',
    'Setup Database für Three Peaks Racing'
  );

  html = html.replace(
    /<div class="manufacturer-strip"><span>Setup Hersteller:<\/span><span id="manufacturerName" class="manufacturer-name">GO<\/span><\/div>/,
    `<div class="manufacturer-strip manufacturer-carousel" aria-label="Setup Hersteller">
      <span class="manufacturer-label">Setup Hersteller</span>
      <button type="button" id="manufacturerPrev" class="manufacturer-nav" aria-label="Vorheriger Hersteller">‹</button>
      <div class="manufacturer-visual"><img id="manufacturerImage" src="/assets/manufacturers/go-setups.webp" alt="GO Setups"><span id="manufacturerName" class="manufacturer-name" aria-hidden="true">GO</span></div>
      <button type="button" id="manufacturerNext" class="manufacturer-nav" aria-label="Nächster Hersteller">›</button>
    </div>`
  );

  html = html.replace(/\s*<section id="upcoming" class="upcoming">[\s\S]*?<\/section>\s*/, "\n");
  html = html.replace(/<div><label for="reqEvent">[\s\S]*?<\/div>/, "");
  html = html.replace(/<div><label for="reqVariant">[\s\S]*?<\/div>/, "");
  html = html.replace(/,eventName:\$\("reqEvent"\)\.value\.trim\(\),variant:\$\("reqVariant"\)\.value\.trim\(\)/g, "");
  html = html.replace(/initManufacturer\(\);/g, "");
  html = html.replace(/loadUpcoming\(\);/g, "");

  const extraCss = `
.brand-logo{width:96px!important;height:48px!important;object-fit:contain!important;display:block!important;visibility:visible!important;opacity:1!important;flex:0 0 auto;position:relative;z-index:2}
.layout{position:relative;isolation:isolate;display:flex;align-items:flex-start}
.hero:after,.vehicle:after{display:none!important}
body:before{content:"";position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(55vw,700px);height:min(36vw,460px);background:url('/assets/bp-logo.webp') center/contain no-repeat;opacity:.07;pointer-events:none;z-index:0}
main{position:relative;z-index:1}
.manufacturer-strip.manufacturer-carousel{display:flex;align-items:center;gap:9px;min-height:64px;margin-top:16px}.manufacturer-label{font-size:12px;color:var(--muted);white-space:nowrap}.manufacturer-visual{width:178px;height:58px;display:flex;align-items:center;justify-content:center;overflow:hidden}.manufacturer-visual img{display:block;width:100%;height:100%;object-fit:contain;transition:opacity .22s ease}.manufacturer-name{display:none!important}.manufacturer-nav{width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:19px;line-height:1;background:var(--surface)}
@media(max-width:800px){.layout{display:block}.brand-logo{width:72px!important;height:38px!important}body:before{width:90vw;height:60vw;opacity:.05}main{padding-top:18px!important}.manufacturer-strip.manufacturer-carousel{flex-wrap:wrap}.manufacturer-label{width:100%}}
`;
  html = html.replace("</style>", extraCss + "\n</style>");

  const extraJs = `<script>
(() => {
  const mfrs=[{name:'GO Setups',src:'/assets/manufacturers/go-setups.webp'},{name:'HYMO',src:'/assets/manufacturers/hymo-setups.webp'},{name:'beAlien',src:'/assets/manufacturers/bealien.webp'}];
  let mIdx=0,mTimer=null;
  const mImg=document.getElementById('manufacturerImage');
  const renderMfr=i=>{if(!mImg)return;mIdx=(i+mfrs.length)%mfrs.length;const item=mfrs[mIdx];mImg.style.opacity='0';setTimeout(()=>{mImg.src=item.src;mImg.alt=item.name;mImg.style.opacity='1';},140);};
  const restartMfr=()=>{if(mTimer)clearInterval(mTimer);mTimer=setInterval(()=>renderMfr(mIdx+1),5000);};
  document.getElementById('manufacturerPrev')?.addEventListener('click',()=>{renderMfr(mIdx-1);restartMfr();});
  document.getElementById('manufacturerNext')?.addEventListener('click',()=>{renderMfr(mIdx+1);restartMfr();});
  renderMfr(0);restartMfr();
})();
</script>`;
  html = html.replace("</body>", extraJs + "\n</body>");
  return html;
}

async function serveRepoAsset(request, env) {
  const url = new URL(request.url);
  const response = await readSiteFile(request, env, url.pathname.slice(1));
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "image/webp");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}

function clean(value, max) { return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
async function safeJson(response) { try { return await response.json(); } catch { return null; } }
function discordJson(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=UTF-8" } }); }
