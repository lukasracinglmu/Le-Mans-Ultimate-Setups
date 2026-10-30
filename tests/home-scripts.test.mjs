import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import runtime from '../src/index.js';
import { repositoryEnv } from './helpers/repository-env.mjs';

const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

async function servedHome() {
	const original = globalThis.fetch;
	globalThis.fetch = async () => new Response('', { status: 404 });
	try {
		const env = {
			...repositoryEnv,
			GITHUB_TOKEN: 'test',
			SESSION_SECRET: 'test',
			ASSETS: {
				fetch: async () =>
					new Response(index, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
			},
		};
		const response = await runtime.fetch(new Request('https://example.test/'), env, {
			waitUntil() {},
		});
		return await response.text();
	} finally {
		globalThis.fetch = original;
	}
}

// A syntax error stops a whole module, and every module it imports, without any visible
// error on the page.
test('every script of the served home page exists and parses', async () => {
	const html = await servedHome();
	assert.doesNotMatch(html, /<script>/, 'inline script on the home page');
	const sources = [...html.matchAll(/<script(?: type="module")? src="([^"]+)"><\/script>/g)].map(
		(match) => 'public' + match[1]
	);
	assert.ok(sources.includes('public/js/home/main.js'));
	const modules = readdirSync(new URL('../public/js/home', import.meta.url)).map(
		(file) => 'public/js/home/' + file
	);
	for (const file of new Set([...sources, ...modules])) {
		const result = spawnSync(
			process.execPath,
			['--check', fileURLToPath(new URL('../' + file, import.meta.url))],
			{ encoding: 'utf8' }
		);
		assert.equal(result.status, 0, file + ' does not parse: ' + result.stderr);
	}
});

const main = readFileSync(new URL('../public/js/home/main.js', import.meta.url), 'utf8');

// The buttons had onclick attributes before; main.js must pass the same calls.
const FORMER_ONCLICK = {
	logout: 'logout()',
	'toggle-theme': 'toggleTheme()',
	'show-home': 'showHome()',
};

test('every button with data-action makes the call of its former onclick attribute', async () => {
	const start = main.indexOf('initActions({');
	const handlers = Object.fromEntries(
		[
			...main
				.slice(start, main.indexOf('});', start))
				.matchAll(/'?([\w-]+)'?:\s*\(\)\s*=>\s*(\w+\(\))/g),
		].map((match) => [match[1], match[2]])
	);
	assert.deepEqual(handlers, FORMER_ONCLICK);
	const actions = [...index.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
	assert.deepEqual([...actions].sort(), Object.keys(FORMER_ONCLICK).sort());
	// actions.js binds every element to the handler of its data-action.
	const { initActions } = await import('../public/js/home/actions.js');
	const elements = actions.map((action) => ({
		dataset: { action },
		listeners: [],
		addEventListener(type, listener) {
			this.listeners.push([type, listener]);
		},
	}));
	const calls = [];
	globalThis.document = { querySelectorAll: () => elements };
	try {
		initActions(Object.fromEntries(actions.map((action) => [action, () => calls.push(action)])));
	} finally {
		delete globalThis.document;
	}
	for (const element of elements) {
		assert.deepEqual(
			element.listeners.map(([type]) => type),
			['click']
		);
		element.listeners[0][1]();
	}
	assert.deepEqual(calls, actions);
});

test('an authorized visitor first gets the catalog, then the vehicle from the URL', () => {
	const start = main.indexOf('async onAuthorized()');
	const steps = main.slice(start, main.indexOf('},', start));
	assert.match(steps, /await loadData\(\);[\s\S]*await openSetupFromQuery\(\);/);
});
