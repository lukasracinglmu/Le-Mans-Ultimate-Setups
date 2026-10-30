/* @file-notes: Liefert die deployten Dateien aus public/ für alle Pfade ohne eigene Route. */
import { json, withSecurityHeaders } from '../lib/http.js';

// Like the former base worker, this answers methods other than GET, HEAD, POST and DELETE
// with 405, even for paths that are no file.
export async function staticFile(request, env) {
	const m = request.method;
	if (m !== 'GET' && m !== 'HEAD' && m !== 'POST' && m !== 'DELETE')
		return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
	return withSecurityHeaders(await env.ASSETS.fetch(request));
}
