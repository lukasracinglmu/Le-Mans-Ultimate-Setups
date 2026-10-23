import { submitBugReport } from "./bug-reports.js";
import productionWorker from "./access-worker.js";
import { readSiteFile } from "./repo-read.js";
import { writeSetupAuditEvent } from "./audit-log.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if(url.pathname==='/bug-report'&&request.method==='GET'){
      const source=await readSiteFile(request,env,'bug-report.html');
      const headers=new Headers(source.headers);headers.set('Content-Type',source.ok?'text/html; charset=utf-8':'text/plain; charset=utf-8');headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");return new Response(source.body,{status:source.status,headers});
    }
    if(url.pathname==='/api/bug-reports'){
      if(request.method!=='POST')return Response.json({success:false,error:'Methode nicht erlaubt.'},{status:405,headers:{'Cache-Control':'no-store'}});
      const meResponse=await productionWorker.fetch(new Request(new URL('/api/me',request.url),{headers:request.headers}),env,ctx);
      const me=await meResponse.json().catch(()=>null);
      return submitBugReport(request,me?.loggedIn?me.user:null,env);
    }

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
  return (method === "POST" || method === "DELETE") && (path === "/api/admin/database-access" || path === "/api/admin/upload-access" || path === "/api/admin/all-access");
}

function permissionAuditEvent(method, path, actor, targetUserId) {
  const grant = method === "POST";
  const database = path === "/api/admin/database-access";
  const permission = path === "/api/admin/all-access" ? "DATABASE_AND_UPLOAD_DELETE_ACCESS" : database ? "DATABASE_ACCESS" : "UPLOAD_DELETE_ACCESS";
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
