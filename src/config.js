/* @file-notes: Liest IDs und Einstellungen aus env. Feste Werte gehören in wrangler.jsonc, nicht in den Code. */

// A missing value disables the related permission or notification instead of
// falling back to a built-in ID. tools/predeploy-check.mjs keeps them set.
function read(env, name) {
  const value = String(env?.[name] ?? "").trim();
  return value || null;
}

export const REQUIRED_VARS = Object.freeze([
  "DISCORD_OWNER_USER_ID",
  "DISCORD_GUILD_ID",
  "DISCORD_DATABASE_ROLE_ID",
  "DISCORD_UPLOAD_ROLE_ID",
  "DISCORD_OWNER_ROLE_ID",
  "DISCORD_CHANNEL_ID",
]);

export const ownerUserId = (env) => read(env, "DISCORD_OWNER_USER_ID");

// Role that is mentioned in new setup requests.
export const setupRequestRoleId = (env) =>
  read(env, "DISCORD_SETUP_REQUEST_ROLE_ID") ?? read(env, "DISCORD_UPLOAD_ROLE_ID");

// Role whose members may confirm setup requests.
export const setupSupplyRoleId = (env) =>
  read(env, "DISCORD_UPLOAD_ROLE_ID") ?? read(env, "DISCORD_ROLE_ID");
