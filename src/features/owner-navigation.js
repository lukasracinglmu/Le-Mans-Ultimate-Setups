import { requireOwnerSession } from './auth.js';
import { json } from '../lib/http.js';

const DEFAULT_ORDER = Object.freeze([
	'races',
	'calendar',
	'tickets',
	'panel',
	'request',
	'bug-report',
]);
const VALID_KEYS = new Set(DEFAULT_ORDER);

async function ensureTable(env) {
	if (!env.ACCESS_DB) throw new Error('db');
	await env.ACCESS_DB.prepare(`
		CREATE TABLE IF NOT EXISTS owner_ui_preferences (
			user_id TEXT PRIMARY KEY,
			navigation_order TEXT NOT NULL,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`).run();
}

export async function ownerNavigationPreferences(request, env) {
	const auth = await requireOwnerSession(request, env);
	if (auth.error) return auth.error;
	if (!['GET', 'PUT'].includes(request.method)) {
		return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
	}
	try {
		await ensureTable(env);
		if (request.method === 'GET') {
			const row = await env.ACCESS_DB.prepare(
				'SELECT navigation_order, updated_at FROM owner_ui_preferences WHERE user_id = ?'
			).bind(auth.session.id).first();
			let order = DEFAULT_ORDER;
			if (row?.navigation_order) {
				try {
					const parsed = JSON.parse(row.navigation_order);
					if (Array.isArray(parsed) && parsed.length === DEFAULT_ORDER.length &&
						new Set(parsed).size === DEFAULT_ORDER.length &&
						parsed.every((key) => VALID_KEYS.has(key))) {
						order = parsed;
					}
				} catch {}
			}
			return json({ success: true, navigationOrder: order, updatedAt: row?.updated_at || null });
		}
		let body;
		try {
			body = await request.json();
		} catch {
			return json({ success: false, error: 'Ungültige Anfrage.' }, 400);
		}
		const order = body?.navigationOrder;
		if (!Array.isArray(order) || order.length !== DEFAULT_ORDER.length ||
			new Set(order).size !== DEFAULT_ORDER.length ||
			!order.every((key) => VALID_KEYS.has(key))) {
			return json({ success: false, error: 'Ungültige Navigationsreihenfolge.' }, 400);
		}
		await env.ACCESS_DB.prepare(`
			INSERT INTO owner_ui_preferences (user_id, navigation_order, updated_at)
			VALUES (?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(user_id) DO UPDATE SET
				navigation_order = excluded.navigation_order,
				updated_at = CURRENT_TIMESTAMP
		`).bind(auth.session.id, JSON.stringify(order)).run();
		return json({ success: true, navigationOrder: order });
	} catch (error) {
		console.error('Owner navigation preferences failed', error?.message || error);
		return json({ success: false, error: 'Navigationseinstellungen konnten nicht gespeichert werden.' }, 503);
	}
}
