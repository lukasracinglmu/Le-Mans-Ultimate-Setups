/* @file-notes: Liest geschützte Dateien und Verzeichnisse sicher aus dem GitHub-Repository. */
import { githubBranch } from './config.js';
import { githubRequest } from './lib/github.js';

// GitHub credentials stay in the Worker, including when the repository is private.
export async function readRepoFile(env, path) {
	const encodedPath = path.split('/').map(encodeURIComponent).join('/');
	try {
		// Workers supports manual/follow only. Keep redirects manual so credentials
		// cannot follow a redirect to another host; callers reject non-2xx responses.
		return await githubRequest(
			env,
			`/contents/${encodedPath}?ref=${encodeURIComponent(githubBranch(env))}`,
			{
				headers: { Accept: 'application/vnd.github.raw+json' },
				cache: 'no-store',
				redirect: 'manual',
				signal: AbortSignal.timeout(15000),
			}
		);
	} catch {
		return new Response('Repository momentan nicht erreichbar.', { status: 502 });
	}
}

// Site files live in public/ in the repository and at the root of the asset binding.
export async function readSiteFile(request, env, path) {
	const source = await readRepoFile(env, 'public/' + path);
	if (source.ok) return source;
	await source.body?.cancel();
	try {
		// The asset binding canonicalizes /index.html to /. Fetch / directly to
		// avoid sending a redirect back through the same failing Worker route.
		const assetPath =
			path === 'index.html' ? '/' : '/' + (path.endsWith('.html') ? path.slice(0, -5) : path);
		const fallback = await env.ASSETS.fetch(new Request(new URL(assetPath, request.url)));
		if (fallback.ok) return fallback;
		await fallback.body?.cancel();
	} catch {}
	return new Response('Website momentan nicht verfügbar. Bitte später erneut versuchen.', {
		status: 503,
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-store',
			'Retry-After': '30',
			'X-Content-Type-Options': 'nosniff',
		},
	});
}
