import assert from 'node:assert/strict';
import test from 'node:test';
import { submitBugReport, reportImage } from '../src/bug-reports.js';
import runtime from '../src/runtime-worker.js';
import { repositoryEnv } from './helpers/repository-env.mjs';
const user = { id: '222222222222222222', username: 'Reporter' },
	reportId = 'a'.repeat(25),
	channelId = '333333333333333333',
	messageId = '444444444444444444',
	reporterChannelId = '555555555555555555',
	owner = '1033453785416208564';
function database() {
	let row = null;
	const tickets = [];
	const statement = (sql, values = []) => ({
		bind(...next) {
			return statement(sql, next);
		},
		async first() {
			if (sql.includes('FROM bug_report_limits')) return row ? { ...row } : null;
			if (sql.includes('FROM bug_tickets'))
				return tickets.find((ticket) => ticket.report_id === values[0]) ?? null;
			if (sql.startsWith('INSERT INTO bug_report_limits')) {
				const [userId, now, id] = values;
				row = { user_id: userId, last_attempt_at: now, report_id: id, status: 'sending' };
				return { user_id: userId };
			}
			if (sql.startsWith('INSERT INTO bug_tickets')) {
				const ticket = { id: tickets.length + 1, report_id: values[0], title: values[3] };
				tickets.push(ticket);
				return { id: ticket.id };
			}
			throw Error('Unexpected first: ' + sql);
		},
		async run() {
			if (/status\s*=\s*'sent'/.test(sql)) row.status = 'sent';
			else if (/status\s*=\s*'failed'/.test(sql)) row.status = 'failed';
			return { success: true };
		},
	});
	return {
		get row() {
			return row;
		},
		get tickets() {
			return tickets;
		},
		async batch() {
			return [];
		},
		prepare(sql) {
			return statement(sql);
		},
	};
}
function request({
	title = 'Upload-Liste',
	description = 'Beim Hochladen wird die Liste nicht aktualisiert.',
	priority = 'Medium',
	id = reportId,
	image,
	origin = 'https://example.test',
	headers = {},
} = {}) {
	const form = new FormData();
	form.set('title', title);
	form.set('description', description);
	form.set('priority', priority);
	form.set('reportId', id);
	if (image) form.set('image', image);
	return new Request('https://example.test/api/bug-reports', {
		method: 'POST',
		headers: { Origin: origin, ...headers },
		body: form,
	});
}
async function harness(run, { dmStatus = 200, messageStatus = 200, missingId = false } = {}) {
	const original = globalThis.fetch,
		calls = [],
		env = {
			DISCORD_BOT_TOKEN: 'server-only-bot-secret',
			DISCORD_OWNER_USER_ID: owner,
			ACCESS_DB: database(),
		};
	globalThis.fetch = async (url, options) => {
		calls.push({ url: String(url), options });
		assert.ok(String(url).startsWith('https://discord.com/api/v10/'));
		assert.equal(options.headers.Authorization, 'Bot ' + env.DISCORD_BOT_TOKEN);
		if (String(url).endsWith('/users/@me/channels')) {
			const recipient = JSON.parse(options.body).recipient_id;
			if (recipient === owner) return Response.json({ id: channelId }, { status: dmStatus });
			assert.equal(recipient, user.id);
			return Response.json({ id: reporterChannelId });
		}
		return Response.json(missingId ? {} : { id: messageId }, { status: messageStatus });
	};
	try {
		await run({ calls, env });
	} finally {
		globalThis.fetch = original;
	}
}
test('bug report is sent to the fixed owner DM with reporter identity and no allowed mentions', async () => {
	await harness(async ({ calls, env }) => {
		const description = 'Die Suche hängt. @everyone <@&1538601074074849330>';
		const r = await submitBugReport(request({ description, priority: 'High' }), user, env);
		assert.equal(r.status, 200);
		assert.deepEqual(await r.json(), { success: true, ticket: '0001' });
		assert.equal(calls.length, 4);
		assert.equal(calls[1].url, 'https://discord.com/api/v10/channels/' + channelId + '/messages');
		const payload = JSON.parse(calls[1].options.body);
		assert.equal(payload.embeds[0].title, 'Ticket 0001 erstellt · Upload-Liste');
		assert.equal(payload.embeds[0].description, description);
		assert.match(payload.embeds[0].fields[0].value, new RegExp(user.id));
		assert.deepEqual(payload.embeds[0].fields.slice(1), [
			{ name: 'Priorität', value: 'High' },
			{ name: 'Ticket-Nummer', value: 'Ticket 0001' },
		]);
		assert.deepEqual(payload.allowed_mentions, { parse: [] });
		assert.equal(payload.enforce_nonce, true);
		assert.equal(payload.nonce.length, 25);
		assert.equal(env.ACCESS_DB.row.status, 'sent');
		assert.equal(env.ACCESS_DB.tickets[0].title, 'Upload-Liste');
	});
});
test('reporter receives a confirmation DM with the ticket number', async () => {
	await harness(async ({ calls, env }) => {
		assert.equal((await submitBugReport(request(), user, env)).status, 200);
		assert.equal(JSON.parse(calls[2].options.body).recipient_id, user.id);
		assert.equal(
			calls[3].url,
			'https://discord.com/api/v10/channels/' + reporterChannelId + '/messages'
		);
		const confirmation = JSON.parse(calls[3].options.body);
		assert.equal(confirmation.embeds[0].title, 'Ticket 0001 erstellt · Upload-Liste');
		assert.deepEqual(confirmation.allowed_mentions, { parse: [] });
	});
});
test('duplicate submission is confirmed without sending a second DM', async () => {
	await harness(async ({ calls, env }) => {
		assert.equal((await submitBugReport(request(), user, env)).status, 200);
		const retry = await submitBugReport(request(), user, env);
		assert.deepEqual(await retry.json(), { success: true, alreadySent: true, ticket: '0001' });
		assert.equal(calls.length, 4);
		assert.equal(env.ACCESS_DB.tickets.length, 1);
	});
});
test('PNG attachment is forwarded as multipart with a fixed safe filename', async () => {
	const image = new File(
		[new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1])],
		'private-original-name.png',
		{ type: 'image/png' }
	);
	await harness(async ({ calls, env }) => {
		assert.equal((await submitBugReport(request({ image }), user, env)).status, 200);
		const form = calls[1].options.body;
		assert.ok(form instanceof FormData);
		assert.equal(form.get('files[0]').name, 'bug-report.png');
		const payload = JSON.parse(form.get('payload_json'));
		assert.equal(payload.embeds[0].image.url, 'attachment://bug-report.png');
		assert.ok(!form.get('payload_json').includes('private-original-name'));
	});
});
test('other-origin requests and users without site access cannot send reports', async () => {
	await harness(async ({ calls, env }) => {
		assert.equal(
			(await submitBugReport(request({ origin: 'https://evil.test' }), user, env)).status,
			403
		);
		assert.equal((await submitBugReport(request(), null, env)).status, 401);
		const viaRuntime = await runtime.fetch(request(), env, {});
		assert.equal(viaRuntime.status, 403);
		assert.equal((await viaRuntime.json()).success, false);
		assert.equal(calls.length, 0);
	});
});
test('invalid titles, descriptions, priorities, IDs, spoofed images and oversized bodies are rejected before Discord', async () => {
	await harness(async ({ calls, env }) => {
		for (const options of [
			{ title: 'ab' },
			{ title: 'x'.repeat(121) },
			{ description: 'ab' },
			{ description: 'x'.repeat(3501) },
			{ priority: 'Urgent' },
			{ id: 'invalid' },
			{ image: new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }) },
			{
				image: new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'x.jpg', {
					type: 'image/jpeg',
				}),
			},
		])
			assert.equal(
				(await submitBugReport(request(options), user, env)).status,
				400,
				JSON.stringify(Object.keys(options))
			);
		assert.equal(
			(
				await submitBugReport(
					request({ headers: { 'Content-Length': String(6 * 1024 * 1024) } }),
					user,
					env
				)
			).status,
			413
		);
		assert.equal(calls.length, 0);
		assert.equal(env.ACCESS_DB.tickets.length, 0);
	});
});
test('separate reports from the same user send immediately without cooldown', async () => {
	await harness(async ({ calls, env }) => {
		assert.equal((await submitBugReport(request(), user, env)).status, 200);
		const next = await submitBugReport(request({ id: 'b'.repeat(25) }), user, env);
		assert.equal(next.status, 200);
		assert.equal(next.headers.get('Retry-After'), null);
		assert.equal(calls.length, 8);
		assert.equal(env.ACCESS_DB.tickets.length, 2);
	});
});
for (const options of [{ dmStatus: 403 }, { messageStatus: 403 }, { missingId: true }])
	test(
		'Discord failure does not produce a false delivery confirmation ' + JSON.stringify(options),
		async () => {
			await harness(async ({ env }) => {
				const r = await submitBugReport(request(), user, env);
				assert.equal(r.status, 502);
				assert.equal((await r.json()).success, false);
				assert.equal(env.ACCESS_DB.row.status, 'failed');
			}, options);
		}
	);
