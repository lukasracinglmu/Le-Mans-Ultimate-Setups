import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import runtime from '../src/runtime-worker.js';
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

// A syntax error stops a whole script without any visible error on the page.
test('every script of the served home page exists and parses', async () => {
	const html = await servedHome();
	assert.doesNotMatch(html, /<script>/, 'inline script on the home page');
	const sources = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);
	assert.ok(sources.length > 0);
	for (const src of sources) {
		const code = readFileSync(new URL('../public' + src, import.meta.url), 'utf8');
		assert.doesNotThrow(() => new Function(code), src + ' does not parse');
	}
});

// The buttons had onclick attributes before; actions.js must make the same calls.
const FORMER_ONCLICK = {
	logout: 'logout()',
	'toggle-theme': 'toggleTheme()',
	'show-home': 'showHome()',
};

test('every button with data-action makes the call of its former onclick attribute', () => {
	const elements = [...index.matchAll(/data-action="([^"]+)"/g)].map(([, action]) => ({
		dataset: { action },
		listeners: [],
		addEventListener(type, listener) {
			this.listeners.push([type, listener]);
		},
	}));
	assert.deepEqual(
		elements.map((element) => element.dataset.action).sort(),
		Object.keys(FORMER_ONCLICK).sort()
	);
	const calls = [];
	const context = { document: { querySelectorAll: () => elements } };
	for (const call of Object.values(FORMER_ONCLICK)) {
		const name = call.slice(0, call.indexOf('('));
		context[name] = (...args) => calls.push(name + '(' + args.join(',') + ')');
	}
	vm.runInNewContext(
		readFileSync(new URL('../public/js/home/actions.js', import.meta.url), 'utf8'),
		context
	);
	for (const element of elements) {
		assert.equal(element.listeners.length, 1);
		const [type, listener] = element.listeners[0];
		assert.equal(type, 'click');
		calls.length = 0;
		listener();
		assert.deepEqual(calls, [FORMER_ONCLICK[element.dataset.action]], element.dataset.action);
	}
});
