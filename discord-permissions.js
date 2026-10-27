/* @file-notes: Ermittelt Discord-Rollen, persönliche Freigaben und daraus abgeleitete Website-Berechtigungen. */
const DEFAULT_OWNER_USER_ID = '1033453785416208564';
const ROLE_SNAPSHOT_TTL = 60_000;

export function ownerUserId(env) { return String(env.DISCORD_OWNER_USER_ID || DEFAULT_OWNER_USER_ID); }

export function rolePermissions(userId, roles, env, grants = {}) {
  const hasRole = id => Boolean(id && Array.isArray(roles) && roles.includes(String(id)));
  const isOwner = String(userId) === ownerUserId(env);
  const hasOwnerRole = hasRole(env.DISCORD_OWNER_ROLE_ID);
  const hasSetupSupplyRole = hasRole(env.DISCORD_UPLOAD_ROLE_ID || env.DISCORD_ROLE_ID);
  const hasTeamRole = hasRole(env.DISCORD_DATABASE_ROLE_ID || env.DISCORD_ROLE_ID);

  // Nur der konfigurierte Owner besitzt Wartungsmodus, Backups und Tickets.
  const fullAdmin = isOwner || Boolean(grants.fullAdmin);
  const canManageDatabaseAccess = fullAdmin || hasOwnerRole;
  const canManageUploadAccess = fullAdmin || hasOwnerRole;
  const canUpload = fullAdmin || hasSetupSupplyRole || Boolean(grants.upload);
  const databaseAccess = fullAdmin || hasOwnerRole || hasSetupSupplyRole || hasTeamRole || Boolean(grants.database) || Boolean(grants.upload);
  const canViewAdminPanel = fullAdmin || hasOwnerRole || Boolean(grants.adminPanel);
  return { databaseAccess, canUpload, canViewAdminPanel, isOwner, fullAdmin, canViewTickets:isOwner, isAdmin:canManageDatabaseAccess,
    canManageDatabaseAccess, canManageUploadAccess, canManageAdminAccess:isOwner, canViewBackups:isOwner, canManageMaintenance:isOwner,
    individualDatabaseAccess:Boolean(grants.database), individualUploadAccess:Boolean(grants.upload), individualFullAdmin:Boolean(grants.fullAdmin) };
}

const roleConfiguration = env => [env.DISCORD_GUILD_ID,env.DISCORD_DATABASE_ROLE_ID||env.DISCORD_ROLE_ID,env.DISCORD_UPLOAD_ROLE_ID||env.DISCORD_ROLE_ID,env.DISCORD_OWNER_ROLE_ID].map(value=>String(value||'')).join(':');

// Only pass a snapshot from readSession(), after its HMAC signature was verified.
// Cache roles, never manual grants: removing a personal grant takes effect immediately.
function validSnapshot(snapshot,userId,env) {
  const age=Date.now()-Number(snapshot?.checkedAt);
  return snapshot?.userId===String(userId)&&snapshot?.configuration===roleConfiguration(env)&&
    Array.isArray(snapshot.roles)&&snapshot.roles.every(id=>typeof id==='string')&&age>=0&&age<ROLE_SNAPSHOT_TTL;
}
function snapshotFor(userId,roles,env) {
  const relevant=new Set([env.DISCORD_DATABASE_ROLE_ID||env.DISCORD_ROLE_ID,env.DISCORD_UPLOAD_ROLE_ID||env.DISCORD_ROLE_ID,env.DISCORD_OWNER_ROLE_ID].filter(Boolean).map(String));
  return {userId:String(userId),configuration:roleConfiguration(env),roles:roles.filter(id=>relevant.has(id)),checkedAt:Date.now()};
}

async function readMember(userId,env,oauthAccessToken) {
  if(!env.DISCORD_GUILD_ID)return {roles:[],available:false,error:'GUILD_NOT_CONFIGURED',reauthorize:false};
  let reauthorize=!oauthAccessToken;
  let error='DISCORD_UNAVAILABLE';
  let retryAfterMs=0;
  const sources=[];
  // A user token avoids routing all website traffic through one shared bot limit.
  if(oauthAccessToken)sources.push({name:'oauth',path:'/users/@me/guilds/'+encodeURIComponent(env.DISCORD_GUILD_ID)+'/member',authorization:'Bearer '+oauthAccessToken});
  if(env.DISCORD_BOT_TOKEN)sources.push({name:'bot',path:'/guilds/'+encodeURIComponent(env.DISCORD_GUILD_ID)+'/members/'+encodeURIComponent(userId),authorization:'Bot '+env.DISCORD_BOT_TOKEN});
  for(const source of sources) {
    try {
      const response=await fetch('https://discord.com/api/v10'+source.path,{headers:{Authorization:source.authorization},signal:AbortSignal.timeout(8000)});
      const data=await response.json().catch(()=>null);
      if(response.ok&&Array.isArray(data?.roles)&&(!data.user?.id||String(data.user.id)===String(userId))) {
        return {roles:data.roles.filter(id=>typeof id==='string'),available:true,source:source.name,error:null,reauthorize:false};
      }
      // Unknown Member is an authoritative denial; an inaccessible guild is not.
      if(response.status===404&&(source.name==='oauth'||data?.code===10007))return {roles:[],available:true,source:source.name,error:'NOT_MEMBER',reauthorize:false};
      if(source.name==='oauth'&&(response.status===401||response.status===403))reauthorize=true;
      if(response.status===429){const seconds=Number(response.headers.get('Retry-After')||data?.retry_after||1);retryAfterMs=Math.max(retryAfterMs,Math.ceil((Number.isFinite(seconds)?seconds:1)*1000));}
      error=response.status===429?'RATE_LIMITED':response.status===401?'DISCORD_AUTH_FAILED':response.status===403?'DISCORD_ACCESS_DENIED':'DISCORD_UNAVAILABLE';
      console.warn('Discord role lookup failed',{source:source.name,status:response.status,code:Number(data?.code)||null});
    } catch {
      error='DISCORD_UNAVAILABLE';
      console.warn('Discord role lookup unavailable',{source:source.name});
    }
  }
  return {roles:[],available:false,error:retryAfterMs?'RATE_LIMITED':error,reauthorize,retryAfterMs};
}

export async function resolvePermissions(userId, env, oauthAccessToken = null, verifiedSnapshot = null) {
  if (String(userId) === ownerUserId(env)) return { ...rolePermissions(userId, [], env), rolesAvailable:true };
  const grant = async table => {
    if (!env.ACCESS_DB) return false;
    try {
      const row=await env.ACCESS_DB.prepare('SELECT user_id FROM '+table+' WHERE user_id = ? LIMIT 1').bind(String(userId)).first();
      return Boolean(row?.user_id);
    } catch { return false; }
  };
  const cached=validSnapshot(verifiedSnapshot,userId,env);
  const member=cached?Promise.resolve({roles:verifiedSnapshot.roles,available:true,source:'session',error:null,reauthorize:false}):readMember(userId,env,oauthAccessToken);
  const [database,upload,fullAdmin,adminPanel,result]=await Promise.all([grant('database_access'),grant('upload_access'),grant('full_admin_access'),grant('admin_panel_access'),member]);
  return {...rolePermissions(userId,result.roles,env,{database,upload,fullAdmin,adminPanel}),
    rolesAvailable:result.available,roleSource:result.source||null,roleCheckError:result.error||null,reauthorize:!result.available&&result.reauthorize,retryAfterMs:result.retryAfterMs||0,
    memberSnapshot:result.available?(cached?verifiedSnapshot:snapshotFor(userId,result.roles,env)):null};
}
