const GITHUB_API = "https://api.github.com";

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
    headers: { ...ghHeaders(env), ...(opts?.headers || {}) }
  });
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
  const body = {
    message: `Audit ${safe.action}: ${safe.setup || safe.vehicle || id}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(safe, null, 2) + "\n"))),
    branch: ghBranch(env)
  };
  const response = await gh(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, env);
  if (!response.ok) throw new Error(`GitHub audit write failed (${response.status})`);
  return safe;
}
