/* @file-notes: Schickt eine feste Auswahl von Anfragen durch den Worker eines Checkouts und speichert die Antworten. */
// Shows whether a change to the routing changes any answer. Run it on two checkouts and
// compare the results:
//   node tools/route-matrix.mjs <checkout> <out.json>
//   node tools/compare-route-matrix.mjs <before.json> <after.json>
// GitHub, Discord, D1 and the assets are mocked, so no request leaves the machine.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
// Older checkouts start in runtime-worker.js.
const entry = ['src/index.js', 'src/runtime-worker.js'].find((file) =>
	existsSync(join(repo, file))
);
const { default: worker } = await import(pathToFileURL(join(repo, entry)).href);
const vars = JSON.parse(readFileSync(join(repo, 'wrangler.jsonc'), 'utf8')).vars;
const origin = 'https://example.test';
const OWNER = vars.DISCORD_OWNER_USER_ID;
const MEMBER = '222222222222222222';
const UPLOADER = '333333333333333333';

// D1 mock: answers by SQL text so both checkouts see the same data.
function database({ maintenance }) {
	const statement = (sql) => {
		let args = [];
		const s = {
			bind: (...values) => ((args = values), s),
			first: async () => {
				if (/FROM site_settings WHERE key='maintenance'/.test(sql))
					return maintenance ? { value: '1' } : null;
				if (/FROM upload_access WHERE user_id/.test(sql))
					return args[0] === UPLOADER ? { user_id: UPLOADER } : null;
				return null;
			},
			all: async () => {
				if (/FROM site_settings WHERE key IN/.test(sql)) {
					return {
						results: maintenance
							? [
									{ key: 'maintenance', value: '1' },
									{ key: 'maintenance_message', value: 'Gleich zurück' },
								]
							: [],
					};
				}
				if (/FROM vehicle_favorites/.test(sql))
					return { results: [{ category: 'Hypercar', vehicle: 'Test' }] };
				return { results: [] };
			},
			run: async () => ({ success: true, meta: { changes: 1 } }),
		};
		return s;
	};
	return {
		prepare: statement,
		batch: async (list) => list.map(() => ({ success: true, results: [] })),
	};
}

const pages = new Map(
	['index', 'admin', 'request', 'bug-report', 'bug-tickets'].map((p) => [
		p,
		readFileSync(join(repo, `public/${p}.html`), 'utf8'),
	])
);
function assets() {
	return {
		fetch: async (req) => {
			const path = new URL(req.url).pathname;
			const page = path === '/' ? 'index' : path.slice(1);
			if (pages.has(page))
				return new Response(pages.get(page), {
					headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"page"' },
				});
			const file = join(repo, 'public', path);
			if (path !== '/' && existsSync(file) && !path.endsWith('/')) {
				return new Response(readFileSync(file), {
					headers: { 'Content-Type': 'application/octet-stream', ETag: '"asset"' },
				});
			}
			return new Response('asset not found', { status: 404 });
		},
	};
}

// GitHub and Discord: fixed answers by URL.
globalThis.fetch = async (url, options = {}) => {
	const text = String(url);
	if (text.includes('/contents/public/setups.json'))
		return Response.json({ Hypercar: [{ name: 'Test', setups: [] }] });
	if (text.includes('/contents/setups/')) {
		if (text.includes('.zip')) return new Response(new Uint8Array([80, 75, 3, 4]));
		return Response.json([
			{
				type: 'file',
				name: 'GO_Test_Spa.zip',
				path: 'setups/Hypercar/Test/GO_Test_Spa.zip',
				sha: 'a'.repeat(40),
				size: 4,
			},
		]);
	}
	if (text.includes('/contents/public/assets/manufacturers/'))
		return new Response(new Uint8Array([1, 2, 3]));
	if (text.includes('discord.com/api')) return Response.json({ message: 'mock' }, { status: 404 });
	return Response.json({ message: 'Not Found' }, { status: 404 });
};