test('reports are unavailable while no owner is configured', async () => {
	await harness(async ({ calls, env }) => {
		delete env.DISCORD_OWNER_USER_ID;
		const r = await submitBugReport(request(), user, env);
		assert.equal(r.status, 503);
		assert.equal(calls.length, 0);
		assert.equal(env.ACCESS_DB.tickets.length, 0);
	});
});
test('supported images have canonical MIME types, while empty optional attachment is ignored', async () => {
	assert.equal(await reportImage(null), null);
	assert.equal(await reportImage(new File([], 'empty.png')), null);
	const jpg = await reportImage(
		new File([new Uint8Array([255, 216, 255, 1])], 'a.jpg', { type: 'image/jpeg' })
	);
	assert.equal(jpg.name, 'bug-report.jpg');
	const webp = await reportImage(new File(['RIFF0000WEBP'], 'a.webp', { type: 'image/webp' }));
	assert.equal(webp.name, 'bug-report.webp');
});

const sessionEnv = {
	SESSION_SECRET: 'test-session-signing-key',
	DISCORD_GUILD_ID: '1464926567401652418',
	DISCORD_DATABASE_ROLE_ID: '1464926567401652420',
	DISCORD_UPLOAD_ROLE_ID: '1538601074074849330',
	DISCORD_OWNER_ROLE_ID: '1464926567401652423',
	DISCORD_OWNER_USER_ID: '1033453785416208564',
};
async function databaseRoleCookie() {
	const configuration = [
		sessionEnv.DISCORD_GUILD_ID,
		sessionEnv.DISCORD_DATABASE_ROLE_ID,
		sessionEnv.DISCORD_UPLOAD_ROLE_ID,
		sessionEnv.DISCORD_OWNER_ROLE_ID,
	].join(':');
	const payload = Buffer.from(
		JSON.stringify({
			id: user.id,
			username: user.username,
			accessToken: 'test-oauth',
			exp: Math.floor(Date.now() / 1000) + 3600,
			memberSnapshot: {
				userId: user.id,
				configuration,
				roles: [sessionEnv.DISCORD_DATABASE_ROLE_ID],
				checkedAt: Date.now(),
			},
		})
	).toString('base64url');
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(sessionEnv.SESSION_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = Buffer.from(
		await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
	).toString('base64url');
	return 'lmu_session=' + payload + '.' + signature;
}
test('report page comes from the canonical asset path without a redirect loop', async () => {
	const original = globalThis.fetch;
	const repositoryReads = [];
	globalThis.fetch = async (url) => {
		if (String(url).includes('/contents/')) repositoryReads.push(String(url));
		return new Response('', { status: 404 });
	};
	try {
		const paths = [];
		const env = {
			...sessionEnv,
			...repositoryEnv,
			GITHUB_TOKEN: 'test',
			ASSETS: {
				fetch(req) {
					paths.push(new URL(req.url).pathname);
					return new Response('<!doctype html><h1>Bug melden</h1>');
				},
			},
		};
		const response = await runtime.fetch(
			new Request('https://example.test/bug-report', {
				headers: { Cookie: await databaseRoleCookie() },
			}),
			env,
			{}
		);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('Location'), null);
		const csp = response.headers.get('Content-Security-Policy');
		assert.match(csp, /frame-ancestors 'none'/);
		// The protected pages load their scripts and styles from files only.
		assert.equal(
			csp
				.split(';')
				.map((directive) => directive.trim())
				.find((directive) => directive.startsWith('script-src')),
			"script-src 'self'"
		);
		assert.match(csp, /(^|; )style-src 'self'(;|$)/);
		assert.deepEqual(paths, ['/bug-report']);
		assert.deepEqual(repositoryReads, []);
	} finally {
		globalThis.fetch = original;
	}
});
test('report page stays hidden for visitors without site access', async () => {
	const original = globalThis.fetch;
	globalThis.fetch = async () => new Response('', { status: 404 });
	try {
		const response = await runtime.fetch(
			new Request('https://example.test/bug-report'),
			{ ...sessionEnv, ASSETS: { fetch: () => new Response('<h1>Bug melden</h1>') } },
			{}
		);
		assert.equal(response.status, 404);
	} finally {
		globalThis.fetch = original;
	}
});
test('Discord rate limit is surfaced with Retry-After instead of a false success', async () => {
	await harness(
		async ({ env }) => {
			const r = await submitBugReport(request(), user, env);
			assert.equal(r.status, 429);
			assert.equal(r.headers.get('Retry-After'), '60');
			assert.equal((await r.json()).success, false);
		},
		{ messageStatus: 429 }
	);
});

test('three trimmed characters are accepted', async () => {
	await harness(async ({ env }) => {
		assert.equal(
			(await submitBugReport(request({ title: ' abc ', description: ' abc ' }), user, env)).status,
			200
		);
	});
});
