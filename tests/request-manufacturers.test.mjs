import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	REQUEST_MANUFACTURERS,
	resolveRequestManufacturer,
	setupManufacturerFromFilename,
	setupRequestPayload,
	canConfirmSetupRequest,
} from '../discord-presence/request-manufacturers.js';
import { matchingRequestSetups } from '../discord-presence/request-tracks.js';
import { discordInteraction } from '../src/features/discord-interactions.js';
import { createWebsiteRequest } from '../src/features/requests.js';
import { listCars } from '../public/js/request/form.js';
import { repositoryEnv } from './helpers/repository-env.mjs';
import { sessionCookie } from './helpers/session.mjs';
const owner = '1033453785416208564';
const env = {
	...repositoryEnv,
	GITHUB_TOKEN: 'test-repo',
	DISCORD_BOT_TOKEN: 'test-bot',
	DISCORD_CHANNEL_ID: '1511795330176520193',
	DISCORD_CLIENT_ID: '1556978316404068452',
	DISCORD_UPLOAD_ROLE_ID: '1538601074074849330',
	SITE_URL: 'https://example.test',
};
const data = {
	userId: owner,
	vehicle: 'Toyota GR010',
	carClass: 'Hypercar',
	track: 'Spa-Francorchamps',
	manufacturer: 'GO',
	message: 'Test @everyone',
};
test('Herstellerwahl ist eindeutig; vorhandene beAlien-Dateikürzel bleiben gültig', () => {
	assert.deepEqual(
		REQUEST_MANUFACTURERS.map((item) => item.id),
		['GO', 'HYMO', 'beAlien']
	);
	for (const value of ['HYMO', 'Heimo', 'High Moss'])
		assert.equal(resolveRequestManufacturer(value).id, 'HYMO');
	for (const file of [
		'bA_Toyota_Spa.zip',
		'bA1_Toyota_Spa.zip',
		'bA2_Toyota_Spa.zip',
		'Toyota Spa beAlien.zip',
	])
		assert.equal(setupManufacturerFromFilename(file), 'beAlien');
	assert.equal(setupManufacturerFromFilename('Toyota Spa GO.zip'), 'GO');
	assert.equal(resolveRequestManufacturer('unknown'), null);
});
test('Vorhanden-Prüfung trennt Hersteller und Streckenlayouts', () => {
	const files = [
		'Toyota Spa HYMO.zip',
		'Toyota Paul Ricard HYMO.zip',
		'Toyota Spa GO.zip',
		'bA2_Toyota_Spa.zip',
	].map((name) => ({ name }));
	assert.deepEqual(
		matchingRequestSetups(files, 'Spa', 'GO').map((file) => file.name),
		['Toyota Spa GO.zip']
	);
	assert.deepEqual(
		matchingRequestSetups(files, 'Spa', 'beAlien').map((file) => file.name),
		['bA2_Toyota_Spa.zip']
	);
	assert.equal(matchingRequestSetups(files.slice(0, 2), 'Spa', 'GO').length, 0);
	assert.equal(matchingRequestSetups(files, 'Paul Ricard 1A', 'HYMO').length, 0);
	assert.equal(matchingRequestSetups(files, 'Spa', 'unknown').length, 0);
});
test('Beide Request-Wege erzeugen Embed mit Hersteller, Personen-Tag und sichtbarem Bestätigungsbutton', () => {
	const p = setupRequestPayload(data, '1538601074074849330', new Date('2026-10-29T17:00:00Z'));
	assert.equal(p.content, '<@&1538601074074849330>');
	assert.equal(p.embeds[0].title, 'Neue Setup-Anfrage');
	assert.equal(p.embeds[0].fields.find((f) => f.name === 'Setup-Hersteller').value, 'GO');
	assert.equal(
		p.embeds[0].fields.find((f) => f.name === 'Angefragt von').value,
		'<@' + owner + '>'
	);
	assert.equal(p.components[0].components[0].custom_id, 'setup_ready:' + owner);
	assert.deepEqual(p.allowed_mentions, { parse: [], roles: ['1538601074074849330'], users: [] });
	assert.equal(p.flags, undefined);
	assert.equal(
		canConfirmSetupRequest('222222222222222222', ['1538601074074849330'], '1538601074074849330'),
		true
	);
	assert.equal(canConfirmSetupRequest('222222222222222222', [], '1538601074074849330'), false);
});
async function website(files, manufacturer, vehicleName = data.vehicle, carClass = data.carClass) {
	const old = fetch,
		sends = [];
	const ownerEnv = { ...env, DISCORD_OWNER_USER_ID: owner, SESSION_SECRET: 'request-test' };
	const cookie = await sessionCookie(owner, ownerEnv.SESSION_SECRET, { username: 'Lukas' });
	globalThis.fetch = async (url, options) => {
		if (String(url).includes('/contents/public/setups.json'))
			return Response.json({ [carClass]: [{ name: vehicleName }] });
		if (String(url).includes('api.github.com'))
			return Response.json(files.map((name) => ({ name, type: 'file' })));
		sends.push(JSON.parse(options.body));
		return Response.json({ id: 'message' });
	};
	try {
		const response = await createWebsiteRequest(
			new Request('https://example.test/api/request', {
				method: 'POST',
				headers: {
					Origin: 'https://example.test',
					'Content-Type': 'application/json',
					Cookie: cookie,
				},
				body: JSON.stringify({ ...data, vehicle: vehicleName, carClass, manufacturer }),
			}),
			ownerEnv
		);
		return { status: response.status, body: await response.json(), sends };
	} finally {
		globalThis.fetch = old;
	}
}
test('Website sendet GO-Request trotz vorhandenem HYMO-Setup und blockiert nur denselben Hersteller', async () => {
	const different = await website(['Toyota Spa HYMO.zip'], 'GO');
	assert.equal(different.status, 200);
	assert.equal(different.sends.length, 1);
	assert.equal(different.body.alreadyExists, false);
	assert.equal(different.sends[0].components[0].components[0].label, 'Setup wurde hochgeladen');
	const same = await website(['Toyota Spa HYMO.zip'], 'HYMO');
	assert.equal(same.body.alreadyExists, true);
	assert.equal(same.sends.length, 0);
	assert.equal(new URL(same.body.setupUrl).searchParams.get('setup'), 'Toyota Spa HYMO.zip');
	for (const value of ['unknown']) {
		const invalid = await website([], value);
		assert.equal(invalid.status, 400);
		assert.equal(invalid.sends.length, 0);
	}
});
test('Formular bietet optionale Herstellerwahl mit zurücksetzbarer Egal-Option an', () => {
	const html = readFileSync(new URL('../public/request.html', import.meta.url), 'utf8');
	assert.match(html, /<select id="manufacturer">/);
	assert.match(html, /<label for="manufacturer">Setup-Hersteller \(optional\)<\/label\s*>/);
	assert.match(html, /<option value="">Egal – keine Präferenz<\/option>/);
	assert.doesNotMatch(html, /<select id="manufacturer"[^>]*required|<option value=""[^>]*disabled/);
	for (const manufacturer of REQUEST_MANUFACTURERS)
		assert.ok(
			html.includes('<option value="' + manufacturer.id + '">' + manufacturer.name + '</option>')
		);
	const script = readFileSync(new URL('../public/js/request/form.js', import.meta.url), 'utf8');
	assert.match(script, /manufacturer:\s*manufacturer\.value/);
});
test('Signierte HTTP-Buttons bestätigen nur berechtigte Nutzer und aktualisieren das Embed', async () => {
	const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
	const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString(
		'hex'
	);
	const original = fetch,
		sends = [],
		tasks = [];
	globalThis.fetch = async (url, options) => {
		if (String(url).endsWith('/oauth2/applications/@me'))
			return Response.json({ verify_key: publicKey });
		sends.push(JSON.parse(options.body));
		return Response.json({ id: 'notice' });
	};
	try {
		for (const [role, expected] of [
			[[], 4],
			[['1538601074074849330'], 7],
		]) {
			const event = {
				type: 3,
				application_id: env.DISCORD_CLIENT_ID,
				channel_id: env.DISCORD_CHANNEL_ID,
				data: { custom_id: 'setup_ready:' + owner },
				member: { user: { id: '222222222222222222' }, roles: role },
				message: {
					embeds: setupRequestPayload(data, env.DISCORD_UPLOAD_ROLE_ID).embeds,
					components: [{ type: 1 }],
				},
			};
			const body = JSON.stringify(event),
				timestamp = String(Math.floor(Date.now() / 1000));
			const signature = Buffer.from(
				await crypto.subtle.sign(
					'Ed25519',
					pair.privateKey,
					new TextEncoder().encode(timestamp + body)
				)
			).toString('hex');
			const req = new Request('https://example.test/interactions/discord', {
				method: 'POST',
				headers: { 'X-Signature-Timestamp': timestamp, 'X-Signature-Ed25519': signature },
				body,
			});
			const result = await (
				await discordInteraction(req, env, { waitUntil: (p) => tasks.push(p) })
			).json();
			assert.equal(result.type, expected);
			if (expected === 7) {
				assert.equal(result.data.components.length, 0);
				assert.equal(result.data.embeds[0].color, 0x2b9b68);
			}
		}
		await Promise.all(tasks);
		assert.equal(sends.length, 1);
		assert.match(sends[0].content, /GO-Setup/);
		assert.deepEqual(sends[0].allowed_mentions.users, [owner]);
	} finally {
		globalThis.fetch = original;
	}
});

