import {
  readDisplayName,
  displayNameStatement,
  readStoredDisplayName,
} from "./setup-display-name.js";
import productionWorker from "./production-worker.js";
import { storeSetupVersion } from "./setup-version.js";
import { writeSetupAuditEvent } from "./audit-log.js";
import { githubBranch } from "./config.js";
import { githubRequest } from "./lib/github.js";
import { json, safeJson } from "./lib/http.js";

const DISCORD_API = "https://discord.com/api/v10";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path.startsWith("/api/admin/")) {
      try {
        await ensureAccessSchema(env);
      } catch {
        return json({ success: false, error: "Rechte-Datenbank nicht verfügbar." }, 503);
      }
    }
    if (path === "/api/me" && method === "GET") return augmentedMe(request, env, ctx);
    if (path === "/api/admin/admin-panel-access" && method === "GET")
      return listAdminPanelAccess(request, env, ctx);
    if (path === "/api/admin/admin-panel-access" && (method === "POST" || method === "DELETE"))
      return changeAdminPanelAccess(request, env, ctx);
    if (path === "/api/admin/full-admin-access" && (method === "POST" || method === "DELETE"))
      return changeFullAdminAccess(request, env, ctx);

    if (path === "/api/admin/database-access" && method === "GET")
      return listDatabaseAccess(request, env, ctx);
    if (path === "/api/admin/database-access" && method === "POST")
      return grantDatabaseAccess(request, env, ctx);
    if (path === "/api/admin/database-access" && method === "DELETE")
      return revokeDatabaseAccess(request, env, ctx);
    if (path === "/api/admin/access" && method === "GET")
      return listCombinedAccess(request, env, ctx);

    if (
      (path === "/api/admin/upload-access" || path === "/api/admin/all-access") &&
      (method === "POST" || method === "DELETE")
    ) {
      return changeManagedAccess(request, env, ctx, path === "/api/admin/all-access");
    }

    if (path === "/api/setups/upload" && method === "POST") {
      const permission = await requireUploadDeleteAccess(request, env, ctx);
      if (permission.error) return permission.error;
      const response = await productionWorker.fetch(request, env, ctx);
      if (response.ok) {
        const data = await safeJson(response.clone());
        if (data?.success) {
          const vehicle = cleanPath(data.vehicle),
            version = String(data.version || "");
          for (const item of Array.isArray(data.uploaded) ? data.uploaded : []) {
            if (!item?.name || (data.duplicate && item.alreadyExists)) continue;
            // Finish this audit before the browser writes the next ZIP to the same branch.
            await new Promise((resolve) => setTimeout(resolve, 1100));
            await safeAudit(
              {
                action: "SETUP_UPLOAD",
                discordAccount: permission.user.username,
                discordUserId: permission.user.id,
                setup: item.name,
                vehicle,
                manufacturer: classifyManufacturer(item.name),
                track: inferTrack(item.name),
                version,
                result: "SUCCESS",
              },
              env,
            );
          }
          for (const old of data.retired || []) {
            await new Promise((resolve) => setTimeout(resolve, 1100));
            await safeAudit(
              {
                action: old.action === "delete" ? "SETUP_DELETE" : "SETUP_OUTDATED",
                discordAccount: permission.user.username,
                discordUserId: permission.user.id,
                setup: old.name,
                vehicle,
                manufacturer: classifyManufacturer(old.name),
                track: inferTrack(old.name),
                newValue: old.action === "delete" ? "Ersetzt" : "Veraltet",
                result: "SUCCESS",
              },
              env,
            );
          }
        }
      }
      return response;
    }

    if (path === "/api/setups/version" && method === "POST") {
      const permission = await requireUploadDeleteAccess(request, env, ctx);
      if (permission.error) return permission.error;
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ success: false, error: "Ungültige Anfrage." }, 400);
      }
      const category = cleanPath(body?.category),
        vehicle = cleanPath(body?.vehicle),
        name = cleanPath(body?.name);
      const hasVersion = Object.hasOwn(body, "version"),
        hasName = Object.hasOwn(body, "displayName"),
        hasOutdated = Object.hasOwn(body, "outdated");
      if (!hasVersion && !hasName && !hasOutdated)
        return json({ success: false, error: "Keine Änderung angegeben." }, 400);
      if (hasVersion && typeof body.version !== "string")
        return json({ success: false, error: "Ungültige Version." }, 400);
      if (hasOutdated && typeof body.outdated !== "boolean")
        return json({ success: false, error: "Ungültiger Status." }, 400);
      const version = hasVersion ? body.version.trim() : null;
      if (!category || !vehicle || !name || !/\.zip$/i.test(name))
        return json({ success: false, error: "Ungültiges Setup." }, 400);
      if (hasVersion && (version.length > 40 || /[\u0000-\u001F\u007F]/.test(version)))
        return json({ success: false, error: "Ungültige Version (maximal 40 Zeichen)." }, 400);
      const parsedName = hasName ? readDisplayName(body.displayName) : null;
      if (parsedName?.error) return json({ success: false, error: parsedName.error }, 400);
      if (!env.ACCESS_DB)
        return json({ success: false, error: "Metadaten-Datenbank nicht verfügbar." }, 503);
      const filePath = `/contents/setups/${enc(category)}/${enc(vehicle)}/${enc(name)}?ref=${enc(githubBranch(env))}`;
      let existing;
      try {
        existing = await githubRequest(env, filePath, { signal: AbortSignal.timeout(15000) });
      } catch {
        return json({ success: false, error: "Setup konnte nicht geprüft werden." }, 502);
      }
      if (existing.status === 404)
        return json({ success: false, error: "Setup wurde nicht gefunden." }, 404);
      if (!existing.ok)
        return json({ success: false, error: "Setup konnte nicht geprüft werden." }, 502);
      const file = await safeJson(existing);
      if ((hasName || hasOutdated) && !/^[a-f0-9]{40}$/.test(file?.sha || ""))
        return json({ success: false, error: "Dateistand konnte nicht bestätigt werden." }, 502);
      const oldVersion = await readStoredVersion(category, vehicle, name, env);
      let oldName = null;
      try {
        if (hasName) oldName = await readStoredDisplayName(category, vehicle, name, file.sha, env);
        if (hasVersion && hasName) {
          await env.ACCESS_DB.batch([
            env.ACCESS_DB.prepare(
              "INSERT INTO setup_versions (category, vehicle, file_name, version, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(category, vehicle, file_name) DO UPDATE SET version = excluded.version, updated_at = CURRENT_TIMESTAMP",
            ).bind(category, vehicle, name, version),
            displayNameStatement(env, category, vehicle, name, file.sha, parsedName.displayName),
          ]);
        } else if (hasName)
          await displayNameStatement(
            env,
            category,
            vehicle,
            name,
            file.sha,
            parsedName.displayName,
          ).run();
        else if (hasVersion) await storeSetupVersion(category, vehicle, name, version, env);
        if (hasOutdated)
          await env.ACCESS_DB.prepare(
            "INSERT INTO setup_lifecycle (category, vehicle, file_name, file_sha, outdated, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(category, vehicle, file_name) DO UPDATE SET file_sha = excluded.file_sha, outdated = excluded.outdated, updated_at = CURRENT_TIMESTAMP",
          )
            .bind(category, vehicle, name, file.sha, body.outdated ? 1 : 0)
            .run();
      } catch {
        return json(
          {
            success: false,
            error: "Änderungen konnten nicht gespeichert werden. Bitte erneut versuchen.",
          },
          503,
        );
      }
      runAuditTasks(
        [
          (async () => {
            const common = {
              discordAccount: permission.user.username,
              discordUserId: permission.user.id,
              setup: name,
              vehicle,
              manufacturer: classifyManufacturer(name),
              track: inferTrack(name),
              result: "SUCCESS",
            };
            if (hasVersion && version !== (oldVersion || ""))
              await safeAudit(
                {
                  ...common,
                  action: "SETUP_VERSION_UPDATE",
                  oldValue: oldVersion,
                  newValue: version,
                },
                env,
              );
            if (hasName && parsedName.displayName !== (oldName || ""))
              await safeAudit(
                {
                  ...common,
                  action: "SETUP_DISPLAY_NAME_UPDATE",
                  oldValue: oldName,
                  newValue: parsedName.displayName,
                },
                env,
              );
            if (hasOutdated)
              await safeAudit(
                {
                  ...common,
                  action: body.outdated ? "SETUP_OUTDATED" : "SETUP_OUTDATED_REVERT",
                  oldValue: body.outdated ? "AKTUELL" : "VERALTET",
                  newValue: body.outdated ? "VERALTET" : "AKTUELL",
                },
                env,
              );
          })(),
        ],
        ctx,
      );
      return json({
        success: true,
        category,
        vehicle,
        name,
        version: hasVersion ? version : oldVersion,
        ...(hasName ? { displayName: parsedName.displayName || null } : {}),
        ...(hasOutdated ? { outdated: body.outdated } : {}),
      });
    }

    if (path === "/api/setups/delete" && method === "POST") {
      const permission = await requireUploadDeleteAccess(request, env, ctx);
      if (permission.error) return permission.error;
      const clone = request.clone();
      let meta = { category: "", vehicle: "", name: "", version: null };
      try {
        const body = await clone.json();
        meta.category = cleanPath(body?.category);
        meta.vehicle = cleanPath(body?.vehicle);
        meta.name = cleanPath(body?.name);
        if (meta.category && meta.vehicle && meta.name)
          meta.version = await readStoredVersion(meta.category, meta.vehicle, meta.name, env);
      } catch {}
      const response = await productionWorker.fetch(request, env, ctx);
      if (response.ok) {
        const data = await safeJson(response.clone());
        if (data?.success && data.deleted !== false && meta.name)
          runAuditTasks(
            [
              safeAudit(
                {
                  action: "SETUP_DELETE",
                  discordAccount: permission.user.username,
                  discordUserId: permission.user.id,
                  setup: meta.name,
                  vehicle: meta.vehicle,
                  manufacturer: classifyManufacturer(meta.name),
                  track: inferTrack(meta.name),
                  version: meta.version,
                  result: "SUCCESS",
                },
                env,
              ),
            ],
            ctx,
          );
      }
      return response;
    }

    if ((path === "/api/setups" || path === "/api/setups/download") && method === "GET") {
      // worker.js validates the signed session and database access for both routes.
      // Do not repeat that same Discord/D1 check in every wrapping layer.
      return productionWorker.fetch(request, env, ctx);
    }

    return productionWorker.fetch(request, env, ctx);
  },
};

