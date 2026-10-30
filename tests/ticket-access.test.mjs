import assert from 'node:assert/strict';
import test from 'node:test';
import { ticketApi } from '../src/bug-tickets.js';
import { sessionCookie } from './helpers/session.mjs';

const OWNER = '111111111111111111',
	FIXED_ADMIN = '222222222222222222',
	GRANTED_ADMIN = '333333333333333333',
	MEMBER = '444444444444444444';

function ticketEnv() {
	return {
		DISCORD_OWNER_USER_ID: OWNER,
		DISCORD_FULL_ADMIN_USER_IDS: FIXED_ADMIN,
		DISCORD_GUILD_ID: '555555555555555555',
		DISCORD_BOT_TOKEN: 'test',
		SESSION_SECRET: 'test-secret',
		ACCESS_DB: {
			async batch() {},
			prepare(sql) {
				return {
					bind(...params) {
						this.params = params;
						return this;
					},
					async first() {
						return sql.includes('FROM full_admin_access') && this.params?.[0] === GRANTED_ADMIN
							? { user_id: GRANTED_ADMIN }
							: null;
					},
					async all() {
						return { results: [{ status: 'open', count: 2 }] };
					},
					async run() {
						return { success: true };
					},
				};
			},
		},
	};
}

for (const [who, id, status] of [
	['the owner', OWNER, 200],
	['a fixed full admin', FIXED_ADMIN, 200],
	['a full admin granted in the panel', GRANTED_ADMIN, 403],
	['a member without rights', MEMBER, 403],
])
	test(`${who} gets ${status} from the ticket API`, async () => {
		const original = globalThis.fetch;
		globalThis.fetch = async (url) => {
			assert.ok(String(url).startsWith('https://discord.com/api/v10/guilds/'), String(url));
			return Response.json({ roles: [], user: { username: 'Test' } });
		};
		try {
			const env = ticketEnv();
			const request = new Request('https://example.test/api/admin/bug-tickets?summary=1', {
				headers: { Cookie: await sessionCookie(id, env.SESSION_SECRET) },
			});
			assert.equal((await ticketApi(request, env)).status, status);
		} finally {
			globalThis.fetch = original;
		}
	});