function environment(options = {}) {
	return {
		...vars,
		SITE_URL: origin,
		SESSION_SECRET: 'matrix-secret',
		DISCORD_BOT_TOKEN: 'bot',
		DISCORD_CLIENT_ID: 'client-id',
		DISCORD_CLIENT_SECRET: 'client',
		DISCORD_PUBLIC_KEY: '00'.repeat(32),
		GITHUB_TOKEN: 'gh',
		BACKUP_GITHUB_TOKEN: 'backup',
		ACCESS_DB: options.noDatabase ? undefined : database(options),
		ASSETS: assets(),
	};
}

// A role snapshot counts for one minute after `checkedAt`, which covers the whole run.
// Older snapshots make the worker ask Discord for the roles again.
async function cookie(id, roles, checkedAt = Date.now()) {
	const configuration = [
		vars.DISCORD_GUILD_ID,
		vars.DISCORD_DATABASE_ROLE_ID,
		vars.DISCORD_UPLOAD_ROLE_ID,
		vars.DISCORD_OWNER_ROLE_ID,
	].join(':');
	const payload = Buffer.from(
		JSON.stringify({
			id,
			username: 'User' + id.slice(0, 3),
			accessToken: 'oauth',
			exp: 4102444800,
			memberSnapshot: { userId: id, configuration, roles, checkedAt },
		})
	).toString('base64url');
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode('matrix-secret'),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = Buffer.from(
		await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
	).toString('base64url');
	return `lmu_session=${payload}.${sig}`;
}

const users = {
	anonymous: null,
	member: await cookie(MEMBER, [vars.DISCORD_DATABASE_ROLE_ID]),
	uploader: await cookie(UPLOADER, [vars.DISCORD_DATABASE_ROLE_ID, vars.DISCORD_UPLOAD_ROLE_ID]),
	owner: await cookie(OWNER, [vars.DISCORD_DATABASE_ROLE_ID, vars.DISCORD_OWNER_ROLE_ID]),
	stale: await cookie(MEMBER, [vars.DISCORD_DATABASE_ROLE_ID], 0),
};

const json = (body) => ({ type: 'application/json', body: JSON.stringify(body) });
const setup = { category: 'Hypercar', vehicle: 'Test', name: 'GO_Test_Spa.zip' };
// [method, path, body?]
const routes = [
	['GET', '/'],
	['HEAD', '/'],
	['GET', '/admin'],
	['GET', '/admin.html'],
	['GET', '/request'],
	['GET', '/bug-report'],
	['GET', '/bug-tickets'],
	['GET', '/strategy'],
	['GET', '/strategy.js'],
	['GET', '/setups.json'],
	['GET', '/js/home/main.js'],
	['GET', '/css/home.css'],
	['GET', '/assets/manufacturers/bealien.webp'],
	['GET', '/does-not-exist'],
	['GET', '/auth/discord'],
	['GET', '/auth/discord/callback?code=x&state=y'],
	['GET', '/auth/logout'],
	['GET', '/api/me'],
	['GET', '/api/me?refresh=1'],
	['PUT', '/api/me'],
	['GET', '/api/favorites'],
	['POST', '/api/favorites', json({ category: 'Hypercar', vehicle: 'Test' })],
	['DELETE', '/api/favorites', json({ category: 'Hypercar', vehicle: 'Test' })],
	['PUT', '/api/favorites'],
	['GET', '/api/setups?category=Hypercar&vehicle=Test'],
	['GET', '/api/setups/summary'],
	['GET', '/api/setups/download?category=Hypercar&vehicle=Test&name=GO_Test_Spa.zip'],
	['POST', '/api/setups/upload', { type: 'text/plain', body: 'not a form' }],
	['POST', '/api/setups/delete', json(setup)],
	['POST', '/api/setups/version', json({ ...setup, version: '2' })],
	['GET', '/api/request/tracks'],
	['POST', '/api/request', json({ vehicle: 'Test', track: 'Spa' })],
	['GET', '/api/bug-reports'],
	['POST', '/api/bug-reports', { type: 'text/plain', body: 'x' }],
	['GET', '/api/admin/access'],
	['GET', '/api/admin/database-access'],
	['POST', '/api/admin/database-access', json({ userId: '444444444444444444' })],
	['DELETE', '/api/admin/database-access', json({ userId: '444444444444444444' })],
	['GET', '/api/admin/upload-access'],
	['POST', '/api/admin/upload-access', json({ userId: '444444444444444444' })],
	['DELETE', '/api/admin/upload-access', json({ userId: '444444444444444444' })],
	['POST', '/api/admin/all-access', json({ userId: '444444444444444444' })],
	['GET', '/api/admin/admin-panel-access'],
	['POST', '/api/admin/admin-panel-access', json({ userId: '444444444444444444' })],
	['POST', '/api/admin/full-admin-access', json({ userId: '444444444444444444' })],
	['GET', '/api/admin/full-admin'],
	['GET', '/api/admin/maintenance'],
	['POST', '/api/admin/maintenance', json({ enabled: false, message: '' })],
	['GET', '/api/admin/backups'],
	['POST', '/api/admin/backup', json({})],
	['GET', '/api/admin/bug-tickets?status=open'],
	['GET', '/api/admin/bug-tickets/1'],
	['GET', '/api/admin/discord/role-status'],
	['POST', '/api/admin/discord/register-request', json({})],
	['GET', '/api/admin/unknown'],
	['PUT', '/api/admin/access'],
	['GET', '/api/discord/channels'],
	['GET', '/api/discord/messages?channelId=1'],
	['POST', '/api/discord/messages', json({ channelId: '1', content: 'x' })],
	['POST', '/interactions/discord', json({ type: 1 })],
	['POST', '/api/internal/backups/complete', json({})],
];

