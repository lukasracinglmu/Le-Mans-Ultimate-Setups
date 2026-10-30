import assert from 'node:assert/strict';
import test from 'node:test';
import runtime from '../src/index.js';
import { resolvePermissions } from '../src/discord-permissions.js';
import { repositoryEnv } from './helpers/repository-env.mjs';

const id = '222222222222222222';
const config = {
	...repositoryEnv,
	SESSION_SECRET: 'test-session-signing-key',
	DISCORD_CLIENT_ID: '1556978316404068452',
	DISCORD_CLIENT_SECRET: 'test-client-secret',
	DISCORD_GUILD_ID: '1464926567401652418',
	DISCORD_DATABASE_ROLE_ID: '1464926567401652420',
	DISCORD_UPLOAD_ROLE_ID: '1538601074074849330',
	DISCORD_OWNER_ROLE_ID: '1464926567401652423',
	DISCORD_OWNER_USER_ID: '1033453785416208564',
	DISCORD_BOT_TOKEN: 'test-bot',
	GITHUB_TOKEN: 'test-github',
	SITE_URL: 'https://example.test',
};
const configuration = [
	config.DISCORD_GUILD_ID,
	config.DISCORD_DATABASE_ROLE_ID,
	config.DISCORD_UPLOAD_ROLE_ID,
	config.DISCORD_OWNER_ROLE_ID,
].join(':');
const snapshot = (roles = [config.DISCORD_DATABASE_ROLE_ID], extra = {}) => ({
	userId: id,
	configuration,
	roles,
	checkedAt: Date.now(),
	...extra,
});
async function signedCookie(extra = {}) {
	const payload = Buffer.from(
		JSON.stringify({
			id,
			username: 'Team User',
			accessToken: 'test-oauth',
			exp: Math.floor(Date.now() / 1000) + 3600,
			...extra,
		})
	).toString('base64url');
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(config.SESSION_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = Buffer.from(
		await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
	).toString('base64url');
	return 'lmu_session=' + payload + '.' + sig;
}
const request = (path, cookie, method = 'GET', body) =>
	new Request(config.SITE_URL + path, {
		method,
		headers: {
			...(cookie ? { Cookie: cookie } : {}),
			...(body ? { 'Content-Type': 'application/json' } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
const emptyDB = {
	prepare() {
		const s = {
			bind() {
				return s;
			},
			async first() {
				return null;
			},
			async all() {
				return { results: [] };
			},
			async run() {
				return { success: true };
			},
		};
		return s;
	},
	async batch(s) {
		return Promise.all(s.map((x) => x.run()));
	},
};
const env = { ...config, ACCESS_DB: emptyDB };
const ctx = {
	waitUntil(p) {
		p.catch(() => {});
	},
};
async function external(mock, run) {
	const original = fetch;
	globalThis.fetch = mock;
	try {
		return await run();
	} finally {
		globalThis.fetch = original;
	}
}
const roleResult = (roles) => Response.json({ roles, user: { id } });
for (const [label, role, upload, admin] of [
	['Team', config.DISCORD_DATABASE_ROLE_ID, false, false],
	['Setup Supply', config.DISCORD_UPLOAD_ROLE_ID, true, false],
	['Server Owner role', config.DISCORD_OWNER_ROLE_ID, true, true],
])
	test(
		'OAuth login automatically grants ' + label + ' permissions without manual grants',
		async () => {
			let oauthLookups = 0,
				botLookups = 0,
				githubReads = 0;
			await external(
				async (url, opts = {}) => {
					const value = String(url);
					if (value.endsWith('/oauth2/token'))
						return Response.json({
							access_token: 'test-oauth',
							scope: 'identify guilds.members.read',
							expires_in: 604800,
						});
					if (value.endsWith('/users/@me')) return Response.json({ id, username: 'Team User' });
					if (value.includes('/users/@me/guilds/')) {
						oauthLookups++;
						assert.equal(opts.headers.Authorization, 'Bearer test-oauth');
						return roleResult([role]);
					}
					if (value.includes('discord.com')) {
						botLookups++;
						throw Error('OAuth should avoid shared bot calls');
					}
					if (value.includes('api.github.com')) {
						githubReads++;
						return value.includes('/contents/public/setups.json')
							? Response.json({ Hypercar: [{ name: 'Test Car' }] })
							: Response.json([]);
					}
					throw Error('Unexpected request');
				},
				async () => {
					const login = await runtime.fetch(request('/auth/discord'), env, ctx);
					assert.equal(
						new URL(login.headers.get('location')).searchParams.get('scope'),
						'identify guilds.members.read'
					);
					const stateCookie = login.headers.get('set-cookie').split(';')[0];
					const state = new URL(login.headers.get('location')).searchParams.get('state');
					const callback = await runtime.fetch(
						request('/auth/discord/callback?code=test-code&state=' + state, stateCookie),
						env,
						ctx
					);
					assert.equal(callback.status, 200);
					const cookie = callback.headers
						.getSetCookie()
						.find((c) => c.startsWith('lmu_session='))
						.split(';')[0];
					const me = await runtime.fetch(request('/api/me', cookie), env, ctx);
					const data = await me.json();
					assert.equal(data.databaseAccess, true);
					assert.equal(data.user.canUpload, upload);
					assert.equal(data.user.canViewAdminPanel, admin);
					assert.equal(data.user.canManageDatabaseAccess, admin);
					assert.equal(data.user.canManageUploadAccess, admin);
					for (const capability of [
						'isOwner',
						'fullAdmin',
						'canManageAdminAccess',
						'canViewBackups',
						'canViewTickets',
						'canManageMaintenance',
					])
						assert.equal(data.user[capability], false);
					assert.equal(data.user.individualDatabaseAccess, false);
					assert.equal(data.roleSource, 'oauth');
					assert.equal(data.memberSnapshot, undefined);
					assert.equal(data.user.accessToken, undefined);
					assert.equal(oauthLookups, 1);
					assert.equal(botLookups, 0);
					const renewed = me.headers.get('set-cookie').split(';')[0];
					// Simulate the catalog plus many parallel setup requests after authorization.
					const results = await Promise.all([
						runtime.fetch(request('/setups.json', renewed), env, ctx),
						...Array.from({ length: 20 }, (_, i) =>
							runtime.fetch(
								request('/api/setups?category=Hypercar&vehicle=Test' + i, renewed),
								env,
								ctx
							)
						),
					]);
					assert.ok(results.every((r) => r.status === 200));
					assert.equal(oauthLookups, 1, 'vehicle browsing must not repeat Discord lookups');
					assert.equal(botLookups, 0);
					assert.ok(githubReads > 0);
				}
			);
		}
	);
for (const [label, role, upload, admin] of [
	['Team', config.DISCORD_DATABASE_ROLE_ID, false, false],
	['Setup Supply', config.DISCORD_UPLOAD_ROLE_ID, true, false],
	['Server Owner role', config.DISCORD_OWNER_ROLE_ID, true, true],
])
	test(
		'bot fallback automatically grants ' + label + ' permissions in legacy sessions',
		async () => {
			await external(
				async (url, opts) => {
					assert.match(String(url), /\/guilds\/.*\/members\//);
					assert.equal(opts.headers.Authorization, 'Bot test-bot');
					return roleResult([role]);
				},
				async () => {
					const data = await (
						await runtime.fetch(
							request('/api/me', await signedCookie({ accessToken: undefined })),
							env,
							ctx
						)
					).json();
					assert.equal(data.databaseAccess, true);
					assert.equal(data.roleSource, 'bot');
					assert.equal(data.reauthorize, false);
					assert.equal(data.user.canUpload, upload);
					assert.equal(data.user.canViewAdminPanel, admin);
					assert.equal(data.user.fullAdmin, false);
					assert.equal(data.user.canViewBackups, false);
				}
			);
		}
	);
test('missing OAuth scope falls back to the configured bot', async () => {
	let calls = 0;
	await external(
		async (url) => {
			calls++;
			return String(url).includes('/users/@me/guilds/')
				? Response.json({ code: 50001 }, { status: 403 })
				: roleResult([config.DISCORD_DATABASE_ROLE_ID]);
		},
		async () => {
			const p = await resolvePermissions(id, env, 'old-oauth');
			assert.equal(p.databaseAccess, true);
			assert.equal(p.roleSource, 'bot');
			assert.equal(p.reauthorize, false);
			assert.equal(calls, 2);
		}
	);
});
test('OAuth role lookup works even if the bot has no server access', async () => {
	await external(
		async (url) => {
			assert.ok(String(url).includes('/users/@me/guilds/'));
			return roleResult([config.DISCORD_DATABASE_ROLE_ID]);
		},
		async () => {
			const p = await resolvePermissions(
				id,
				{ ...env, DISCORD_BOT_TOKEN: undefined },
				'test-oauth'
			);
			assert.equal(p.databaseAccess, true);
			assert.equal(p.roleSource, 'oauth');
		}
	);
});
test('unknown member is denied rather than reported as a Discord outage', async () => {
	await external(
		async () => Response.json({ code: 10007 }, { status: 404 }),
		async () => {
			const p = await resolvePermissions(id, env);
			assert.equal(p.databaseAccess, false);
			assert.equal(p.rolesAvailable, true);
			assert.equal(p.roleCheckError, 'NOT_MEMBER');
		}
	);
});
test('Discord rate limiting produces retryable 503, never a false missing-role 403', async () => {
	await external(
		async () =>
			Response.json(
				{ message: 'limited', retry_after: 12 },
				{ status: 429, headers: { 'Retry-After': '12' } }
			),
		async () => {
			const cookie = await signedCookie();
			const me = await (await runtime.fetch(request('/api/me', cookie), env, ctx)).json();
			assert.equal(me.rolesAvailable, false);
			assert.equal(me.retryAfterMs, 12000);
			const catalog = await runtime.fetch(request('/setups.json', cookie), env, ctx);
			assert.equal(catalog.status, 503);
			assert.match((await catalog.json()).error, /momentan nicht verfügbar/);
			assert.equal(
				(
					await runtime.fetch(
						request('/api/setups?category=Hypercar&vehicle=Test', cookie),
						env,
						ctx
					)
				).status,
				503
			);
		}
	);
});
test('expired token and inaccessible bot ask for renewed Discord authorization', async () => {
	await external(
		async (url) =>
			Response.json(
				{ code: 50001 },
				{ status: String(url).includes('/users/@me/guilds/') ? 401 : 403 }
			),
		async () => {
			const me = await (
				await runtime.fetch(request('/api/me', await signedCookie()), env, ctx)
			).json();
			assert.equal(me.databaseAccess, false);
			assert.equal(me.rolesAvailable, false);
			assert.equal(me.reauthorize, true);
		}
	);
});
test('empty roles are a real 403 without allowing file reads', async () => {
	await external(
		async (url) => {
			assert.ok(String(url).includes('discord.com'));
			return roleResult([]);
		},
		async () => {
			const response = await runtime.fetch(request('/setups.json', await signedCookie()), env, ctx);
			assert.equal(response.status, 403);
			assert.match((await response.json()).error, /Rolle fehlt/);
		}
	);
});
test('expired, cross-user, future-dated and reconfigured snapshots are never trusted', async () => {
	let calls = 0;
	await external(
		async () => {
			calls++;
			return roleResult([]);
		},
		async () => {
			for (const cached of [
				snapshot(undefined, { checkedAt: Date.now() - 61000 }),
				snapshot(undefined, { userId: '333333333333333333' }),
				snapshot(undefined, { checkedAt: Date.now() + 1000 }),
				snapshot(undefined, { configuration: 'other-guild' }),
			]) {
				const p = await resolvePermissions(id, env, 'test-oauth', cached);
				assert.equal(p.databaseAccess, false);
				assert.equal(p.roleSource, 'oauth');
			}
			assert.equal(calls, 4);
		}
	);
});
test('tampering with the role snapshot invalidates the whole session', async () => {
	const cookie = await signedCookie();
	const [value, sig] = cookie.slice('lmu_session='.length).split('.');
	const payload = JSON.parse(Buffer.from(value, 'base64url'));
	payload.memberSnapshot = snapshot([config.DISCORD_UPLOAD_ROLE_ID]);
	const forged =
		'lmu_session=' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + sig;
	const me = await (await runtime.fetch(request('/api/me', forged), env, ctx)).json();
	assert.equal(me.loggedIn, false);
});
test('fresh setup mutations ignore cached Supply roles after the role was removed', async () => {
	await external(
		async (url) => {
			assert.ok(String(url).includes('discord.com'), 'no GitHub write allowed');
			return roleResult([]);
		},
		async () => {
			const cookie = await signedCookie({
				memberSnapshot: snapshot([config.DISCORD_UPLOAD_ROLE_ID]),
			});
			for (const path of ['/api/setups/upload', '/api/setups/delete', '/api/setups/version']) {
				const r = await runtime.fetch(
					request(path, cookie, 'POST', {
						category: 'Hypercar',
						vehicle: 'Test',
						name: 'test.zip',
						version: 'v2',
					}),
					env,
					ctx
				);
				assert.equal(r.status, 403);
			}
		}
	);
});
test('manual Full Admin grants are not cached with Discord roles', async () => {
	const p = await resolvePermissions(id, env, 'test-oauth', snapshot());
	assert.equal(p.databaseAccess, true);
	assert.equal(p.fullAdmin, false);
	assert.equal(p.canViewBackups, false);
	assert.equal(p.canViewTickets, false);
	assert.equal(p.canManageMaintenance, false);
});
test('explicit role refresh bypasses the snapshot and can immediately remove read access', async () => {
	await external(
		async () => roleResult([]),
		async () => {
			const cookie = await signedCookie({ memberSnapshot: snapshot() });
			const me = await runtime.fetch(request('/api/me?refresh=1', cookie), env, ctx);
			assert.equal((await me.json()).databaseAccess, false);
			const fresh = me.headers.get('set-cookie').split(';')[0];
			assert.equal((await runtime.fetch(request('/setups.json', fresh), env, ctx)).status, 403);
		}
	);
});
