import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccessCheck } from '../public/js/home/access.js';
import { state } from '../public/js/home/state.js';

// Runs the access check of the home page against a fake DOM and a fake /api/me.
async function run(data, { ok = true, invalid = false, network = false } = {}) {
	const nodes = new Map();
	let authorized = 0,
		requests = 0;
	const node = () => ({
		innerHTML: '',
		classList: { add() {}, remove() {}, toggle() {} },
		style: {},
		addEventListener() {},
		remove() {
			nodes.delete('databaseAccessState');
		},
	});
	for (const id of ['loginButton', 'account', 'accountName', 'accountAvatar', 'retryRoleCheck'])
		nodes.set(id, node());
	const root = { dataset: {} },
		main = {
			prepend(el) {
				nodes.set(el.id, el);
			},
		};
	const original = {
		document: globalThis.document,
		fetch: globalThis.fetch,
		setTimeout: globalThis.setTimeout,
	};
	globalThis.document = {
		documentElement: root,
		getElementById: (id) => nodes.get(id) || null,
		querySelector: () => main,
		querySelectorAll: () => [],
		createElement: node,
	};
	globalThis.fetch = async () => {
		requests++;
		if (network) throw Error('offline');
		return {
			ok,
			clone() {
				return { ...this };
			},
			json: async () => {
				if (invalid) throw Error('bad json');
				return data;
			},
		};
	};
	// Retries wait without delay in the test.
	globalThis.setTimeout = (fn) => {
		fn();
		return 0;
	};
	state.currentUser = null;
	try {
		const authorize = createAccessCheck({
			async onAuthorized() {
				authorized++;
			},
		});
		await authorize();
	} finally {
		Object.assign(globalThis, original);
	}
	return {
		mode: root.dataset.dbAccess,
		html: nodes.get('databaseAccessState')?.innerHTML || '',
		authorized,
		requests,
	};
}
test('temporary Discord errors do not pretend the user has missing roles', async () => {
	const s = await run({
		loggedIn: true,
		databaseAccess: false,
		rolesAvailable: false,
		reauthorize: false,
		user: {},
	});
	assert.equal(s.mode, 'unavailable');
	assert.match(s.html, /Erneut prüfen/);
	assert.doesNotMatch(s.html, /erforderliche Discord-Rolle/);
});
test('expired or missing membership authorization gets an actionable login link', async () => {
	const s = await run({
		loggedIn: true,
		databaseAccess: false,
		rolesAvailable: false,
		reauthorize: true,
		user: {},
	});
	assert.equal(s.mode, 'reauthorize');
	assert.match(s.html, /href="\/auth\/discord"/);
});
test('actual role denial stays distinct from an unavailable service', async () => {
	const s = await run({ loggedIn: true, databaseAccess: false, rolesAvailable: true, user: {} });
	assert.equal(s.mode, 'forbidden');
	assert.equal(s.requests, 1);
});
test('authorized Team accounts continue to the database', async () => {
	const s = await run({
		loggedIn: true,
		databaseAccess: true,
		rolesAvailable: true,
		user: { username: 'Team', canUpload: false },
	});
	assert.equal(s.mode, 'authorized');
	// main.js loads the catalog and restores the route in onAuthorized.
	assert.equal(s.authorized, 1);
});
test('anonymous user still sees normal Discord login', async () => {
	const s = await run({ loggedIn: false, databaseAccess: false });
	assert.equal(s.mode, 'login');
});
test('invalid or failed API responses do not silently log the user out', async () => {
	for (const opts of [{ ok: false }, { invalid: true }, { network: true }]) {
		const s = await run({}, opts);
		assert.equal(s.mode, 'unavailable');
	}
});
test('rate limited checks stop immediate retry storms', async () => {
	const s = await run({
		loggedIn: true,
		databaseAccess: false,
		rolesAvailable: false,
		roleCheckError: 'RATE_LIMITED',
		retryAfterMs: 60000,
		user: {},
	});
	assert.equal(s.mode, 'unavailable');
	assert.equal(s.requests, 1);
});
