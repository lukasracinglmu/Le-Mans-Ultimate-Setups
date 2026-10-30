import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import runtime from '../src/index.js';
import { rolePermissions } from '../src/discord-permissions.js';
import { setupSummary } from '../src/features/setup-files.js';
import { fullAdminApi } from '../src/full-admin.js';
import { createTicket, ticketApi } from '../src/bug-tickets.js';
import { submitBugReport } from '../src/bug-reports.js';
import { writeSetupAuditEvent } from '../src/audit-log.js';
import { buildSetupSummary } from '../src/setup-summary.js';
import { discordProfile, mapProfiles } from '../src/discord-profile.js';
import { repositoryEnv } from './helpers/repository-env.mjs';

const OWNER = '1033453785416208564',
	USER = '222222222222222222',
	TARGET = '333333333333333333';
const config = {
	...repositoryEnv,
	DISCORD_OWNER_USER_ID: OWNER,
	DISCORD_GUILD_ID: '1464926567401652418',
	DISCORD_DATABASE_ROLE_ID: '1464926567401652420',
	DISCORD_UPLOAD_ROLE_ID: '1538601074074849330',
	DISCORD_OWNER_ROLE_ID: '1464926567401652423',
	DISCORD_CLIENT_ID: '1556978316404068452',
	DISCORD_BOT_TOKEN: 'test-bot',
	GITHUB_TOKEN: 'test-github',
	SESSION_SECRET: 'test-signing-key',
	SITE_URL: 'https://audit.test',
};

