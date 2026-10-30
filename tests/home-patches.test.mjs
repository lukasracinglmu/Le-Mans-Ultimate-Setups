import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import runtime from '../src/runtime-worker.js';
import { repositoryEnv } from './helpers/repository-env.mjs';

const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

// Headers of GET / in production before the runtime patches moved into index.html,
// plus the page CSP since the home page has no inline scripts.
const HOME_HEADERS = {
	'cache-control': 'private, no-store',
	'content-security-policy':
		"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: https://cdn.discordapp.com https://media.discordapp.net; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
	'content-type': 'text/html; charset=utf-8',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'strict-transport-security': 'max-age=31536000; includeSubDomains',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
};

async function serveHome(html) {
	const original = globalThis.fetch;
	globalThis.fetch = async () => new Response('', { status: 404 });
	try {
		const env = {
			...repositoryEnv,
			GITHUB_TOKEN: 'test',
			SESSION_SECRET: 'test',
			ASSETS: {
				fetch: async () =>
					new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
			},
		};
		const response = await runtime.fetch(new Request('https://example.test/'), env, {
			waitUntil() {},
		});
		const headers = Object.fromEntries(
			[...response.headers].filter(([name]) => name !== 'content-length').sort()
		);
		return { status: response.status, headers, body: await response.text() };
	} finally {
		globalThis.fetch = original;
	}
}

test('the home page is served exactly as stored in index.html', async () => {
	const served = await serveHome(index);
	assert.equal(served.status, 200);
	assert.equal(served.body, index);
	assert.deepEqual(served.headers, HOME_HEADERS);
});

test('the home page loads the former runtime patches', () => {
	const scripts = [...index.matchAll(/<script src="([^"]+)"><\/script>/g)]
		.map((match) => readFileSync(new URL('../public' + match[1], import.meta.url), 'utf8'))
		.join('\n');
	assert.ok(index.includes('id="manufacturerImage"'), 'manufacturer carousel missing');
	assert.match(scripts, /const setLoginControls\s*=/, 'login controls script missing');
});
