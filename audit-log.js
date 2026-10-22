const GITHUB_API = "https://api.github.com";
const DISCORD_API = "https://discord.com/api/v10";

function ghHeaders(env) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lmu-setups-worker"
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}
function ghRepo(env) { return `repos/${env.GITHUB_OWNER || "lukasracinglmu"}/${env.GITHUB_REPO || "Le-Mans-Ultimate-Setups"}`; }
function ghBranch(env) { return env.GITHUB_BRANCH || "main"; }
function clean(value) { const v = String(value ?? "").trim(); return v || null; }
function classifyManufacturer(name) {
  const n = String(name || "").toUpperCase();
  if (n.includes("HYMO")) return "HYMO";
  if (n.includes("BEALIEN") || n.includes("BE_ALIEN")) return "beAlien";
  if (n.includes(" GO") || n.includes("_GO") || /\bGO\b/.test(n)) return "GO";
  return null;
}
function inferTrack(name) {
  const base = String(name || "").replace(/\.zip$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base || null;
}
function normalizeEvent(event) {
  const out = {
    timestamp: new Date().toISOString(),
    action: clean(event.action),
    discordAccount: clean(event.discordAccount),
    discordUserId: clean(event.discordUserId),
    targetDiscordAccount: clean(event.targetDiscordAccount),
    targetDiscordUserId: clean(event.targetDiscordUserId),
    permission: clean(event.permission),
    setup: clean(event.setup),
    vehicle: clean(event.vehicle),
    track: clean(event.track),
    manufacturer: clean(event.manufacturer),
    version: clean(event.version),
    oldValue: clean(event.oldValue),
    newValue: clean(event.newValue),
    result: "SUCCESS"
  };
  for (const key of Object.keys(out)) if (out[key] == null) delete out[key];
  return out;
}
async function gh(path, opts, env) {
  return fetch(`${GITHUB_API}/${ghRepo(env)}${path}`, {
    ...opts,
    signal: opts?.signal || AbortSignal.timeout(20000),
    headers: { ...ghHeaders(env), ...(opts?.headers || {}) }
  });
}
function discordTitle(action) {
  if (action === "SETUP_UPLOAD") return "SETUP HOCHGELADEN";
  if (action === "SETUP_OUTDATED") return "SETUP ALS VERALTET MARKIERT";
  if (action === "SETUP_DELETE") return "SETUP GELÖSCHT";
  if (action === "SETUP_DISPLAY_NAME_UPDATE") return "SETUP-ANZEIGENAME GEÄNDERT";
  if (action === "SETUP_VERSION_UPDATE") return "SETUP-VERSION GEÄNDERT";
  if (action === "PERMISSION_GRANT") return "BERECHTIGUNG HINZUGEFÜGT";
  if (action === "PERMISSION_REVOKE") return "BERECHTIGUNG ENTFERNT";
  return action || "AUDIT EVENT";
}
function addField(fields, name, value, inline = false) {
  const v = clean(value);
  if (v) fields.push({ name, value: v.slice(0, 1024), inline });
}
function discordFields(event) {
  const fields = [];
  addField(fields, "Ausgeführt von", event.discordUserId ? `<@${event.discordUserId}>` : (event.discordAccount || "Unbekannt"));
  if (event.targetDiscordAccount || event.targetDiscordUserId) addField(fields, "Betroffener User", event.targetDiscordUserId ? `<@${event.targetDiscordUserId}>` : (event.targetDiscordAccount || "Unbekannt"));
  addField(fields, "Berechtigung", event.permission, true);
  addField(fields, "Setup", event.setup);
  addField(fields, "Fahrzeug", event.vehicle, true);
  addField(fields, "Strecke", event.track, true);
  addField(fields, "Hersteller", event.manufacturer, true);
  addField(fields, "Version", event.version, true);
  addField(fields, "Alter Wert", event.oldValue, true);
  addField(fields, "Neuer Wert", event.newValue, true);
  addField(fields, "Ergebnis", event.result || "SUCCESS", true);
  return fields;
}
async function writeDiscordAuditEvent(event, env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_AUDIT_CHANNEL_ID) return;
  const actorId = /^\d{16,22}$/.test(String(event.discordUserId || "")) ? String(event.discordUserId) : null;
  const targetId = /^\d{16,22}$/.test(String(event.targetDiscordUserId || "")) ? String(event.targetDiscordUserId) : null;
  const mentionUsers = [...new Set([actorId, targetId].filter(Boolean))];
  const response = await fetch(`${DISCORD_API}/channels/${env.DISCORD_AUDIT_CHANNEL_ID}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{ title: discordTitle(event.action), fields: discordFields(event), timestamp: event.timestamp }],
      allowed_mentions: { parse: [], users: mentionUsers }
    })
  });
  if (!response.ok) throw new Error(`Discord audit write failed (${response.status})`);
}

export async function writeSetupAuditEvent(event, env) {
  if (!env.GITHUB_TOKEN) throw new Error("GitHub audit token unavailable");
  const safe = normalizeEvent({
    ...event,
    manufacturer: event.manufacturer || classifyManufacturer(event.setup),
    track: event.track || inferTrack(event.setup)
  });
  const id = crypto.randomUUID();
  const path = `audit-logs/${safe.timestamp.slice(0, 7)}/${safe.timestamp.replace(/[:.]/g, "-")}-${id}.json`;
  const subject = safe.setup || safe.targetDiscordUserId || safe.vehicle || id;
  const body = {
    message: `Audit ${safe.action}: ${subject}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(safe, null, 2) + "\n"))),
    branch: ghBranch(env)
  };
  const response = await gh(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, env);
  if (!response.ok) throw new Error(`GitHub audit write failed (${response.status})`);
  try { await writeDiscordAuditEvent(safe, env); }
  catch (error) { console.error("Discord audit failed", error instanceof Error ? error.message : "unknown"); }
  return safe;
}