async function getBaseMe(request, env, ctx, freshRoles = false) {
  const meRequest = new Request(
    new URL(freshRoles ? "/api/me?refresh=1" : "/api/me", request.url),
    { method: "GET", headers: request.headers },
  );
  const response = await productionWorker.fetch(meRequest, env, ctx);
  return safeJson(response);
}

async function augmentedMe(request, env, ctx) {
  return productionWorker.fetch(request, env, ctx);
}

async function ensureAccessSchema(env) {
  if (!env.ACCESS_DB) throw Error("db");
  await env.ACCESS_DB.batch([
    env.ACCESS_DB.prepare(
      "CREATE TABLE IF NOT EXISTS database_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    env.ACCESS_DB.prepare(
      "CREATE TABLE IF NOT EXISTS upload_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    env.ACCESS_DB.prepare(
      "CREATE TABLE IF NOT EXISTS admin_panel_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    env.ACCESS_DB.prepare(
      "CREATE TABLE IF NOT EXISTS full_admin_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
  ]);
}

async function requireOwner(request, env, ctx, capability = "canManageDatabaseAccess") {
  const me = await getBaseMe(request, env, ctx, true);
  if (!me?.loggedIn) return { error: json({ success: false, error: "Nicht angemeldet." }, 401) };
  if (!me.user?.[capability])
    return {
      error: json(
        {
          success: false,
          error:
            me.rolesAvailable === false
              ? "Discord-Rollenprüfung nicht verfügbar."
              : "Keine Admin-Berechtigung.",
        },
        me.rolesAvailable === false ? 503 : 403,
      ),
    };
  return { user: me.user };
}

async function hasUploadGrant(userId, env) {
  if (!userId || !env.ACCESS_DB) return false;
  try {
    const row = await env.ACCESS_DB.prepare(
      "SELECT user_id FROM upload_access WHERE user_id = ? LIMIT 1",
    )
      .bind(String(userId))
      .first();
    return Boolean(row?.user_id);
  } catch {
    return false;
  }
}
async function requireUploadDeleteAccess(request, env, ctx) {
  const me = await getBaseMe(request, env, ctx, true);
  if (!me?.loggedIn || !me.user?.id)
    return { error: json({ success: false, error: "Nicht angemeldet." }, 401) };
  if (!me.user.canUpload)
    return {
      error: json(
        {
          success: false,
          error:
            me.rolesAvailable === false
              ? "Discord-Rollenprüfung nicht verfügbar."
              : "Keine Upload/Delete-Berechtigung.",
          retryable: me.rolesAvailable === false,
        },
        me.rolesAvailable === false ? 503 : 403,
      ),
    };
  return { user: me.user };
}

function validUserId(value) {
  const id = String(value || "").trim();
  return /^\d{16,22}$/.test(id) ? id : null;
}
async function readUserId(request) {
  try {
    return validUserId((await request.json())?.userId);
  } catch {
    return null;
  }
}

async function listAdminPanelAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx);
  if (auth.error) return auth.error;
  const result = await env.ACCESS_DB.prepare(
    "SELECT user_id, granted_by, created_at FROM admin_panel_access ORDER BY created_at DESC",
  ).all();
  return json({ success: true, grants: result.results || [] });
}
async function changeFullAdminAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx, "canManageAdminAccess");
  if (auth.error) return auth.error;
  const userId = await readUserId(request);
  if (!userId) return json({ success: false, error: "Ungültige Discord User ID." }, 400);
  if (request.method === "POST") {
    await env.ACCESS_DB.batch([
      env.ACCESS_DB.prepare(
        "INSERT INTO full_admin_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by, created_at=CURRENT_TIMESTAMP",
      ).bind(userId, auth.user.id),
      env.ACCESS_DB.prepare(
        "INSERT INTO admin_panel_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by, created_at=CURRENT_TIMESTAMP",
      ).bind(userId, auth.user.id),
      env.ACCESS_DB.prepare(
        "INSERT INTO database_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by, created_at=CURRENT_TIMESTAMP",
      ).bind(userId, auth.user.id),
      env.ACCESS_DB.prepare(
        "INSERT INTO upload_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by, created_at=CURRENT_TIMESTAMP",
      ).bind(userId, auth.user.id),
    ]);
    return json({ success: true, userId, fullAdmin: true });
  }
  await env.ACCESS_DB.batch([
    env.ACCESS_DB.prepare("DELETE FROM full_admin_access WHERE user_id=?").bind(userId),
    env.ACCESS_DB.prepare("DELETE FROM admin_panel_access WHERE user_id=?").bind(userId),
  ]);
  return json({ success: true, userId, fullAdmin: false });
}

