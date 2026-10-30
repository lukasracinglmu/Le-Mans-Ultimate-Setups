import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/index.js';
import worker from '../src/worker.js';

const uploader = { loggedIn: true, user: { id: '123456789012345678', canUpload: true } };

// The older worker answers the profile and fails on everything else.
async function withBrokenWorker(t, run) {
	const original = worker.fetch;
	const errors = t.mock.method(console, 'error', () => {});
	worker.fetch = async (request) => {
		if (new URL(request.url).pathname === '/api/me') return Response.json(uploader);
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
		const response = await app.fetch(
			new Request('https://example.test/api/setups/upload', { method: 'POST', body: form }),
			{},
			{}
		);
		assert.equal(response.status, 500);
		assert.deepEqual(await response.json(), { success: false, error: 'Interner Serverfehler.' });
	});
	assert.deepEqual(logs, ['Route failed storage unavailable']);
});
