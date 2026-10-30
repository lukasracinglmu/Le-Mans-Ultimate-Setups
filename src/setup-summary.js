/* A complete repository tree replaces one API request per vehicle. */
import { setupManufacturerFromFilename } from '../discord-presence/request-manufacturers.js';

export function buildSetupSummary(data) {
	if (data?.truncated !== false || !Array.isArray(data.tree))
		throw Error('Incomplete repository tree');
	const vehicles = new Map();
	for (const entry of data.tree) {
		if (
			entry?.type !== 'blob' ||
			typeof entry.path !== 'string' ||
			!entry.path.startsWith('setups/') ||
			!entry.path.toLowerCase().endsWith('.zip')
		)
			continue;
		const parts = entry.path.split('/');
		if (parts.length !== 4 || parts.some((part) => !part || part === '.' || part === '..'))
			continue;
		const [, category, vehicle, name] = parts,
			key = JSON.stringify([category, vehicle]);
		if (!vehicles.has(key))
			vehicles.set(key, {
				category,
				vehicle,
				count: 0,
				manufacturers: { GO: 0, HYMO: 0, beAlien: 0, other: 0 },
			});
		const item = vehicles.get(key);
		item.count++;
		item.manufacturers[setupManufacturerFromFilename(name) || 'other']++;
	}
	return [...vehicles.values()];
}
