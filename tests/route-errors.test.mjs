import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/index.js';
import worker from '../src/worker.js';
import { sessionCookie } from './helpers/session.mjs';

// The uploader is the owner, so no Discord role lookup is needed.
const env = { DISCORD_OWNER_USER_ID: '123456789012345678', SESSION_SECRET: 'route-test' };

// The older worker stores and lists the setups and fails on every request.
async function withBrokenWorker(t, run) {
	const original = worker.fetch;
	const errors = t.mock.method(console, 'error', () => {});
	worker.fetch = async () => {
		throw Error('storage unavailable');
	};
	try {
		await run();
	} finally {
		worker.fetch = original;
	}
	return errors.mock.calls.map((call) => call.arguments.join(' '));
}

test('setup list answers unexpected errors with a generic 500', async (t) => {
	const logs = await withBrokenWorker(t, async () => {
		const response = await app.fetch(
			new Request('https://example.test/api/setups?category=Hypercar&vehicle=Test'),
			{},
			{}
		);
		assert.equal(response.status, 500);
		assert.deepEqual(await response.json(), { success: false, error: 'Interner Serverfehler.' });
	});
	assert.deepEqual(logs, ['Route failed storage unavailable']);
});

test('setup upload answers unexpected storage errors with a generic 500', async (t) => {
	const form = new FormData();
	form.set('category', 'Hypercar');
	form.set('vehicle', 'Test');
	form.set('version', 'v1');
	form.set('files', new File(['PK\x03\x04'], 'GO_Test_Spa.zip'));
	const logs = await withBrokenWorker(t, async () => {
		const cookie = await sessionCookie(env.DISCORD_OWNER_USER_ID, env.SESSION_SECRET);
		const response = await app.fetch(
			new Request('https://example.test/api/setups/upload', {
				method: 'POST',
				headers: { Cookie: cookie },
				body: form,
			}),
			env,
			{}
		);
		assert.equal(response.status, 500);
		assert.deepEqual(await response.json(), { success: false, error: 'Interner Serverfehler.' });
	});
	assert.deepEqual(logs, ['Route failed storage unavailable']);
});
