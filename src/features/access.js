/* @file-notes: Verwaltet persönliche Freigaben: Database, Upload/Delete, Admin-Panel und Full Admin. */
import { mapProfiles } from '../discord-profile.js';
import { json } from '../lib/http.js';
import { setFullAdminAccess } from '../managed-grants.js';
import { readMe, requireOwnerSession } from './auth.js';

// The grant tables are still created at runtime; issue #8 moves them into migrations.
async function ensureAccessSchema(env) {
	if (!env.ACCESS_DB) throw Error('db');
	await env.ACCESS_DB.batch([
		env.ACCESS_DB.prepare(
			'CREATE TABLE IF NOT EXISTS database_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
		),
		env.ACCESS_DB.prepare(
			'CREATE TABLE IF NOT EXISTS upload_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
		),
		env.ACCESS_DB.prepare(
			'CREATE TABLE IF NOT EXISTS admin_panel_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
		),
		env.ACCESS_DB.prepare(
			'CREATE TABLE IF NOT EXISTS full_admin_access (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
		),
	]);
}

// Every /api/admin/* request that reaches the grant APIs first makes sure the tables exist.
export function withAccessSchema(handler) {
	return async (request, env, ctx) => {
		try {
			await ensureAccessSchema(env);
		} catch {
			return json({ success: false, error: 'Rechte-Datenbank nicht verfügbar.' }, 503);
		}
		return handler(request, env, ctx);
	};
}

async function requireOwner(request, env, capability = 'canManageDatabaseAccess') {
	const me = await readMe(request, env, { refresh: true });
	if (!me?.loggedIn) return { error: json({ success: false, error: 'Nicht angemeldet.' }, 401) };
	if (!me.user?.[capability])
		return {
			error: json(
				{
					success: false,
					error:
						me.rolesAvailable === false
							? 'Discord-Rollenprüfung nicht verfügbar.'
							: 'Keine Admin-Berechtigung.',
				},
				me.rolesAvailable === false ? 503 : 403
			),
		};
	return { user: me.user };
}

async function hasUploadGrant(userId, env) {
	if (!userId || !env.ACCESS_DB) return false;
	try {
		const row = await env.ACCESS_DB.prepare(
			'SELECT user_id FROM upload_access WHERE user_id = ? LIMIT 1'
		)
			.bind(String(userId))
			.first();
		return Boolean(row?.user_id);
	} catch {
		return false;
	}
}

function validUserId(value) {
	const id = String(value || '').trim();
	return /^\d{16,22}$/.test(id) ? id : null;
}

async function readUserId(request) {
	try {
		return validUserId((await request.json())?.userId);
	} catch {
		return null;
	}
}

export async function listAdminPanelAccess(request, env) {
	const auth = await requireOwner(request, env);
	if (auth.error) return auth.error;
	const result = await env.ACCESS_DB.prepare(
		'SELECT user_id, granted_by, created_at FROM admin_panel_access ORDER BY created_at DESC'
	).all();
	return json({ success: true, grants: result.results || [] });
}

export async function changeFullAdminAccess(request, env) {
	const auth = await requireOwner(request, env, 'canManageAdminAccess');
	if (auth.error) return auth.error;
	const userId = await readUserId(request);
	if (!userId) return json({ success: false, error: 'Ungültige Discord User ID.' }, 400);
	if (userId === String(auth.user.id))
		return json(
			{ success: false, error: 'Deine Haupt-Admin-Rechte können hier nicht geändert werden.' },
			400
		);
	await setFullAdminAccess(env, userId, auth.user.id, request.method === 'POST');
	return json({ success: true, userId, fullAdmin: request.method === 'POST' });
}

export async function changeAdminPanelAccess(request, env) {
	const auth = await requireOwner(request, env, 'canManageAdminAccess');
	if (auth.error) return auth.error;
	const userId = await readUserId(request);
	if (!userId) return json({ success: false, error: 'Ungültige Discord User ID.' }, 400);
	if (request.method === 'POST') {
		await env.ACCESS_DB.prepare(
			'INSERT INTO admin_panel_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by, created_at=CURRENT_TIMESTAMP'
		)
			.bind(userId, auth.user.id)
			.run();
		return json({ success: true, userId, adminPanel: true });
	}
	await env.ACCESS_DB.prepare('DELETE FROM admin_panel_access WHERE user_id=?').bind(userId).run();
	return json({ success: true, userId, adminPanel: false });
}

export async function listDatabaseAccess(request, env) {
	const auth = await requireOwner(request, env);
	if (auth.error) return auth.error;
	if (!env.ACCESS_DB)
		return json({ success: false, error: 'Rechte-Datenbank nicht konfiguriert.' }, 503);
	const result = await env.ACCESS_DB.prepare(
		'SELECT user_id, granted_by, created_at FROM database_access ORDER BY created_at DESC'
	).all();
	return json({ success: true, grants: result.results || [] });
}

