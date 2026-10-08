import productionWorker from "./ui-hotfix.js";

// Keep the final HTML pass intentionally narrow; all UI behavior lives in ui-hotfix.js.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/setups.json") {
      const owner = env.GITHUB_OWNER || "lukasracinglmu";
      const repo = env.GITHUB_REPO || "Le-Mans-Ultimate-Setups";
      const branch = env.GITHUB_BRANCH || "main";
      const source = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/setups.json`, { cache: "no-store" });
      if (!source.ok) return new Response("{}", { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      return new Response(source.body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
    }

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