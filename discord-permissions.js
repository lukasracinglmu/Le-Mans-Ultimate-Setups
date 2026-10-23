const DEFAULT_OWNER_USER_ID = '1033453785416208564';

export function ownerUserId(env) { return String(env.DISCORD_OWNER_USER_ID || DEFAULT_OWNER_USER_ID); }

export function rolePermissions(userId, roles, env, grants = {}) {
  const hasRole = id => Boolean(id && Array.isArray(roles) && roles.includes(String(id)));
  const isOwner = String(userId) === ownerUserId(env);
  const fullAdmin = isOwner || Boolean(grants.fullAdmin);
  const canManageDatabaseAccess = fullAdmin || hasRole(env.DISCORD_OWNER_ROLE_ID);
  const canUpload = fullAdmin || Boolean(grants.upload) || hasRole(env.DISCORD_UPLOAD_ROLE_ID || env.DISCORD_ROLE_ID);
  const databaseAccess = canUpload || canManageDatabaseAccess || Boolean(grants.database) || hasRole(env.DISCORD_DATABASE_ROLE_ID || env.DISCORD_ROLE_ID);
  return { databaseAccess, canUpload, isOwner, fullAdmin, canViewTickets:fullAdmin, isAdmin:canManageDatabaseAccess,
    canManageDatabaseAccess, canManageUploadAccess:canManageDatabaseAccess,
    individualDatabaseAccess:Boolean(grants.database), individualUploadAccess:Boolean(grants.upload), individualFullAdmin:Boolean(grants.fullAdmin) };
}

export async function resolvePermissions(userId, env) {
  if (String(userId) === ownerUserId(env)) return { ...rolePermissions(userId, [], env), rolesAvailable:true };
  const grant = async table => {
    if (!env.ACCESS_DB) return false;
    try {
      const row=await env.ACCESS_DB.prepare(`SELECT user_id FROM ${table} WHERE user_id = ? LIMIT 1`).bind(String(userId)).first();
      return Boolean(row?.user_id);
    } catch { return false; }
  };
  const member = async () => {
    if (!env.DISCORD_GUILD_ID || !env.DISCORD_BOT_TOKEN) return { roles:[], available:false };
    try {
      const response=await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/members/${encodeURIComponent(userId)}`, {
        headers:{ Authorization:`Bot ${env.DISCORD_BOT_TOKEN}` }, signal:AbortSignal.timeout(10000)
      });
      if (response.status === 404) return { roles:[], available:true };
      if (!response.ok) return { roles:[], available:false };
      const data=await response.json();
      return { roles:Array.isArray(data.roles)?data.roles:[], available:Array.isArray(data.roles) };
    } catch { return { roles:[], available:false }; }
  };
  const [database,upload,fullAdmin,result]=await Promise.all([grant('database_access'),grant('upload_access'),grant('full_admin_access'),member()]);
  return { ...rolePermissions(userId,result.roles,env,{ database,upload,fullAdmin }), rolesAvailable:result.available };
}
