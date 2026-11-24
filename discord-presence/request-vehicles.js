// Shared vehicle catalog mapping for the Discord request autocomplete.
export function flattenRequestVehicles(data) {
	return Object.entries(data || {}).flatMap(([className, entries]) =>
		(Array.isArray(entries) ? entries : [])
			.map((entry) => ({ name: String(entry?.name || '').trim(), className }))
			.filter((entry) => entry.name)
	);
}
