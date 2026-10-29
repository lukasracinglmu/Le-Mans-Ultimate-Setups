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

test('every inline script of the served home page parses', async () => {
	const scripts = [...(await servedHome()).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
		(match) => match[1]
	);
	assert.ok(scripts.length > 0);
	for (const [position, code] of scripts.entries())
		assert.doesNotThrow(
			() => new Function(code),
			`inline script #${position} does not parse: ${code.slice(0, 80)}`
		);
});