export async function grantDatabaseAccess(request, env) {
	const auth = await requireOwner(request, env);
	if (auth.error) return auth.error;
	if (!env.ACCESS_DB)
		return json({ success: false, error: 'Rechte-Datenbank nicht konfiguriert.' }, 503);
	const userId = await readUserId(request);
	if (!userId) return json({ success: false, error: 'Ungültige Discord User ID.' }, 400);
	await env.ACCESS_DB.prepare(
		'INSERT INTO database_access (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by'
	)
		.bind(userId, auth.user.id)
		.run();
	return json({ success: true, userId });
}

export async function revokeDatabaseAccess(request, env) {
	const auth = await requireOwner(request, env);
	if (auth.error) return auth.error;
	if (!env.ACCESS_DB)
		return json({ success: false, error: 'Rechte-Datenbank nicht konfiguriert.' }, 503);
	const userId = await readUserId(request);
	if (!userId) return json({ success: false, error: 'Ungültige Discord User ID.' }, 400);
	if (await hasUploadGrant(userId, env))
		return json(
			{
				success: false,
				error: 'Database Access kann nicht entfernt werden, solange Upload/Delete freigegeben ist.',
			},
			409
		);
	await env.ACCESS_DB.prepare('DELETE FROM database_access WHERE user_id = ?').bind(userId).run();
	return json({ success: true, userId });
}

// Unlike the other grant lists, only the configured owner may read this one.
export async function listUploadAccess(request, env) {
	const auth = await requireOwnerSession(request, env);
	if (auth.error) return auth.error;
	if (!env.ACCESS_DB)
		return json({ success: false, error: 'Rechte-Datenbank nicht konfiguriert.' }, 503);
	const result = await env.ACCESS_DB.prepare(
		'SELECT user_id, granted_by, created_at FROM upload_access ORDER BY created_at DESC'
	).all();
	return json({ success: true, grants: result.results || [] });
}

export async function changeManagedAccess(request, env, all) {
	const auth = await requireOwner(request, env, 'canManageUploadAccess');
	if (auth.error) return auth.error;
	if (!env.ACCESS_DB)
		return json({ success: false, error: 'Rechte-Datenbank nicht konfiguriert.' }, 503);
	const userId = await readUserId(request);
	if (!userId) return json({ success: false, error: 'Ungültige Discord User ID.' }, 400);
	const grant = request.method === 'POST';
	const tables = grant
		? ['database_access', 'upload_access']
		: all
			? ['upload_access', 'database_access']
			: ['upload_access'];
	const statements = tables.map((table) =>
		grant
			? env.ACCESS_DB.prepare(
					`INSERT INTO ${table} (user_id, granted_by, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by = excluded.granted_by`
				).bind(userId, auth.user.id)
			: env.ACCESS_DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId)
	);
	try {
		await env.ACCESS_DB.batch(statements);
		return json({ success: true, userId });
	} catch {
		return json({ success: false, error: 'Freigaben konnten nicht gespeichert werden.' }, 503);
	}
}

export async function listCombinedAccess(request, env) {
	const auth = await requireOwner(request, env);
	if (auth.error) return auth.error;
	if (!env.ACCESS_DB)
		return json({ success: false, error: 'Rechte-Datenbank nicht konfiguriert.' }, 503);
	const [db, upload, adminPanel, fullAdmin] = await Promise.all([
		env.ACCESS_DB.prepare('SELECT user_id, granted_by, created_at FROM database_access').all(),
		env.ACCESS_DB.prepare('SELECT user_id, granted_by, created_at FROM upload_access').all(),
		env.ACCESS_DB.prepare('SELECT user_id, granted_by, created_at FROM admin_panel_access').all(),
		env.ACCESS_DB.prepare('SELECT user_id, granted_by, created_at FROM full_admin_access').all(),
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
	const items = [...users.values()];
	const profiles = await mapProfiles(items, env, (item) => item.userId);
	const out = items.map((item, index) => {
		const profile = profiles[index];
		item.avatar = profile?.avatar || null;
		item.username = profile?.username || 'Unbekannt / nicht verfügbar';
		item.permissions = [
			item.fullAdminAccess ? 'FULL_ADMIN' : null,
			item.adminPanelAccess ? 'ADMIN_PANEL' : null,
			item.databaseAccess ? 'DATABASE' : null,
			item.uploadAccess ? 'UPLOAD' : null,
		].filter(Boolean);
		item.permission = item.permissions.join(' · ');
		return item;
	});
	out.sort((a, b) => String(a.username).localeCompare(String(b.username), 'de'));
	return json({ success: true, users: out });
}
