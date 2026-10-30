/* @file-notes: Favoriten-Fahrzeuge der angemeldeten Mitglieder. */
import { json } from '../lib/http.js';
import { hasSiteAccess, readMe } from './auth.js';

export async function favoritesApi(request, env) {
	try {
		const me = await readMe(request, env);
		if (!hasSiteAccess(me))
			return json(
				{ success: false, error: 'Nicht angemeldet oder keine Datenbankberechtigung.' },
				403,
				{ 'Cache-Control': 'no-store' }
			);
		if (!env.ACCESS_DB)
			return json({ success: false, error: 'Favoriten-Datenbank nicht verfügbar.' }, 503);
		const userId = String(me.user.id);
		if (request.method === 'GET') {
			const rows = await env.ACCESS_DB.prepare(
				'SELECT category,vehicle FROM vehicle_favorites WHERE user_id=? ORDER BY created_at DESC'
			)
				.bind(userId)
				.all();
			return json({ success: true, favorites: rows.results || [] }, 200, {
				'Cache-Control': 'private, no-store',
			});
		}
		let body;
		try {
			body = await request.json();
		} catch {
			return json({ success: false, error: 'Ungültige Anfrage.' }, 400);
		}
		const category = String(body?.category || '')
			.replace(/[\u0000-\u001F\u007F]/g, ' ')
			.trim()
			.slice(0, 100);
		const vehicle = String(body?.vehicle || '')
			.replace(/[\u0000-\u001F\u007F]/g, ' ')
			.trim()
			.slice(0, 150);
		if (!category || !vehicle) return json({ success: false, error: 'Fahrzeug fehlt.' }, 400);
		if (request.method === 'POST')
			await env.ACCESS_DB.prepare(
				'INSERT OR IGNORE INTO vehicle_favorites (user_id,category,vehicle,created_at) VALUES (?,?,?,?)'
			)
				.bind(userId, category, vehicle, new Date().toISOString())
				.run();
		else
			await env.ACCESS_DB.prepare(
				'DELETE FROM vehicle_favorites WHERE user_id=? AND category=? AND vehicle=?'
			)
				.bind(userId, category, vehicle)
				.run();
		return json({ success: true, category, vehicle, favorite: request.method === 'POST' }, 200, {
			'Cache-Control': 'no-store',
		});
	} catch (error) {
		console.error('favoritesApi failed', error);
		return json({ success: false, error: 'Favorit konnte nicht gespeichert werden.' }, 503, {
			'Cache-Control': 'no-store',
		});
	}
}
