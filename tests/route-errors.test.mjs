import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/index.js';
import { repositoryEnv } from './helpers/repository-env.mjs';
import { sessionCookie } from './helpers/session.mjs';

// The uploader is the owner, so no Discord role lookup is needed.
const env = {
	...repositoryEnv,
	DISCORD_OWNER_USER_ID: '123456789012345678',
	SESSION_SECRET: 'route-test',
};

// GitHub, the setup storage, fails on every request.
async function withBrokenStorage(t, run) {
	t.mock.method(globalThis, 'fetch', async () => {
		throw Error('storage unavailable');
	});
	const errors = t.mock.method(console, 'error', () => {});
	await run(await sessionCookie(env.DISCORD_OWNER_USER_ID, env.SESSION_SECRET));
	return errors.mock.calls.map((call) => call.arguments.join(' '));
}

test('setup list answers unexpected errors with a generic 500', async (t) => {
	const logs = await withBrokenStorage(t, async (cookie) => {
		const response = await app.fetch(
			new Request('https://example.test/api/setups?category=Hypercar&vehicle=Test', {
				headers: { Cookie: cookie },
			}),
			env,
			{}
		);
		assert.equal(response.status, 500);
		assert.deepEqual(await response.json(), { success: false, error: 'Interner Serverfehler.' });
	});
	assert.deepEqual(logs, ['Route failed storage unavailable']);
});

// persistSetupFile() turns every GitHub failure into an answer. Hashing the ZIP comes before
// that, so a failing hash is an unexpected storage error.
test('setup upload answers unexpected storage errors with a generic 500', async (t) => {
	const form = new FormData();
	form.set('category', 'Hypercar');
	form.set('vehicle', 'BMW M Hybrid V8');
	form.set('version', 'v1');
	form.set('files', new File(['PK\x03\x04'], 'BMW V8 Spa GO.zip'));
	const logs = await withBrokenStorage(t, async (cookie) => {
		t.mock.method(crypto.subtle, 'digest', async () => {
			throw Error('storage unavailable');
		});
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
