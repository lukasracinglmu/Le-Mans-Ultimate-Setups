/* @file-notes: Sperrt die Website während der Wartung für alle außer dem Owner. */
import { ownerUserId } from '../config.js';
import { readMe } from '../features/auth.js';
import { isMaintenanceActive, maintenanceState } from '../full-admin.js';
import { json } from '../lib/http.js';

// Login, assets, Discord, the admin APIs and the backup callback stay reachable, so the
// owner can sign in and end the maintenance.
const OPEN_PATHS = new Set(['/api/me', '/interactions/discord', '/api/internal/backups/complete']);
const OPEN_PREFIXES = ['/auth/', '/assets/', '/css/', '/js/', '/api/admin'];

export async function maintenanceGate(request, env, ctx) {
	const url = new URL(request.url);
	if (
		OPEN_PATHS.has(url.pathname) ||
		OPEN_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
	) {
		return null;
	}
	if (!(await isMaintenanceActive(env))) {
		return null;
	}
	const me = await readMe(request, env, ctx);
	if (String(me?.user?.id) === ownerUserId(env)) {
		return null;
	}
	const state = await maintenanceState(env);
	if (url.pathname.startsWith('/api/'))
		return json({ success: false, error: state.message || 'Wartungsarbeiten.' }, 503, {
			'Retry-After': '60',
		});
	return new Response(
		'<!doctype html><meta charset="utf-8"><title>Wartungsarbeiten</title><style>*{box-sizing:border-box}@keyframes maintenanceDrift{from{background-position:70px 75px,300px 305px}to{background-position:105px 110px,335px 340px}}body{font:16px Arial;background:#111318;color:#f5f6f8;display:grid;place-items:center;min-height:100vh;text-align:center;overflow:hidden;animation:maintenanceDrift 28s ease-in-out infinite alternate;background-image:url("/assets/bp-logo.webp?v=maintenance-gray-2"),url("/assets/bp-logo.webp?v=maintenance-gray-2");background-size:460px auto;background-position:70px 75px,300px 305px;background-repeat:repeat}main{position:relative;z-index:1;max-width:620px;margin:30px;padding:34px 38px;border:1px solid #343943;border-radius:18px;background:#191c22;box-shadow:0 18px 60px #0008}main h1{margin:0 0 12px}main p{margin:0;color:#a5a9b3;line-height:1.55}</style><main><h1>Wartungsarbeiten</h1><p>' +
			escapeHtml(state.message) +
			'</p></main>',
		{
			status: 503,
			headers: {
				'Content-Type': 'text/html;charset=utf-8',
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff',
				'X-Frame-Options': 'DENY',
				'Referrer-Policy': 'no-referrer',
				'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
				'Content-Security-Policy':
					"default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self'; style-src 'unsafe-inline'; upgrade-insecure-requests",
			},
		}
	);
}

function escapeHtml(value) {
	return String(value || '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
	);
}
