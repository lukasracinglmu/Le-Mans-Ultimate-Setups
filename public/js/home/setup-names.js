// File names, vendors and groups of setups. No DOM access, so tests can import it.
export function displaySetupFileName(name) {
	return String(name || '')
		.replace(
			/\s*\[[^\]]*\s+(?:GO|HYMO|BE_?ALIEN)\s+(?:[a-f0-9]{12}|[a-f0-9]{4}\s+[a-f0-9]{4}\s+[a-f0-9]{4})\](?=\.zip$)/i,
			''
		)
		.replace(/\s*\(Version [^)]*\)(?=\.zip$)/i, '');
}

export function classifyVendor(name) {
	const n = String(name || '').toUpperCase();
	if (n.includes('HYMO')) return 'HYMO';
	if (
		n.includes('BEALIEN') ||
		n.includes('BE_ALIEN') ||
		/(?:^|[^A-Z0-9])BA[12]?(?=$|[^A-Z0-9])/.test(n)
	)
		return 'beAlien';
	if (n.includes(' GO') || n.includes('_GO') || /\bGO\b/.test(n)) return 'GO';
	return null;
}

export function groupSetups(items) {
	const groups = new Map();
	for (const s of items) {
		const parts = [];
		if (s.series) parts.push(s.series);
		if (s.variant && s.variant !== 'Standard') parts.push(s.variant);
		const key = parts.length ? parts.join(' · ') : 'Standard';
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(s);
	}
	return groups;
}

export function uploadSetupFamily(name, version) {
	let key = displaySetupFileName(name).replace(/\.zip$/i, '');
	key = key.replace(/\bv\d+(?:[._-]\d+)*\b/gi, ' ');
	const value = String(version || '').trim();
	if (value && (value.includes('.') || /^v/i.test(value))) {
		const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		key = key.replace(new RegExp('(^|[^a-z0-9])' + escaped + '(?=$|[^a-z0-9])', 'gi'), '$1');
	}
	return key
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}
