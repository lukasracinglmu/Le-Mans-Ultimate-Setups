import { requireOwnerSession } from './auth.js';
import { json } from '../lib/http.js';

const DEFAULT_ORDER = ['/calendar', '/bug-tickets', '/admin', '/request', '/bug-report'];
const VALID = new Set(DEFAULT_ORDER);

async function ensureTable(db) {
	await db.prepare(
		'CREATE TABLE IF NOT EXISTS owner_ui_preferences (user_id TEXT PRIMARY KEY, navigation_order TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
	).run();
}

export async function ownerNavigationPreferences(request, env) {
	const auth = await requireOwnerSession(request, env);
	if (auth.error) return auth.error;
	if (!env.ACCESS_DB) return json({ success: false, error: 'Datenbank nicht verfügbar.' }, 503);
	try {
		await ensureTable(env.ACCESS_DB);
		if (request.method === 'GET') {
			const row = await env.ACCESS_DB.prepare(
				'SELECT navigation_order FROM owner_ui_preferences WHERE user_id = ?'
			).bind(auth.session.id).first();
			let navigationOrder = DEFAULT_ORDER;
			try {
				const parsed = JSON.parse(row?.navigation_order || 'null');
				if (Array.isArray(parsed) && parsed.length === DEFAULT_ORDER.length &&
					new Set(parsed).size === DEFAULT_ORDER.length && parsed.every((key) => VALID.has(key))) {
					navigationOrder = parsed;
				}
			} catch {}
			return json({ success: true, navigationOrder });
		}
		if (request.method !== 'PUT') return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
		const body = await request.json();
		const order = body?.navigationOrder;
		if (!Array.isArray(order) || order.length !== DEFAULT_ORDER.length ||
			new Set(order).size !== DEFAULT_ORDER.length || !order.every((key) => VALID.has(key))) {
			return json({ success: false, error: 'Ungültige Reihenfolge.' }, 400);
		}
		await env.ACCESS_DB.prepare(
			'INSERT INTO owner_ui_preferences (user_id, navigation_order, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET navigation_order = excluded.navigation_order, updated_at = CURRENT_TIMESTAMP'
		).bind(auth.session.id, JSON.stringify(order)).run();
		return json({ success: true, navigationOrder: order });
	} catch (error) {
		console.error('Owner navigation preferences failed', error?.message || error);
		return json({ success: false, error: 'Navigation konnte nicht gespeichert werden.' }, 503);
	}
}
