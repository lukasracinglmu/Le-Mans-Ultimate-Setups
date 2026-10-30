/* @file-notes: Schreibt erfolgreiche Rechteänderungen ins Audit-Log. */
import { writeSetupAuditEvent } from '../audit-log.js';
import legacyWorker from '../legacy.js';
import { readMe } from './auth.js';

export const PERMISSION_PATHS = [
	'/api/admin/database-access',
	'/api/admin/upload-access',
	'/api/admin/all-access',
	'/api/admin/admin-panel-access',
	'/api/admin/full-admin-access',
];

// The change itself happens in the older layers; this only records it.
export async function auditPermissionChange(request, env, ctx) {
	const url = new URL(request.url);
	const bodyRequest = request.clone(),
		actor = await readMe(request, env, ctx);
	let targetUserId = null;
	try {
		targetUserId = String((await bodyRequest.json())?.userId || '').trim() || null;
	} catch {}
	const response = await legacyWorker.fetch(request, env, ctx);
	if (response.ok && actor?.loggedIn && actor?.user?.id && targetUserId) {
		let result = null;
		try {
			result = await response.clone().json();
		} catch {}
		if (result?.success) {
			const task = writeSetupAuditEvent(
				permissionAuditEvent(request.method, url.pathname, actor.user, targetUserId),
				env
			).catch(() => {});
			if (ctx?.waitUntil) ctx.waitUntil(task);
		}
	}
	return response;
}

function permissionAuditEvent(method, path, actor, targetUserId) {
	const grant = method === 'POST',
		database = path === '/api/admin/database-access',
		permission =
			path === '/api/admin/full-admin-access'
				? 'FULL_ADMIN_ACCESS'
				: path === '/api/admin/all-access'
					? 'DATABASE_AND_UPLOAD_DELETE_ACCESS'
					: path === '/api/admin/admin-panel-access'
						? 'ADMIN_PANEL_ACCESS'
						: database
							? 'DATABASE_ACCESS'
							: 'UPLOAD_DELETE_ACCESS';
	return {
		action: grant ? 'PERMISSION_GRANT' : 'PERMISSION_REVOKE',
		discordAccount: actor.username || null,
		discordUserId: actor.id,
		targetDiscordUserId: targetUserId,
		permission,
		oldValue: grant ? 'DENIED' : 'GRANTED',
		newValue: grant ? 'GRANTED' : 'DENIED',
		result: 'SUCCESS',
	};
}