async function changeAdminPanelAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx);
  if (auth.error) return auth.error;
  const userId = await readUserId(request);
  if (!userId) return json({ success: false, error: "Ungültige Discord User ID." }, 400);
  if (request.method === "POST") {
    await env.ACCESS_DB.prepare(
      "INSERT INTO admin_panel_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by, created_at=CURRENT_TIMESTAMP",
    )
      .bind(userId, auth.user.id)
      .run();
    return json({ success: true, userId, adminPanel: true });
  }
  await env.ACCESS_DB.prepare("DELETE FROM admin_panel_access WHERE user_id=?").bind(userId).run();
  return json({ success: true, userId, adminPanel: false });
}

async function listDatabaseAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx);
  if (auth.error) return auth.error;
  if (!env.ACCESS_DB)
    return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const result = await env.ACCESS_DB.prepare(
    "SELECT user_id, granted_by, created_at FROM database_access ORDER BY created_at DESC",
  ).all();
  return json({ success: true, grants: result.results || [] });
}
async function grantDatabaseAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx);
  if (auth.error) return auth.error;
  if (!env.ACCESS_DB)
    return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const userId = await readUserId(request);
  if (!userId) return json({ success: false, error: "Ungültige Discord User ID." }, 400);
  await env.ACCESS_DB.prepare(
    "INSERT INTO database_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by",
  )
    .bind(userId, auth.user.id)
    .run();
  return json({ success: true, userId });
}
async function revokeDatabaseAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx);
  if (auth.error) return auth.error;
  if (!env.ACCESS_DB)
    return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const userId = await readUserId(request);
  if (!userId) return json({ success: false, error: "Ungültige Discord User ID." }, 400);
  if (await hasUploadGrant(userId, env))
    return json(
      {
        success: false,
        error: "Database Access kann nicht entfernt werden, solange Upload/Delete freigegeben ist.",
      },
      409,
    );
  await env.ACCESS_DB.prepare("DELETE FROM database_access WHERE user_id = ?").bind(userId).run();
  return json({ success: true, userId });
}
async function changeManagedAccess(request, env, ctx, all) {
  const auth = await requireOwner(request, env, ctx, "canManageUploadAccess");
  if (auth.error) return auth.error;
  if (!env.ACCESS_DB)
    return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const userId = await readUserId(request);
  if (!userId) return json({ success: false, error: "Ungültige Discord User ID." }, 400);
  const grant = request.method === "POST";
  const tables = grant
    ? ["database_access", "upload_access"]
    : all
      ? ["upload_access", "database_access"]
      : ["upload_access"];
  const statements = tables.map((table) =>
    grant
      ? env.ACCESS_DB.prepare(
          `INSERT INTO ${table} (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by`,
        ).bind(userId, auth.user.id)
      : env.ACCESS_DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId),
  );
  try {
    await env.ACCESS_DB.batch(statements);
    return json({ success: true, userId });
  } catch {
    return json({ success: false, error: "Freigaben konnten nicht gespeichert werden." }, 503);
  }
}

