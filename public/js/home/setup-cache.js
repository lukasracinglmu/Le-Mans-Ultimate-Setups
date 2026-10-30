// Setup lists per vehicle, cached briefly for the catalog counts and the vehicle page.
const setupCache = new Map(),
	setupPending = new Map(),
	setupRevisions = new Map();

const SETUP_CACHE_MS = 30000;

function setupCacheKey(c, v) {
	return c + '\u0000' + v;
}

export function invalidateSetupCache(category, vehicle) {
	const key = setupCacheKey(category, vehicle);
	setupRevisions.set(key, (setupRevisions.get(key) || 0) + 1);
	setupCache.delete(key);
	setupPending.delete(key);
}

export async function getCarSetups(category, vehicle) {
	const key = setupCacheKey(category, vehicle),
		hit = setupCache.get(key);
	if (hit && Date.now() - hit.time < SETUP_CACHE_MS) return hit.data;
	if (setupPending.has(key)) return setupPending.get(key);
	const generation = setupRevisions.get(key) || 0;
	const p = (async () => {
		const r = await fetch(
			`/api/setups?category=${encodeURIComponent(category)}&vehicle=${encodeURIComponent(vehicle)}`,
			{ cache: 'no-store', credentials: 'same-origin' }
		);
		const d = await r.json();
		if (!d.success) throw new Error(d.error || 'Fehler beim Laden.');
		if (generation === (setupRevisions.get(key) || 0))
			setupCache.set(key, { time: Date.now(), data: d });
		return d;
	})().finally(() => {
		if (setupPending.get(key) === p) setupPending.delete(key);
	});
	setupPending.set(key, p);
	return p;
}
