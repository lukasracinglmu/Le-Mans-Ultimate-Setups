/* @file-notes: Ermittelt Discord-Rollen, persönliche Freigaben und daraus abgeleitete Website-Berechtigungen. */
const DEFAULT_OWNER_USER_ID = '1033453785416208564';

export function ownerUserId(env) { return String(env.DISCORD_OWNER_USER_ID || DEFAULT_OWNER_USER_ID); }

export function rolePermissions(userId, roles, env, grants = {}) {
  const hasRole = id => Boolean(id && Array.isArray(roles) && roles.includes(String(id)));
  const isOwner = String(userId) === ownerUserId(env);
  const hasOwnerRole = hasRole(env.DISCORD_OWNER_ROLE_ID);
  const hasSetupSupplyRole = hasRole(env.DISCORD_UPLOAD_ROLE_ID || env.DISCORD_ROLE_ID);
  const hasTeamRole = hasRole(env.DISCORD_DATABASE_ROLE_ID || env.DISCORD_ROLE_ID);

  // Nur der konfigurierte Owner besitzt Full Admin, Wartungsmodus, Backups und Tickets.
  // Die Discord-Owner-Rolle verwaltet ausschließlich Database-/Upload-Freigaben.
  const fullAdmin = isOwner || Boolean(grants.fullAdmin);
  const canManageDatabaseAccess = fullAdmin || hasOwnerRole;
  const canManageUploadAccess = fullAdmin || hasOwnerRole;
  const canUpload = fullAdmin || hasSetupSupplyRole || Boolean(grants.upload);
  const databaseAccess = fullAdmin || hasOwnerRole || hasSetupSupplyRole || hasTeamRole || Boolean(grants.database) || Boolean(grants.upload);
  const canViewAdminPanel = fullAdmin || hasOwnerRole || Boolean(grants.adminPanel);
  return { databaseAccess, canUpload, canViewAdminPanel, isOwner, fullAdmin, canViewTickets:isOwner, isAdmin:canManageDatabaseAccess,
    canManageDatabaseAccess, canManageUploadAccess, canManageAdminAccess:fullAdmin,
    individualDatabaseAccess:Boolean(grants.database), individualUploadAccess:Boolean(grants.upload), individualFullAdmin:Boolean(grants.fullAdmin) };
}

export async function resolvePermissions(userId, env, oauthAccessToken = null) {
  if (String(userId) === ownerUserId(env)) return { ...rolePermissions(userId, [], env), rolesAvailable:true };
  const grant = async table => {
    if (!env.ACCESS_DB) return false;
    try {
      const row=await env.ACCESS_DB.prepare(`SELECT user_id FROM ${table} WHERE user_id = ? LIMIT 1`).bind(String(userId)).first();
      return Boolean(row?.user_id);
    } catch { return false; }
  };
  const member = async () => {
    if (!env.DISCORD_GUILD_ID) return { roles:[], available:false };
    if (env.DISCORD_BOT_TOKEN) {
      try {
        const response=await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/members/${encodeURIComponent(userId)}`, {
          headers:{ Authorization:`Bot ${env.DISCORD_BOT_TOKEN}` }, signal:AbortSignal.timeout(10000)
        });
        if (response.ok) {
          const data=await response.json();
          return { roles:Array.isArray(data.roles)?data.roles:[], available:Array.isArray(data.roles) };
        }
      } catch {}
    }
    if (oauthAccessToken) {
      try {
        const response=await fetch(`https://discord.com/api/v10/users/@me/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/member`, {
          headers:{ Authorization:`Bearer ${oauthAccessToken}` }, signal:AbortSignal.timeout(10000)
        });
        if (response.ok) {
          const data=await response.json();
          return { roles:Array.isArray(data.roles)?data.roles:[], available:Array.isArray(data.roles) };
        }
        if (response.status === 404) return { roles:[], available:true };
      } catch {}
    }
    return { roles:[], available:false };
  };
  const [database,upload,fullAdmin,adminPanel,result]=await Promise.all([grant('database_access'),grant('upload_access'),grant('full_admin_access'),grant('admin_panel_access'),member()]);
  return { ...rolePermissions(userId,result.roles,env,{ database,upload,fullAdmin,adminPanel }), rolesAvailable:result.available };
}

