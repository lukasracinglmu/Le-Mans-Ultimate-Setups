import productionWorker from "./access-worker.js";
import { readSiteFile } from "./repo-read.js";
import { writeSetupAuditEvent } from "./audit-log.js";

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

      const source = await readSiteFile(request, env, "setups.json");
      if (!source.ok) return new Response(JSON.stringify({ success: false, error: "Fahrzeugdaten konnten nicht geladen werden." }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      return new Response(source.body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }

    const permissionChange = isPermissionChange(request.method, url.pathname);
    if (permissionChange) {
      const bodyRequest = request.clone();
      const meRequest = new Request(new URL("/api/me", request.url), { method: "GET", headers: request.headers });
      const meResponse = await productionWorker.fetch(meRequest, env, ctx);
      let actor = null;
      try { actor = await meResponse.json(); } catch {}

      let targetUserId = null;
      try { targetUserId = String((await bodyRequest.json())?.userId || "").trim() || null; } catch {}

      const response = await productionWorker.fetch(request, env, ctx);
      if (response.ok && actor?.loggedIn && actor?.user?.id && targetUserId) {
        let result = null;
        try { result = await response.clone().json(); } catch {}
        if (result?.success) {
          const event = permissionAuditEvent(request.method, url.pathname, actor.user, targetUserId);
          const task = writeSetupAuditEvent(event, env).catch(error => console.error("Audit log failed", error instanceof Error ? error.message : "unknown"));
          if (ctx?.waitUntil) ctx.waitUntil(task); else task.catch(() => {});
        }
      }
      return response;
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

function isPermissionChange(method, path) {
  return (method === "POST" || method === "DELETE") && (path === "/api/admin/database-access" || path === "/api/admin/upload-access");
}

function permissionAuditEvent(method, path, actor, targetUserId) {
  const grant = method === "POST";
  const database = path === "/api/admin/database-access";
  const permission = database ? "DATABASE_ACCESS" : "UPLOAD_DELETE_ACCESS";
  return {
    action: grant ? "PERMISSION_GRANT" : "PERMISSION_REVOKE",
    discordAccount: actor.username || null,
    discordUserId: actor.id,
    targetDiscordUserId: targetUserId,
    permission,
    oldValue: grant ? "DENIED" : "GRANTED",
    newValue: grant ? "GRANTED" : "DENIED",
    result: "SUCCESS"
  };
}
