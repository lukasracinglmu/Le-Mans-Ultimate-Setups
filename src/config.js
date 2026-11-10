/* @file-notes: Liest IDs und Einstellungen aus env. Feste Werte gehören in wrangler.jsonc, nicht in den Code. */

// A missing value disables the related permission or notification instead of
// falling back to a built-in ID. tools/predeploy-check.mjs keeps them set.
function read(env, name) {
	const value = String(env?.[name] ?? '').trim();
	return value || null;
}

export const REQUIRED_VARS = Object.freeze([
	'DISCORD_OWNER_USER_ID',
	'DISCORD_GUILD_ID',
	'DISCORD_DATABASE_ROLE_ID',
	'DISCORD_UPLOAD_ROLE_ID',
	'DISCORD_OWNER_ROLE_ID',
	'DISCORD_CHANNEL_ID',
	'GITHUB_OWNER',
	'GITHUB_REPO',
	'GITHUB_BRANCH',
	'BACKUP_GITHUB_REPO',
	'BACKUP_GITHUB_BRANCH',
	'LMUPORTAL_SCHEDULE_URL',
]);

export const ownerUserId = (env) => read(env, 'DISCORD_OWNER_USER_ID');

// Discord users with fixed Full Admin rights, comma-separated. Empty means nobody.
export const fullAdminUserIds = (env) =>
	(read(env, 'DISCORD_FULL_ADMIN_USER_IDS') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

function repository(owner, repo) {
	return owner && repo ? `${owner}/${repo}` : null;
}

// Repository with the website, setups and audit logs, as "owner/repo".
export const githubRepository = (env) =>
	repository(read(env, 'GITHUB_OWNER'), read(env, 'GITHUB_REPO'));
export const githubBranch = (env) => read(env, 'GITHUB_BRANCH');

// Repository that receives the complete backups, as "owner/repo".
export const backupRepository = (env) =>
	repository(
		read(env, 'BACKUP_GITHUB_OWNER') ?? read(env, 'GITHUB_OWNER'),
		read(env, 'BACKUP_GITHUB_REPO')
	);
export const backupBranch = (env) => read(env, 'BACKUP_GITHUB_BRANCH');

// Role that is mentioned in new setup requests.
export const setupRequestRoleId = (env) =>
	read(env, 'DISCORD_SETUP_REQUEST_ROLE_ID') ?? read(env, 'DISCORD_UPLOAD_ROLE_ID');

// Role whose members may confirm setup requests.
export const setupSupplyRoleId = (env) =>
	read(env, 'DISCORD_UPLOAD_ROLE_ID') ?? read(env, 'DISCORD_ROLE_ID');
