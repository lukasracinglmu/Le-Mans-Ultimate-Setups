/* @file-notes: Liefert den Fahrzeugkatalog setups.json nur an Mitglieder mit Datenbankzugriff. */
import { json, securityHeaders } from '../lib/http.js';
import { readSiteFile } from '../repo-read.js';
import { readMe } from './auth.js';

export async function catalogFile(request, env) {
	const me = await readMe(request, env);
	if (!me?.loggedIn) return json({ success: false, error: 'Nicht angemeldet.' }, 401);
	if (!me?.databaseAccess) {
		const unavailable = me?.rolesAvailable === false;
		return json(
			{
				success: false,
				error: unavailable
					? 'Discord-Rollenprüfung momentan nicht verfügbar. Bitte erneut versuchen.'
					: 'Erforderliche Discord-Rolle fehlt.',
				reauthorize: Boolean(me?.reauthorize),
			},
			unavailable ? 503 : 403,
			{
				'Cache-Control': 'private, no-store',
				...(unavailable
					? {
							'Retry-After': String(Math.max(1, Math.ceil((me.retryAfterMs || 5000) / 1000))),
						}
					: {}),
			}
		);
	}
	const source = await readSiteFile(request, env, 'setups.json');
	return new Response(source.body, {
		status: source.ok ? 200 : 502,
		headers: securityHeaders({
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'private, no-store',
		}),
	});
}
