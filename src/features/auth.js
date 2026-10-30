/* @file-notes: Liest Anmeldung und Rechte des Besuchers. */
import legacyWorker from '../legacy.js';

// The profile comes from /api/me of the older layers until that route moves (#10).
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
