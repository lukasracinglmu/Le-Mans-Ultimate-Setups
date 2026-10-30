/* @file-notes: Weist Anfragen ab, die nicht über HTTPS kommen. */
import { json } from '../lib/http.js';

export function isHttpsRequest(request) {
	const url = new URL(request.url);
	if (url.protocol === 'https:') return true;
	return request.headers.get('X-Forwarded-Proto') === 'https';
}

// Only the routes of the former base worker check this; the other routes also answer
// plain HTTP (#10).
export function requireHttps(handler) {
	return (request, env, ctx) =>
		isHttpsRequest(request)
			? handler(request, env, ctx)
			: json({ success: false, error: 'HTTPS erforderlich.' }, 400);
}
