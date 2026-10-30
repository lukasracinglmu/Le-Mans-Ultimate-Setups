import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/index.js';
import { repositoryEnv } from './helpers/repository-env.mjs';

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('hex');
const env = { ...repositoryEnv, DISCORD_BOT_TOKEN: 'bot', SESSION_SECRET: 'test' };

async function signedInteraction(interaction) {
	const body = JSON.stringify(interaction);
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signature = Buffer.from(
		await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(timestamp + body))
	).toString('hex');
	return new Request('https://example.test/interactions/discord', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Signature-Ed25519': signature,
			'X-Signature-Timestamp': timestamp,
		},
		body,
	});
}

async function answer(interaction) {
	const original = globalThis.fetch;
	globalThis.fetch = async (url) =>
		String(url).endsWith('/oauth2/applications/@me')
			? Response.json({ verify_key: publicKey })
			: Response.json({ message: 'unexpected request' }, { status: 500 });
	try {
		return await app.fetch(await signedInteraction(interaction), env, { waitUntil() {} });
	} finally {
		globalThis.fetch = original;
	}
}

// Discord shows "interaction failed" unless every interaction gets an answer.
for (const [label, interaction] of [
	['an unknown command', { type: 2, data: { name: 'unknown' } }],
	['an unknown button', { type: 3, data: { custom_id: 'something_else' } }],
	['an unknown modal', { type: 5, data: { custom_id: 'other_modal', components: [] } }],
]) {
	test(label + ' gets the ephemeral "not supported" answer', async () => {
		const response = await answer(interaction);
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			type: 4,
			data: { content: 'Nicht unterstützt.', flags: 64 },
		});
	});
}

test('a ping still gets a pong', async () => {
	const response = await answer({ type: 1 });
	assert.deepEqual(await response.json(), { type: 1 });
});
