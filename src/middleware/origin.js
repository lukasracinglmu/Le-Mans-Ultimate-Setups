/* @file-notes: Weist zustandsändernde Anfragen von fremden Origins ab. */
import { json } from '../lib/http.js';

// Discord interactions are checked by their signature instead.
export function enforceSameOriginForStateChange(request, env) {
	const method = request.method.toUpperCase();
	if (!new Set(['POST', 'PUT', 'PATCH', 'DELETE']).has(method)) return null;
	const url = new URL(request.url);
	if (url.pathname === '/interactions/discord') return null;
	const allowedOrigins = new Set([url.origin]);
	try {
		if (env.SITE_URL) allowedOrigins.add(new URL(env.SITE_URL).origin);
	} catch {}
	const origin = request.headers.get('Origin');
	if (origin && !allowedOrigins.has(origin))
		return json({ success: false, error: 'Origin nicht erlaubt.' }, 403);
	const referer = request.headers.get('Referer');
	if (!origin && referer) {
		try {
			if (!allowedOrigins.has(new URL(referer).origin))
				return json({ success: false, error: 'Origin nicht erlaubt.' }, 403);
		} catch {
			return json({ success: false, error: 'Origin nicht erlaubt.' }, 403);
		}
	}
	return null;
}
