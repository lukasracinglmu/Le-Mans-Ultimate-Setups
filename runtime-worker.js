import productionWorker from "./ui-hotfix.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/setups.json") {
      const meRequest = new Request(new URL("/api/me", request.url), { method: "GET", headers: request.headers });
      const meResponse = await productionWorker.fetch(meRequest, env, ctx);
      let me = null;
      try { me = await meResponse.json(); } catch {}
      if (!me?.loggedIn) return new Response(JSON.stringify({ success: false, error: "Nicht angemeldet." }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      if (!me?.databaseAccess) return new Response(JSON.stringify({ success: false, error: "Erforderliche Discord-Rolle fehlt." }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

      const owner = env.GITHUB_OWNER || "lukasracinglmu";
      const repo = env.GITHUB_REPO || "Le-Mans-Ultimate-Setups";
      const branch = env.GITHUB_BRANCH || "main";
      const source = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/setups.json`, { cache: "no-store" });
      if (!source.ok) return new Response(JSON.stringify({ success: false, error: "Fahrzeugdaten konnten nicht geladen werden." }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      return new Response(source.body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }

    return productionWorker.fetch(request, env, ctx);
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