/* Display data only. This cache must never authorize a user. */
export async function discordProfile(userId, env, options = {}) {
	if (!env.DISCORD_BOT_TOKEN || !/^\d{16,22}$/.test(String(userId))) return null;
	const key = new Request(
		'https://discord-profile.invalid/' +
			encodeURIComponent(env.DISCORD_CLIENT_ID || 'default') +
			'/' +
			userId
	);
	const cache = globalThis.caches?.default;
	try {
		const cached = await cache?.match(key);
		if (cached) return await cached.json();
	} catch {}
	try {
		if (options.signal?.aborted || options.budget?.remaining === 0) return null;
		if (options.budget) options.budget.remaining--;
		const response = await fetch('https://discord.com/api/v10/users/' + userId, {
			headers: { Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN },
			signal: options.signal
				? AbortSignal.any([options.signal, AbortSignal.timeout(5000)])
				: AbortSignal.timeout(5000),
		});
		if (!response.ok) return null;
		const user = await response.json();
		if (String(user.id) !== String(userId)) return null;
		const fallback =
			user.discriminator && user.discriminator !== '0'
				? Number(user.discriminator) % 5
				: Number((BigInt(userId) >> 22n) % 6n);
		const profile = {
			username: user.global_name || user.username || null,
			avatar: user.avatar
				? 'https://cdn.discordapp.com/avatars/' + userId + '/' + user.avatar + '.png?size=128'
				: 'https://cdn.discordapp.com/embed/avatars/' + fallback + '.png',
		};
		try {
			await cache?.put(
				key,
				Response.json(profile, { headers: { 'Cache-Control': 'public, max-age=300' } })
			);
		} catch {}
		return profile;
	} catch {
		return null;
	}
}

export async function mapProfiles(rows, env, readId = (row) => row.user_id) {
	const result = new Array(rows.length).fill(null);
	let next = 0;
	const options = { signal: AbortSignal.timeout(4500), budget: { remaining: 32 } };
	await Promise.all(
		Array.from({ length: Math.min(4, rows.length) }, async () => {
			while (next < rows.length && !options.signal.aborted) {
				const index = next++;
				result[index] = await discordProfile(readId(rows[index]), env, options);
			}
		})
	);
	return result;
}