test('Website erlaubt fehlenden, leeren und null Hersteller; Embed und vorhandene Treffer bleiben korrekt', async () => {
	for (const manufacturer of [undefined, null, '', '   ', 'egal', 'Egal']) {
		const created = await website([], manufacturer);
		assert.equal(created.status, 200);
		assert.equal(created.body.alreadyExists, false);
		assert.equal(created.sends.length, 1);
		assert.equal(
			created.sends[0].embeds[0].fields.find((f) => f.name === 'Setup-Hersteller').value,
			'Egal'
		);
		assert.equal(created.sends[0].components[0].components[0].label, 'Setup wurde hochgeladen');
		assert.deepEqual(created.sends[0].allowed_mentions, {
			parse: [],
			roles: ['1538601074074849330'],
			users: [],
		});
		const existing = await website(['Toyota Spa HYMO.zip'], manufacturer);
		assert.equal(existing.body.alreadyExists, true);
		assert.equal(existing.sends.length, 0);
		assert.equal(new URL(existing.body.setupUrl).searchParams.get('setup'), 'Toyota Spa HYMO.zip');
		assert.doesNotMatch(existing.body.message, /undefined|null|von Egal/);
	}
	assert.equal(
		matchingRequestSetups([{ name: 'Toyota Paul Ricard 1A GO.zip' }], 'Paul Ricard - Default')
			.length,
		0
	);
	assert.equal(matchingRequestSetups([{ name: 'Toyota Spa HYMO.zip' }], 'Spa').length, 1);
	assert.equal(matchingRequestSetups([{ name: 'Toyota Spa HYMO.zip' }], 'Spa', 'egal').length, 1);
	assert.equal(
		setupRequestPayload(
			{ ...data, manufacturer: 'egal' },
			env.DISCORD_UPLOAD_ROLE_ID
		).embeds[0].fields.find((f) => f.name === 'Setup-Hersteller').value,
		'Egal'
	);
});

test('Website-Request erkennt GTE-Fahrzeuge und übernimmt die Klasse', async () => {
	const catalog = JSON.parse(
		readFileSync(new URL('../public/setups.json', import.meta.url), 'utf8')
	);
	const cars = listCars(catalog);
	for (const name of catalog.GTE.map((car) => car.name)) {
		const car = cars.find((entry) => entry.name === name);
		assert.equal(car?.class, 'GTE', name);
	}
	const created = await website([], 'GO', 'Ferrari 488 GTE Evo', 'GTE');
	assert.equal(created.status, 200);
	assert.equal(created.body.success, true);
	assert.equal(created.sends.length, 1);
	assert.equal(
		created.sends[0].embeds[0].fields.find((field) => field.name === 'Fahrzeug').value,
		'Ferrari 488 GTE Evo'
	);
	assert.equal(
		created.sends[0].embeds[0].fields.find((field) => field.name === 'Klasse').value,
		'GTE'
	);
});