const results = [];
async function send(label, method, path, { body, user, env, headers = {}, scheme = 'https' } = {}) {
	const requestHeaders = { Origin: origin, ...headers };
	if (user) requestHeaders.Cookie = user;
	if (body) requestHeaders['Content-Type'] = body.type;
	const request = new Request(`${scheme}://example.test${path}`, {
		method,
		headers: requestHeaders,
		body: body?.body,
	});
	let entry;
	try {
		const response = await worker.fetch(request, env, { waitUntil() {} });
		const text = method === 'HEAD' ? '' : await response.text();
		const headerList = [...response.headers].sort();
		entry = {
			status: response.status,
			headers: Object.fromEntries(headerList),
			body: text.length > 4000 ? 'len:' + text.length + ' ' + text.slice(0, 200) : text,
		};
	} catch (error) {
		entry = { error: String(error) };
	}
	results.push({ case: label, ...entry });
}

const normal = environment();
for (const [name, user] of Object.entries(users)) {
	for (const [method, path, body] of routes)
		await send(`${name} ${method} ${path}`, method, path, { body, user, env: normal });
}
// Cross-cutting checks.
const maintenance = environment({ maintenance: true });
for (const [name, user] of Object.entries({
	anonymous: null,
	member: users.member,
	owner: users.owner,
})) {
	for (const path of [
		'/',
		'/api/setups?category=Hypercar&vehicle=Test',
		'/api/me',
		'/admin',
		'/js/home/main.js',
		'/auth/discord',
		'/api/admin/access',
	]) {
		await send(`maintenance ${name} GET ${path}`, 'GET', path, { user, env: maintenance });
	}
}
for (const [method, path, body] of routes.filter(([m]) => m === 'POST' || m === 'DELETE')) {
	await send(`foreign origin ${method} ${path}`, method, path, {
		body,
		user: users.owner,
		env: normal,
		headers: { Origin: 'https://evil.test' },
	});
}
const noDatabase = environment({ noDatabase: true });
for (const [method, path, body] of routes) {
	await send(`http ${method} ${path}`, method, path, {
		body,
		user: users.owner,
		env: normal,
		scheme: 'http',
	});
	await send(`no database ${method} ${path}`, method, path, {
		body,
		user: users.owner,
		env: noDatabase,
	});
}

writeFileSync(out, JSON.stringify(results, null, 1));
const statuses = results.reduce(
	(acc, r) => ((acc[r.status ?? 'error'] = (acc[r.status ?? 'error'] || 0) + 1), acc),
	{}
);
console.log(`${results.length} cases via ${entry}`, JSON.stringify(statuses));
