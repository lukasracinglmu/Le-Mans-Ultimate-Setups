/* @file-notes: Liefert die Bilder der Setup-Hersteller aus. */
import { readSiteFile } from '../repo-read.js';

export async function manufacturerImage(request, env) {
	// The images are deployed with the site. Serve the edge asset before GitHub.
	let response;
	try {
		response = await env.ASSETS.fetch(request);
	} catch {}
	if (!response?.ok)
		response = await readSiteFile(request, env, new URL(request.url).pathname.slice(1));
	if (!response.ok) return response;
	const headers = new Headers(response.headers);
	headers.set('Content-Type', 'image/webp');
	headers.set('Cache-Control', 'public, max-age=300');
	headers.set('X-Content-Type-Options', 'nosniff');
	return new Response(response.body, { status: response.status, headers });
}
