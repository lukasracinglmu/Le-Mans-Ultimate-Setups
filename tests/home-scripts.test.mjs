import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
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
