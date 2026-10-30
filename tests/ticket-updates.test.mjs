import assert from 'node:assert/strict';
import test from 'node:test';
import { ticketApi } from '../src/bug-tickets.js';
import { sessionCookie } from './helpers/session.mjs';

const OWNER = '111111111111111111';

const scenarios = [
	['open', 'progress', 'in Bearbeitung'],
	['closed', 'reopen', 'wieder geöffnet'],
	['progress', 'reopen', 'auf Offen gesetzt'],
	['progress', 'progress', null],
	['open', 'reopen', null],
	['closed', 'progress', null],
	['open', 'edit', 'aktualisiert'],
];
for (const [status, action, label] of scenarios)
	for (const failure of [null, 'channel', 'message', 'network'])
		test(`${status} -> ${action}, DM ${failure}`, async () => {
			const original = globalThis.fetch,
				calls = [];
			let saved = false;
			const env = {
				DISCORD_BOT_TOKEN: 'test',
				DISCORD_OWNER_USER_ID: OWNER,
				SESSION_SECRET: 'test-secret',
				ACCESS_DB: {
					async batch() {},
					prepare(sql) {
						return {
							bind() {
								return this;
							},
							async first() {
								return {
									status,
									reporter_id: '222222222222222222',
									title: 'Old',
									description: 'Old',
									priority: 'Low',
								};
							},
							async run() {
								if (sql.startsWith('UPDATE')) saved = true;
								return { meta: { changes: 1 } };
							},
						};
					},
				},
			};
			globalThis.fetch = async (url, options) => {
				assert.ok(saved);
				calls.push(JSON.parse(options.body));
				if (failure === 'network') throw Error('offline');
				return Response.json(
					{ id: '333333333333333333' },
					{
						status:
							(failure === 'channel' && calls.length === 1) ||
							(failure === 'message' && calls.length === 2)
								? 403
								: 200,
					}
				);
			};
			try {
				const request = new Request('https://example.test/api/admin/bug-tickets/7/' + action, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Cookie: await sessionCookie(OWNER, env.SESSION_SECRET),
					},
					body: JSON.stringify({
						title: 'New title',
						description: 'New description',
						priority: 'High',
					}),
				});
				const result = await ticketApi(request, env);
				assert.equal(result.status, status === 'closed' && action === 'progress' ? 409 : 200);
				assert.equal(saved, !!label);
				if (!label) assert.equal(calls.length, 0);
				else {
					assert.equal(calls[0].recipient_id, '222222222222222222');
					if (!failure) {
						assert.equal(calls[1].embeds[0].title, 'Ticket 0007 ' + label);
						assert.deepEqual(calls[1].allowed_mentions, { parse: [] });
					}
				}
			} finally {
				globalThis.fetch = original;
			}
		});
