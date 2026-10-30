import { mapProfiles } from './discord-profile.js';
import { setFullAdminAccess } from './managed-grants.js';
/* @file-notes: Verwaltet Full-Admin-Freigaben, Owner-only-Einstellungen und den Wartungsmodus. */
import { writeSetupAuditEvent } from './audit-log.js';
import { ownerUserId } from './config.js';
import { createManualBackup, backupOverview, backupJobStatus } from './automatic-backup.js';
import { json } from './lib/http.js';
const validUserId = (v) => (/^\d{16,22}$/.test(String(v || '').trim()) ? String(v).trim() : null);

async function ensure(env) {
	if (!env.ACCESS_DB) throw Error('db');
	await env.ACCESS_DB.prepare(
		`CREATE TABLE IF NOT EXISTS full_admin_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, username TEXT)`
	).run();
	try {
		await env.ACCESS_DB.prepare('ALTER TABLE full_admin_access ADD COLUMN username TEXT').run();
	} catch {}
}
async function ownerOnly(request, env, ctx, legacyWorker) {
	const r = await legacyWorker.fetch(
		new Request(new URL('/api/me', request.url), { headers: request.headers }),
		env,
		ctx
	);
	const me = await r.json().catch(() => null);
	if (!me?.loggedIn) return { error: json({ success: false, error: 'Nicht angemeldet.' }, 401) };
	const configuredOwner = String(me.user?.id) === ownerUserId(env);
	if (!configuredOwner && !me.user?.isOwner && !me.user?.fullAdmin)
		return {
			error: json(
				{ success: false, error: 'Nur Full-Admins dürfen diese Einstellungen verwalten.' },
				403
			),
		};
	return {
		user: {
			...me.user,
			isOwner: configuredOwner || Boolean(me.user?.isOwner),
			fullAdmin: configuredOwner || Boolean(me.user?.fullAdmin),
		},
	};
}
export async function isMaintenanceActive(env) {
	try {
		const row = await env.ACCESS_DB?.prepare(
			"SELECT value FROM site_settings WHERE key='maintenance'"
		).first();
		return row?.value === '1';
	} catch {
		return false;
	}
}
export async function maintenanceState(env) {
	try {
		const rows = await env.ACCESS_DB?.prepare(
			"SELECT key,value FROM site_settings WHERE key IN ('maintenance','maintenance_message')"
		).all();
		const out = Object.fromEntries((rows?.results || []).map((x) => [x.key, x.value]));
		return {
			enabled: out.maintenance === '1',
			message:
				out.maintenance_message ||
				'Die Website ist momentan wegen Wartungsarbeiten nicht erreichbar.',
		};
	} catch {
		return { enabled: false, message: '' };
	}
}
export async function fullAdminApi(request, env, ctx, legacyWorker) {
	const path = new URL(request.url).pathname;
	const auth = await ownerOnly(request, env, ctx, legacyWorker);
	if (auth.error) return auth.error;
	if (path === '/api/admin/maintenance' && String(auth.user?.id) !== ownerUserId(env))
		return json({ success: false, error: 'Nur der Owner darf den Wartungsmodus verwalten.' }, 403);
	try {
		await ensure(env);
		await env.ACCESS_DB.prepare(
			`CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)`
		).run();
	} catch {
		return json({ success: false, error: 'Rechte-Datenbank nicht verfügbar.' }, 503);
	}
	if (path === '/api/admin/backup') {
		if (String(auth.user?.id) !== ownerUserId(env))
			return json({ success: false, error: 'Nur der Owner darf Backups erstellen.' }, 403);
		if (request.method !== 'POST')
			return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
		try {
			const backup = await createManualBackup(env);
			return json(backup, backup.success ? (backup.queued ? 202 : 200) : 503);
		} catch (error) {
			console.error('Manual backup failed', error?.message || error);
			return json(
				{
					success: false,
					error: 'Backup konnte nicht erstellt werden.',
					detail: String(error?.message || 'unbekannter Fehler').slice(0, 240),
				},
				503
			);
		}
	}
	if (path === '/api/admin/backups') {
		if (String(auth.user?.id) !== ownerUserId(env))
			return json({ success: false, error: 'Nur der Owner darf Backups sehen.' }, 403);
		if (request.method !== 'GET')
			return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
		try {
			const id = new URL(request.url).searchParams.get('job');
			if (id) {
				const job = await backupJobStatus(env, id);
				return job
					? json({ success: true, job })
					: json({ success: false, error: 'Backup-Auftrag nicht gefunden.' }, 404);
			}
			return json(await backupOverview(env));
		} catch {
			return json({ success: false, error: 'Backups konnten nicht geladen werden.' }, 503);
		}
	}
	if (path === '/api/admin/maintenance') {
		if (request.method === 'GET') return json({ success: true, ...(await maintenanceState(env)) });
		if (request.method !== 'POST')
			return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
		let body;
		try {
			body = await request.json();
		} catch {
			return json({ success: false, error: 'Ungültige Anfrage.' }, 400);
		}
		const message = String(body?.message || '')
			.trim()
			.slice(0, 500);
		await env.ACCESS_DB.batch([
			env.ACCESS_DB.prepare(
				"INSERT INTO site_settings (key,value) VALUES ('maintenance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
			).bind(body?.enabled ? '1' : '0'),
			env.ACCESS_DB.prepare(
				"INSERT INTO site_settings (key,value) VALUES ('maintenance_message',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
			).bind(message || 'Die Website ist momentan wegen Wartungsarbeiten nicht erreichbar.'),
		]);
		return json({ success: true, enabled: Boolean(body?.enabled), message });
	}
	if (request.method === 'GET') {
		const r = await env.ACCESS_DB.prepare(
			'SELECT user_id,granted_by,created_at FROM full_admin_access ORDER BY created_at DESC'
		).all();
		const rows = r.results || [];
		const profiles = await mapProfiles(rows, env);
		const grants = rows.map((row, index) => {
			const profile = profiles[index];
			return {
				...row,
				username: profile?.username || row.username || null,
				avatar: profile?.avatar || null,
			};
		});
		return json({ success: true, grants });
	}
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Ungültige Anfrage.' }, 400);
	}
	const userId = validUserId(body?.userId);
	if (!userId) return json({ success: false, error: 'Ungültige Discord User ID.' }, 400);
	if (userId === String(auth.user.id))
		return json(
			{ success: false, error: 'Deine Haupt-Admin-Rechte können hier nicht geändert werden.' },
			400
		);
	if (request.method === 'POST') {
		await setFullAdminAccess(env, userId, auth.user.id, true);
		const event = {
			action: 'PERMISSION_GRANT',
			discordAccount: auth.user.username || null,
			discordUserId: auth.user.id,
			targetDiscordUserId: userId,
			permission: 'FULL_ADMIN_ACCESS',
			oldValue: 'DENIED',
			newValue: 'GRANTED',
			result: 'SUCCESS',
		};
		ctx?.waitUntil?.(writeSetupAuditEvent(event, env).catch(() => {}));
		return json({ success: true, userId, fullAdmin: true });
	}
	if (request.method === 'DELETE') {
		await setFullAdminAccess(env, userId, auth.user.id, false);
		const event = {
			action: 'PERMISSION_REVOKE',
			discordAccount: auth.user.username || null,
			discordUserId: auth.user.id,
			targetDiscordUserId: userId,
			permission: 'FULL_ADMIN_ACCESS',
			oldValue: 'GRANTED',
			newValue: 'DENIED',
			result: 'SUCCESS',
		};
		ctx?.waitUntil?.(writeSetupAuditEvent(event, env).catch(() => {}));
		return json({ success: true, userId, fullAdmin: false });
	}
	return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
}