async function listCombinedAccess(request, env, ctx) {
  const auth = await requireOwner(request, env, ctx);
  if (auth.error) return auth.error;
  if (!env.ACCESS_DB)
    return json({ success: false, error: "Rechte-Datenbank nicht konfiguriert." }, 503);
  const [db, upload, adminPanel, fullAdmin] = await Promise.all([
    env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM database_access").all(),
    env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM upload_access").all(),
    env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM admin_panel_access").all(),
    env.ACCESS_DB.prepare("SELECT user_id, granted_by, created_at FROM full_admin_access").all(),
  ]);
  const users = new Map();
  const ensure = (userId) =>
    users.get(userId) ||
    (() => {
      const item = {
        userId,
        databaseAccess: false,
        uploadAccess: false,
        adminPanelAccess: false,
        fullAdminAccess: false,
        databaseGrantedAt: null,
        uploadGrantedAt: null,
        adminPanelGrantedAt: null,
        fullAdminGrantedAt: null,
      };
      users.set(userId, item);
      return item;
    })();
  for (const row of db.results || []) {
    const item = ensure(row.user_id);
    item.databaseAccess = true;
    item.databaseGrantedAt = row.created_at;
  }
  for (const row of upload.results || []) {
    const item = ensure(row.user_id);
    item.uploadAccess = true;
    item.databaseAccess = true;
    item.uploadGrantedAt = row.created_at;
  }
  for (const row of adminPanel.results || []) {
    const item = ensure(row.user_id);
    item.adminPanelAccess = true;
    item.adminPanelGrantedAt = row.created_at;
  }
  for (const row of fullAdmin.results || []) {
    const item = ensure(row.user_id);
    item.fullAdminAccess = true;
    item.adminPanelAccess = true;
    item.databaseAccess = true;
    item.uploadAccess = true;
    item.fullAdminGrantedAt = row.created_at;
  }
  const out = await Promise.all(
    [...users.values()].map(async (item) => {
      const member = await fetchGuildMember(item.userId, env);
      const discordUser = member?.user ?? null;
      const nick = member?.nick ?? null;
      const guildAvatar = member?.avatar ?? null;
      const globalAvatar = discordUser?.avatar ?? null;
      item.avatar = guildAvatar
        ? `https://cdn.discordapp.com/guilds/${env.DISCORD_GUILD_ID}/users/${item.userId}/avatars/${guildAvatar}.png?size=128`
        : globalAvatar
          ? `https://cdn.discordapp.com/avatars/${item.userId}/${globalAvatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(String(item.userId)) % 6n)}.png`;
      item.username =
        nick || discordUser?.global_name || discordUser?.username || "Unbekannt / nicht verfügbar";
      item.permissions = [
        item.fullAdminAccess ? "FULL_ADMIN" : null,
        item.adminPanelAccess ? "ADMIN_PANEL" : null,
        item.databaseAccess ? "DATABASE" : null,
        item.uploadAccess ? "UPLOAD" : null,
      ].filter(Boolean);
      item.permission = item.permissions.join(" · ");
      return item;
    }),
  );
  out.sort((a, b) => String(a.username).localeCompare(String(b.username), "de"));
  return json({ success: true, users: out });
}
async function fetchGuildMember(userId, env) {
  if (!env.DISCORD_BOT_TOKEN || !userId) return null;
  const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  try {
    if (env.DISCORD_GUILD_ID) {
      const member = await fetch(
        `${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`,
        { headers },
      );
      if (member.ok) return await member.json();
    }
    const user = await fetch(`${DISCORD_API}/users/${userId}`, { headers });
    if (!user.ok) return null;
    return { user: await user.json(), nick: null, avatar: null };
  } catch {
    return null;
  }
}

