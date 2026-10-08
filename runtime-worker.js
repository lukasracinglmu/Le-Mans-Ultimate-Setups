import productionWorker from "./ui-hotfix.js";

const enc = value => encodeURIComponent(value);
const cleanPathPart = value => String(value || "").trim().replace(/[/\\]+/g, "").replace(/\.\./g, "").replace(/[\u0000-\u001F\u007F]/g, "");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

function classifySetup(name, vehicle) {
  const file = String(name || "");
  const variant = /(^|[^a-z0-9])evo([^a-z0-9]|$)/i.test(file) ? "EVO" : "Standard";
  let series = null;
  if (/oreca\s*0?7/i.test(String(vehicle || ""))) {
    if (/(^|[^a-z0-9])elms([^a-z0-9]|$)/i.test(file)) series = "ELMS";
    else if (/(^|[^a-z0-9])wec([^a-z0-9]|$)/i.test(file)) series = "WEC";
    else series = "Other";
  }
  return { variant, series };
}

async function publicSetupList(url, env) {
  const category = cleanPathPart(url.searchParams.get("category"));
  const vehicle = cleanPathPart(url.searchParams.get("vehicle"));
  if (!category || !vehicle) return json({ success: false, error: "Fahrzeug fehlt." }, 400);
  const owner = env.GITHUB_OWNER || "lukasracinglmu";
  const repo = env.GITHUB_REPO || "Le-Mans-Ultimate-Setups";
  const branch = env.GITHUB_BRANCH || "main";
  const apiPath = `https://api.github.com/repos/${enc(owner)}/${enc(repo)}/contents/setups/${enc(category)}/${enc(vehicle)}?ref=${enc(branch)}`;
  const headers = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Three-Peaks-Racing-Setup-Database/1.0" };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const response = await fetch(apiPath, { headers, cache: "no-store" });
  if (response.status === 404) return json({ success: true, setups: [] });
  if (!response.ok) return json({ success: false, error: "Setups konnten nicht geladen werden." }, 502);
  const items = await response.json();
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  const setups = (Array.isArray(items) ? items : [])
    .filter(item => item?.type === "file" && /\.zip$/i.test(item.name || ""))
    .map(item => ({ name: item.name, sha: item.sha, download: `${rawBase}/${String(item.path).split("/").map(enc).join("/")}`, ...classifySetup(item.name, vehicle) }))
    .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" }));
  return json({ success: true, setups });
}

// Keep the final HTML pass intentionally narrow; all UI behavior lives in ui-hotfix.js.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/setups.json") {
      const owner = env.GITHUB_OWNER || "lukasracinglmu";
      const repo = env.GITHUB_REPO || "Le-Mans-Ultimate-Setups";
      const branch = env.GITHUB_BRANCH || "main";
      const source = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/setups.json`, { cache: "no-store" });
      if (!source.ok) return json({}, 502);
      return new Response(source.body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
    }

    if (request.method === "GET" && url.pathname === "/api/setups") return publicSetupList(url, env);

    const response = await productionWorker.fetch(request, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (request.method !== "GET" || url.pathname !== "/" || !type.includes("text/html")) return response;

    const html = (await response.text()).replace(
      "observe(categories,{childList:true,subtree:true})",
      "observe(categories,{childList:true,subtree:false})"
    );
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  },

  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      try {
        if (typeof message.ack === "function") message.ack();
      } catch (error) {
        console.error("Queue consumer failed", error instanceof Error ? error.name : "unknown");
        if (typeof message.retry === "function") message.retry({ delaySeconds: 10 });
      }
    }
  }
};