/* @file-notes: Liest Anmeldung und Rechte des Besuchers. */
import legacyWorker from '../legacy.js';
import { safeJson } from '../lib/http.js';

// The profile comes from /api/me of the older worker until that route moves (#10).
export async function readMe(request, env, ctx) {
	const r = await legacyWorker.fetch(
		new Request(new URL('/api/me', request.url), { headers: request.headers }),
		env,
		ctx
	);
	try {
		return await r.json();
	} catch {
		return null;
	}
}

export function hasSiteAccess(me) {
	return Boolean(me?.loggedIn && me?.databaseAccess && me?.user?.id);
}

// The profile with fresh Discord roles when the permission must be current.
export async function readProfile(request, env, ctx, freshRoles = false) {
	const meRequest = new Request(
		new URL(freshRoles ? '/api/me?refresh=1' : '/api/me', request.url),
		{ method: 'GET', headers: request.headers }
	);
	const response = await legacyWorker.fetch(meRequest, env, ctx);
	return safeJson(response);
}