function enc(value) {
  return encodeURIComponent(String(value));
}
function cleanPath(value) {
  return String(value || "")
    .trim()
    .replace(/[/\\]+/g, "")
    .replace(/\.\./g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "");
}
function classifyManufacturer(name) {
  const n = String(name || "").toUpperCase();
  if (n.includes("HYMO")) return "HYMO";
  if (
    n.includes("BEALIEN") ||
    n.includes("BE_ALIEN") ||
    /(?:^|[^A-Z0-9])BA[12]?(?=$|[^A-Z0-9])/.test(n)
  )
    return "beAlien";
  if (n.includes(" GO") || n.includes("_GO") || /\bGO\b/.test(n)) return "GO";
  return null;
}
function inferTrack(name) {
  return (
    String(name || "")
      .replace(/\.zip$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}
async function readStoredVersion(category, vehicle, name, env) {
  if (!env.ACCESS_DB) return null;
  try {
    const row = await env.ACCESS_DB.prepare(
      "SELECT version FROM setup_versions WHERE category = ? AND vehicle = ? AND file_name = ? LIMIT 1",
    )
      .bind(String(category), String(vehicle), String(name))
      .first();
    return row?.version ?? null;
  } catch {
    return null;
  }
}
async function safeAudit(event, env) {
  try {
    return await writeSetupAuditEvent(event, env);
  } catch (e) {
    console.error("Audit log failed", e instanceof Error ? e.message : "unknown");
    return null;
  }
}
function runAuditTasks(tasks, ctx) {
  const work = Promise.allSettled(tasks);
  if (ctx?.waitUntil) ctx.waitUntil(work);
  else work.catch(() => {});
}