function database() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
	for (const table of [
		'database_access',
		'upload_access',
		'admin_panel_access',
		'full_admin_access',
	])
		sqlite.exec(
			`CREATE TABLE IF NOT EXISTS ${table}(user_id TEXT PRIMARY KEY,granted_by TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`
		);
	const db = {
		sqlite,
		prepare(sql) {
			const statement = {
				values: [],
				bind(...values) {
					return { ...statement, values };
				},
				async first() {
					return sqlite.prepare(sql).get(...this.values) || null;
				},
				async all() {
					return { results: sqlite.prepare(sql).all(...this.values) };
				},
				async run() {
					const result = sqlite.prepare(sql).run(...this.values);
					return { success: true, meta: { changes: Number(result.changes) } };
				},
			};
			return statement;
		},
		async batch(statements) {
			sqlite.exec('BEGIN');
			try {
				const results = [];
				for (const statement of statements) results.push(await statement.run());
				sqlite.exec('COMMIT');
				return results;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		},
	};
	return db;
}
function grant(db, table, id = USER) {
	db.sqlite
		.prepare(`INSERT OR REPLACE INTO ${table}(user_id,granted_by)VALUES(?,?)`)
		.run(id, OWNER);
}
async function cookie(id = OWNER) {
	const payload = Buffer.from(
		JSON.stringify({ id, username: 'Audit User', exp: Math.floor(Date.now() / 1000) + 3600 })
	).toString('base64url');
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(config.SESSION_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = Buffer.from(
		await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
	).toString('base64url');
	return 'lmu_session=' + payload + '.' + signature;
}
async function request(path, method = 'GET', body, id = OWNER, origin = 'https://audit.test') {
	return new Request(config.SITE_URL + path, {
		method,
		headers: {
			Cookie: await cookie(id),
			Origin: origin,
			...(body ? { 'Content-Type': 'application/json' } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
}
async function withNetwork(run, roles = []) {
	const previous = globalThis.fetch,
		calls = [];
	globalThis.fetch = async (url, options = {}) => {
		const value = String(url);
		calls.push({ url: value, options });
		if (value.includes('/members/')) return Response.json({ user: { id: USER }, roles });
		if (value.includes('discord.com/api/v10/users/'))
			return Response.json({
				id: value.split('/').pop(),
				username: 'external-user',
				avatar: 'avatar-hash',
			});
		if (value.includes('api.github.com') || value.includes('/messages'))
			return Response.json({ id: '444444444444444444' });
		throw Error('Unexpected network request ' + value);
	};
	try {
		return await run(calls);
	} finally {
		globalThis.fetch = previous;
	}
}

for (const [label, roles, grants] of [
	['Admin panel', [], { adminPanel: true }],
	['Owner role', [config.DISCORD_OWNER_ROLE_ID], {}],
	['Full Admin', [], { fullAdmin: true }],
])
	test(label + ' follows the capability boundary', () => {
		const p = rolePermissions(USER, roles, config, grants);
		assert.equal(p.canManageDatabaseAccess, true);
		assert.equal(p.canManageUploadAccess, true);
		assert.equal(p.canManageAdminAccess, label === 'Full Admin');
		for (const capability of [
			'canViewTickets',
			'canViewBackups',
			'canManageMaintenance',
			'isOwner',
		])
			assert.equal(p[capability], false);
		if (label === 'Admin panel') {
			assert.equal(p.databaseAccess, false);
			assert.equal(p.canUpload, false);
		}
	});

for (const actor of ['admin', 'owner-role', 'full-admin'])
	test(actor + ' grant routes enforce the same permissions as the UI', async () => {
		const db = database(),
			env = { ...config, ACCESS_DB: db },
			background = [];
		if (actor === 'admin') grant(db, 'admin_panel_access');
		if (actor === 'full-admin') grant(db, 'full_admin_access');
		await withNetwork(
			async () => {
				for (const path of [
					'/api/admin/database-access',
					'/api/admin/upload-access',
					'/api/admin/admin-panel-access',
					'/api/admin/full-admin-access',
					'/api/admin/full-admin',
				]) {
					const result = await runtime.fetch(
						await request(path, 'POST', { userId: TARGET }, USER),
						env,
						{ waitUntil: (p) => background.push(p) }
					);
					assert.equal(
						result.status,
						path.includes('database-access') ||
							path.includes('upload-access') ||
							actor === 'full-admin'
							? 200
							: 403,
						path
					);
				}
				for (const path of [
					'/api/admin/backups',
					'/api/admin/maintenance',
					'/api/admin/bug-tickets',
				])
					assert.equal(
						(await runtime.fetch(await request(path, 'GET', null, USER), env, {})).status,
						403,
						path
					);
				await Promise.allSettled(background);
			},
			actor === 'owner-role' ? [config.DISCORD_OWNER_ROLE_ID] : []
		);
		db.sqlite.close();
	});

for (const path of ['/api/admin/full-admin', '/api/admin/full-admin-access'])
	test('Full Admin revoke clears every legacy grant atomically: ' + path, async () => {
		const db = database(),
			env = { ...config, ACCESS_DB: db };
		for (const table of [
			'database_access',
			'upload_access',
			'admin_panel_access',
			'full_admin_access',
		])
			grant(db, table, TARGET);
		await withNetwork(async () => {
			const result = path.endsWith('-access')
				? await runtime.fetch(await request(path, 'DELETE', { userId: TARGET }), env, {})
				: await fullAdminApi(await request(path, 'DELETE', { userId: TARGET }), env, {});
			assert.equal(result.status, 200);
		});
		for (const table of [
			'database_access',
			'upload_access',
			'admin_panel_access',
			'full_admin_access',
		])
			assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
		assert.equal(
			rolePermissions(TARGET, [config.DISCORD_DATABASE_ROLE_ID], env).databaseAccess,
			true,
			'Discord Team access remains independent'
		);
		db.sqlite.close();
	});

for (const path of [
	'/api/admin/full-admin',
	'/api/admin/database-access',
	'/api/admin/maintenance',
	'/api/favorites',
	'/api/admin/bug-tickets/1/delete',
])
	test('Cross-origin mutation is rejected at the outer route: ' + path, async () => {
		const result = await runtime.fetch(
			await request(path, 'POST', { userId: TARGET }, OWNER, 'https://other.test'),
			config,
			{}
		);
		assert.equal(result.status, 403);
	});

test('Maintenance keeps login and its own assets reachable; Full Admin gets no bypass', async () => {
	const db = database();
	db.sqlite.exec(
		"CREATE TABLE site_settings(key TEXT PRIMARY KEY,value TEXT);INSERT INTO site_settings VALUES('maintenance','1'),('maintenance_message','Test maintenance');"
	);
	grant(db, 'full_admin_access');
	const env = {
		...config,
		ACCESS_DB: db,
		ASSETS: {
			fetch: async () => new Response('asset', { headers: { 'Content-Type': 'image/webp' } }),
		},
	};
	await withNetwork(async () => {
		assert.equal((await runtime.fetch(new Request(config.SITE_URL + '/'), env, {})).status, 503);
		assert.equal((await runtime.fetch(await request('/', 'GET', null, USER), env, {})).status, 503);
		assert.equal((await runtime.fetch(await request('/'), env, {})).status, 200);
		assert.equal(
			(await runtime.fetch(new Request(config.SITE_URL + '/assets/bp-logo.webp'), env, {})).status,
			200
		);
		assert.equal(
			(await runtime.fetch(new Request(config.SITE_URL + '/auth/discord'), env, {})).status,
			302
		);
		const api = await runtime.fetch(await request('/api/setups', 'GET', null, USER), env, {});
		assert.equal(api.status, 503);
		assert.equal((await api.json()).success, false);
	});
	db.sqlite.close();
});

async function ticket(db, status = 'open') {
	const value = await createTicket(
		{
			reportId: crypto.randomUUID(),
			user: { id: USER, username: 'Reporter' },
			title: 'Broken download',
			priority: 'High',
			description: 'A reproducible bug',
		},
		{ ACCESS_DB: db }
	);
	if (status !== 'open')
		db.sqlite.prepare('UPDATE bug_tickets SET status=? WHERE id=?').run(status, value.id);
	return value;
}
test('Only closed tickets delete; no DM; IDs remain consumed even after deleting the newest row', async () => {
	const db = database(),
		env = { ...config, ACCESS_DB: db };
	const open = await ticket(db),
		closed = await ticket(db, 'closed');
	const previous = globalThis.fetch;
	globalThis.fetch = async () => {
		throw Error('Deleting must not contact Discord');
	};
	try {
		assert.equal(
			(
				await ticketApi(
					await request('/api/admin/bug-tickets/' + open.id + '/delete', 'DELETE'),
					env
				)
			).status,
			409
		);
		assert.equal(
			(
				await ticketApi(
					await request('/api/admin/bug-tickets/' + closed.id + '/delete', 'DELETE'),
					env
				)
			).status,
			200
		);
		assert.equal(
			(
				await ticketApi(
					await request('/api/admin/bug-tickets/' + closed.id + '/delete', 'DELETE'),
					env
				)
			).status,
			200
		);
		const next = await ticket(db);
		assert.ok(next.id > closed.id);
	} finally {
		globalThis.fetch = previous;
		db.sqlite.close();
	}
});
for (const failure of ['blocked', 'network', 'missing-token'])
	test('Closing persists despite DM failure: ' + failure, async () => {
		const db = database(),
			item = await ticket(db),
			env = {
				...config,
				ACCESS_DB: db,
				...(failure === 'missing-token' ? { DISCORD_BOT_TOKEN: '' } : {}),
			},
			previous = globalThis.fetch;
		globalThis.fetch = async () => {
			if (failure === 'network') throw Error('offline');
			return Response.json({}, { status: 403 });
		};
		try {
			const result = await ticketApi(
				await request('/api/admin/bug-tickets/' + item.id + '/close', 'POST', {
					resolution: 'Fixed',
				}),
				env
			);
			assert.equal(result.status, 200);
			assert.equal((await result.json()).notificationDelivered, false);
			assert.equal(
				db.sqlite.prepare('SELECT status,resolution FROM bug_tickets').get().status,
				'closed'
			);
		} finally {
			globalThis.fetch = previous;
			db.sqlite.close();
		}
	});
test('Concurrent close actions send at most one complete closing DM', async () => {
	const db = database(),
		item = await ticket(db),
		env = { ...config, ACCESS_DB: db },
		previous = globalThis.fetch,
		sent = [];
	globalThis.fetch = async (url, options) => {
		if (String(url).endsWith('/messages')) sent.push(JSON.parse(options.body));
		return Response.json({ id: '444444444444444444' });
	};
	try {
		const req = () =>
			request('/api/admin/bug-tickets/' + item.id + '/close', 'POST', { resolution: 'Fixed' });
		await Promise.all([req().then((r) => ticketApi(r, env)), req().then((r) => ticketApi(r, env))]);
		assert.equal(sent.length, 1);
		assert.equal(sent[0].embeds[0].fields[0].value, 'Fixed');
		assert.equal(sent[0].embeds[0].color, 0x3498db);
	} finally {
		globalThis.fetch = previous;
		db.sqlite.close();
	}
});
test('Ticket summary counts beyond the old 250-row listing limit', async () => {
	const db = database(),
		item = await ticket(db);
	const stmt = db.sqlite.prepare(
		"INSERT INTO bug_tickets(report_id,reporter_id,reporter_name,title,priority,description,status)VALUES(?,?,?,?,?,?,'open')"
	);
	for (let i = 0; i < 260; i++) stmt.run('report-' + i, USER, 'User', 'Bug', 'Low', 'Text');
	const result = await ticketApi(await request('/api/admin/bug-tickets?summary=1'), {
		...config,
		ACCESS_DB: db,
	});
	assert.equal((await result.json()).counts.open, 261);
	assert.equal(item.id, 1);
	db.sqlite.close();
});

function reportRequest(id) {
	const body = new FormData();
	for (const [key, value] of Object.entries({
		title: 'Broken download',
		priority: 'High',
		description: 'The download could not be started.',
		reportId: id,
	}))
		body.set(key, value);
	return new Request(config.SITE_URL + '/api/bug-reports', {
		method: 'POST',
		headers: { Origin: config.SITE_URL },
		body,
	});
}
test('Owner reports create one complete DM; concurrent reporter submits create one ticket and one DM per recipient', async () => {
	const db = database(),
		env = { ...config, ACCESS_DB: db },
		previous = globalThis.fetch,
		sent = [];
	globalThis.fetch = async (url, options) => {
		sent.push({ url: String(url), body: JSON.parse(options.body) });
		return Response.json({ id: '444444444444444444' });
	};
	try {
		assert.equal(
			(await submitBugReport(reportRequest('a'.repeat(25)), { id: OWNER, username: 'Lukas' }, env))
				.status,
			200
		);
		assert.equal(sent.length, 2);
		assert.match(sent[1].body.embeds[0].title, /Ticket 0001 erstellt/);
		assert.equal(sent[1].body.embeds[0].fields[0].value, '<@' + OWNER + '>');
		sent.length = 0;
		const results = await Promise.all([
			submitBugReport(reportRequest('b'.repeat(25)), { id: USER }, env),
			submitBugReport(reportRequest('b'.repeat(25)), { id: USER }, env),
		]);
		assert.deepEqual(results.map((r) => r.status).sort(), [200, 429]);
		assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM bug_tickets').get().n, 2);
		assert.equal(sent.filter((call) => call.url.endsWith('/messages')).length, 2);
		assert.ok(
			sent.filter((call) => call.url.endsWith('/messages')).every((call) => call.body.enforce_nonce)
		);
	} finally {
		globalThis.fetch = previous;
		db.sqlite.close();
	}
});

for (const fail of ['github', 'discord'])
	test('Audit destinations remain independent when ' + fail + ' fails', async () => {
		const previous = globalThis.fetch,
			calls = [];
		globalThis.fetch = async (url) => {
			calls.push(String(url));
			return new Response('{}', {
				status: String(url).includes(fail === 'github' ? 'api.github.com' : 'discord.com')
					? 503
					: 200,
			});
		};
		try {
			const result = await writeSetupAuditEvent(
				{ action: 'PERMISSION_GRANT', discordUserId: OWNER, targetDiscordUserId: USER },
				{ ...config, DISCORD_AUDIT_CHANNEL_ID: '1564325702344507442' }
			);
			assert.equal(result.category, 'RECHTE_UND_ADMINISTRATION');
			assert.equal(calls.length, 2);
		} finally {
			globalThis.fetch = previous;
		}
	});

const completeTree = {
	truncated: false,
	tree: [
		{ type: 'blob', path: 'setups/Hypercar/Alpine A424/Alpine Spa GO.zip' },
		{ type: 'blob', path: 'setups/Hypercar/Alpine A424/bA2_Alpine_Spa.zip' },
		{ type: 'blob', path: 'setups/Hypercar/Alpine A424/Alpine Spa HYMO.zip' },
		{ type: 'blob', path: 'setups/Hypercar/Alpine A424/Other.zip' },
		{ type: 'tree', path: 'setups/Hypercar/Alpine A424/folder.zip' },
		{ type: 'blob', path: 'audit-logs/not-a-setup.zip' },
	],
};
test('Complete summary groups vehicles and all manufacturer aliases without counting unrelated files', () => {
	assert.deepEqual(buildSetupSummary(completeTree), [
		{
			category: 'Hypercar',
			vehicle: 'Alpine A424',
			count: 4,
			manufacturers: { GO: 1, HYMO: 1, beAlien: 1, other: 1 },
		},
	]);
	for (const invalid of [{ truncated: true, tree: [] }, { tree: [] }, null])
		assert.throws(() => buildSetupSummary(invalid));
});
test('Summary uses one GitHub call, is protected and never turns upstream failures into zero', async () => {
	const previous = globalThis.fetch,
		calls = [];
	let body = completeTree,
		status = 200;
	globalThis.fetch = async (url) => {
		calls.push(String(url));
		return Response.json(body, { status });
	};
	try {
		const db = database(),
			env = { ...config, ACCESS_DB: db };
		assert.equal(
			(await setupSummary(new Request(config.SITE_URL + '/api/setups/summary'), env)).status,
			401
		);
		assert.equal(calls.length, 0);
		let response = await setupSummary(await request('/api/setups/summary'), env);
		assert.equal(response.status, 200);
		assert.equal((await response.json()).vehicles[0].count, 4);
		assert.equal(calls.length, 1);
		assert.match(calls[0], /git\/trees\/main\?recursive=1/);
		body = { truncated: true, tree: [] };
		assert.equal((await setupSummary(await request('/api/setups/summary'), env)).status, 502);
		status = 503;
		assert.equal((await setupSummary(await request('/api/setups/summary'), env)).status, 502);
		db.sqlite.close();
	} finally {
		globalThis.fetch = previous;
	}
});

test('External profiles use account avatars without a guild lookup; cache only display data', async () => {
	const previous = globalThis.fetch,
		previousCaches = globalThis.caches,
		cache = new Map(),
		calls = [];
	globalThis.caches = {
		default: {
			match: async (key) => cache.get(key.url)?.clone(),
			put: async (key, response) => cache.set(key.url, response),
		},
	};
	globalThis.fetch = async (url, options) => {
		calls.push(String(url));
		assert.ok(options.signal);
		return Response.json({ id: USER, global_name: 'External racer', avatar: 'custom-avatar' });
	};
	try {
		const first = await discordProfile(USER, config),
			second = await discordProfile(USER, config);
		assert.deepEqual(second, first);
		assert.match(first.avatar, /avatars\/222222222222222222\/custom-avatar.png/);
		assert.equal(calls.length, 1);
		assert.ok(!calls[0].includes('/guilds/'));
		assert.equal((await mapProfiles([{ user_id: USER }], config))[0].username, 'External racer');
	} finally {
		globalThis.fetch = previous;
		if (previousCaches === undefined) delete globalThis.caches;
		else globalThis.caches = previousCaches;
	}
});

test('Startup checks share one request while each consumer can read its own response', async () => {
	let calls = 0;
	const context = vm.createContext({
		window: {},
		Date,
		fetch: async () => {
			calls++;
			return Response.json({ loggedIn: true });
		},
	});
	vm.runInContext(
		readFileSync(new URL('../public/js/shared/session.js', import.meta.url), 'utf8').replace(
			'export function',
			'function'
		) + ';window.fetchMeResponse=fetchMeResponse;',
		context
	);
	const responses = await Promise.all(
		Array.from({ length: 3 }, () => context.window.fetchMeResponse())
	);
	assert.equal(calls, 1);
	for (const response of responses) assert.equal((await response.json()).loggedIn, true);
	await context.window.fetchMeResponse(true);
	assert.equal(calls, 2);
});
test('Large grant lists keep their complete rows and bound live Discord requests', async () => {
	const original = globalThis.fetch;
	let requests = 0;
	globalThis.fetch = async (url) => {
		requests++;
		return Response.json({ id: String(url).split('/').pop(), username: 'User' });
	};
	try {
		const rows = Array.from({ length: 100 }, (_, i) => ({
			user_id: String(BigInt(USER) + BigInt(i)),
		}));
		const profiles = await mapProfiles(rows, config);
		assert.equal(profiles.length, 100);
		assert.equal(requests, 32);
		assert.equal(profiles.filter(Boolean).length, 32);
	} finally {
		globalThis.fetch = original;
	}
});

test('Vehicle counts share a summary, filter locally, refresh after mutation and expose failures', async () => {
	const source = readFileSync(new URL('../public/js/home/catalog.js', import.meta.url), 'utf8');
	const code = source
		.slice(source.search(/\n\s*let countRun\s*=/), source.indexOf('export function initCatalog'))
		.replace('export async function', 'async function');
	let calls = 0,
		manufacturer = '',
		failed = false;
	const label = { textContent: '' };
	const card = {
		querySelector(selector) {
			return selector === '.vehicle-name'
				? { textContent: 'Alpine A424' }
				: selector === '.vehicle-class'
					? { textContent: 'Hypercar' }
					: label;
		},
	};
	const context = vm.createContext({
		window: {},
		Date,
		state: {
			get activeMfr() {
				return manufacturer;
			},
		},
		document: {
			documentElement: { dataset: { dbAccess: 'authorized' } },
			querySelectorAll: () => [card],
		},
		fetch: async () => {
			calls++;
			if (failed) throw Error('offline');
			return Response.json({
				success: true,
				complete: true,
				vehicles: buildSetupSummary(completeTree),
			});
		},
	});
	vm.runInContext(
		code +
			';window.readCounts=refreshVehicleCounts;window.refreshVehicleCounts=()=>refreshVehicleCounts(true);',
		context
	);
	await Promise.all([context.window.readCounts(), context.window.readCounts()]);
	assert.equal(calls, 1);
	assert.equal(label.textContent, 'Verfügbare Setups: 4');
	manufacturer = 'beAlien';
	await context.window.readCounts();
	assert.equal(calls, 1);
	assert.equal(label.textContent, 'Verfügbare Setups: 1');
	await context.window.refreshVehicleCounts();
	assert.equal(calls, 2);
	failed = true;
	await context.window.refreshVehicleCounts();
	assert.equal(label.textContent, 'Verfügbare Setups: nicht abrufbar');
});
