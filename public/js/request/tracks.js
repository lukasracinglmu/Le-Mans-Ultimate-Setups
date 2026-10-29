// Same matching rules as discord-presence/request-tracks.js for the Discord bot.
// tests/request-track-autocomplete.test.mjs keeps both in line.

export function normalizeRequestTrack(value) {
	return String(value || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

// Exact names and common short forms are allowed, unknown tracks are not.
export function resolveRequestTrack(tracks, value) {
	const query = normalizeRequestTrack(value);
	if (!query) {
		return null;
	}
	return (
		tracks.find((track) =>
			[track.name, ...track.aliases].some((name) => normalizeRequestTrack(name) === query)
		) || null
	);
}

// Visible track names match at word starts. Aliases match at the start of the
// name or as a whole word: "Paul" must not match "São Paulo".
export function searchRequestTracks(tracks, value, limit = 8) {
	const query = normalizeRequestTrack(value);
	const words = (name) =>
		String(name || '')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean);
	return tracks
		.map((track, index) => {
			const labelWords = words(track.name);
			const labelPrefix = labelWords.some((_, i) => labelWords.slice(i).join('').startsWith(query));
			const aliasPrefix = track.aliases.some((name) =>
				normalizeRequestTrack(name).startsWith(query)
			);
			const aliasWord = track.aliases.some((name) => {
				const parts = words(name);
				return parts.some((_, i) =>
					parts.slice(i).some((_, j) => parts.slice(i, i + j + 1).join('') === query)
				);
			});
			const score =
				!query || normalizeRequestTrack(track.name).startsWith(query)
					? 0
					: labelPrefix
						? 1
						: aliasPrefix
							? 2
							: aliasWord
								? 3
								: 4;
			return { track, index, score };
		})
		.filter((item) => item.score < 4)
		.sort((a, b) => a.score - b.score || a.index - b.index)
		.slice(0, Math.max(0, Math.min(25, limit)))
		.map((item) => item.track);
}
