import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { detectUploadTarget, flattenUploadCatalog } from '../public/js/home/upload-targets.js';
import { parseUploadFilename } from '../public/js/shared/upload-filename.js';
import { REQUEST_TRACKS } from '../discord-presence/request-tracks.js';
import { storeUploadedSetups } from '../src/features/setup-upload.js';
import { storeSetupFiles } from '../src/features/setup-files.js';
import { gitBlobSha } from '../src/upload-storage.js';
import { repositoryEnv } from './helpers/repository-env.mjs';
import { sessionCookie } from './helpers/session.mjs';

const catalog = flattenUploadCatalog(
	JSON.parse(readFileSync(new URL('../public/setups.json', import.meta.url), 'utf8'))
);
const bmw = { category: 'Hypercar', vehicle: 'BMW M Hybrid V8' };
const owner = '1033453785416208564';
const env = { ...repositoryEnv, DISCORD_OWNER_USER_ID: owner, SESSION_SECRET: 'filename-tests' };
const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4]);
const parse = (name, target) => parseUploadFilename(name, catalog, REQUEST_TRACKS, target);

test('Auto Strecke Hersteller accepts multipart names and catalog aliases in the required order', () => {
	for (const [name, vehicle, track] of [
		['BMW V8 Spa GO.zip', 'BMW M Hybrid V8', 'Spa-Francorchamps'],
		['BMW M Hybrid V8 Le Mans HYMO.zip', 'BMW M Hybrid V8', 'Le Mans / Circuit de la Sarthe'],
		[
			'Aston Martin Vantage AMR LMGT3 Circuit Paul Ricard HYMO.zip',
			'Aston Martin Vantage AMR LMGT3',
			'Paul Ricard - Default',
		],
		['Oreca 07 ELMS Le Mans bA1.zip', 'Oreca 07 Gibson', 'Le Mans / Circuit de la Sarthe'],
		['Oreca 07 WEC Silverstone GP GO.zip', 'Oreca 07 Gibson', 'Silverstone – GP / WEC'],
		['9X8 Evo Fuji Classic HYMO.zip', 'Peugeot 9X8 Evo', 'Fuji – Classic, ohne Schikane'],
		['Huracán Monza GO.ZIP', 'Lamborghini Huracán LMGT3', 'Monza'],
		['Valkyrie Paul Ricard 1A_V2 HYMO.zip', 'Aston Martin Valkyrie AMR LMH', 'Paul Ricard – 1A V2'],
		['Vantage AMR GTE Spa GO.zip', 'Aston Martin Vantage AMR', 'Spa-Francorchamps'],
		['Corvette RGTE Le Mans HYMO.zip', 'Corvette RGTE', 'Le Mans / Circuit de la Sarthe'],
		['488 GTE Evo Monza beAlien.zip', 'Ferrari 488 GTE Evo', 'Monza'],
		['911 RSR-19 Sebring GO.zip', 'Porsche 911 RSR-19', 'Sebring'],
	]) {
		const result = parse(name);
		assert.equal(result.error, undefined, name + ': ' + result.error);
		assert.equal(result.vehicle, vehicle);
		assert.equal(result.track, track);
	}
});

test('GTE filenames resolve to the correct GTE vehicle, not similarly named LMGT3 cars', () => {
	for (const [filename, vehicle] of [
		['Vantage AMR GTE Spa GO.zip', 'Aston Martin Vantage AMR'],
		['Corvette RGTE Le Mans HYMO.zip', 'Corvette RGTE'],
		['488 GTE Evo Monza beAlien.zip', 'Ferrari 488 GTE Evo'],
		['911 RSR-19 Sebring GO.zip', 'Porsche 911 RSR-19'],
	]) {
		const result = parse(filename);
		assert.equal(result.error, undefined, filename + ': ' + result.error);
		assert.equal(result.category, 'GTE');
		assert.equal(result.vehicle, vehicle);
		const detected = detectUploadTarget(filename, catalog);
		assert.equal(detected.target?.category, 'GTE', filename);
		assert.equal(detected.target?.vehicle, vehicle, filename);
	}
});

test('the manufacturer is the final component; historical beAlien aliases remain valid', () => {
	for (const [name, manufacturer] of [
		['GO', 'GO'],
		['hymo', 'HYMO'],
		['beAlien', 'beAlien'],
		['bA', 'beAlien'],
		['bA1', 'beAlien'],
		['bA2', 'beAlien'],
		['BE_ALIEN', 'beAlien'],
	])
		assert.equal(parse('BMW V8 Spa ' + name + '.zip').manufacturer, manufacturer);
});

const invalidNames = [
	'GO BMW V8 Spa.zip',
	'Spa BMW V8 GO.zip',
	'BMW V8 GO Spa.zip',
	'BMW V8 GO.zip',
	'Spa GO.zip',
	'BMW V8 Spa.zip',
	'BMW V8 Spa Unknown.zip',
	'BMW V8 Fantasiestrecke GO.zip',
	'Peugeot Spa GO.zip',
	'BMW V8 Monza Spa GO.zip',
	'BMW V8 Spa GO extra.zip',
	'BMW V8 Spa GO (Version v2).zip',
	'BMW V8 Spa v2 GO.zip',
	'BMW_V8_Spa_GO.zip',
	'BMW V8 Spa GO.zip.exe',
	'BMW V8 Spa GO',
	' BMW V8 Spa GO.zip',
	'BMW V8 Spa GO.zip ',
	'../BMW V8 Spa GO.zip',
	'BMW V8 Spa/GO.zip',
	'BMW V8 Spa \u0000GO.zip',
	'BMW V8 ' + 'x'.repeat(180) + ' GO.zip',
];
test('missing, reordered, unknown and extra filename components are rejected', () => {
	for (const name of invalidNames) {
		assert.ok(parse(name).error, JSON.stringify(name));
		assert.match(parse(name).error, /Auto Strecke Hersteller\.zip/);
	}
});

test('a valid filename cannot be uploaded into another car, class or 9X8 variant', () => {
	assert.equal(parse('BMW V8 Spa GO.zip', bmw).error, undefined);
	assert.ok(parse('BMW V8 Spa GO.zip', { category: 'Hypercar', vehicle: 'Ferrari 499P' }).error);
	assert.ok(parse('BMW V8 Spa GO.zip', { ...bmw, category: 'LMGT3' }).error);
	assert.ok(parse('9X8 Evo Spa GO.zip', { category: 'Hypercar', vehicle: 'Peugeot 9X8' }).error);
});

async function form(names, target = bmw) {
	const result = new FormData();
	result.set('category', target.category);
	result.set('vehicle', target.vehicle);
	result.set('version', 'v1.4.3');
	for (const name of names) result.append('files', new File([bytes], name));
	return result;
}
async function request(data, loggedIn = true) {
	return new Request('https://example.test/api/setups/upload', {
		method: 'POST',
		body: data,
		headers: loggedIn ? { Cookie: await sessionCookie(owner, env.SESSION_SECRET) } : {},
	});
}

test('server rejects invalid original names before storage, even when the browser is bypassed', async (t) => {
	const calls = [];
	t.mock.method(globalThis, 'fetch', async (...args) => {
		calls.push(args);
		throw Error('must not reach storage');
	});
	for (const name of invalidNames.filter(
		(value) => !value.includes('/') && !value.includes('\u0000')
	)) {
		const response = await storeUploadedSetups(await request(await form([name])), env);
		assert.equal(response.status, 400, name);
		const data = await response.json();
		assert.equal(data.code, 'INVALID_SETUP_FILENAME', name);
		assert.equal(data.retryable, false);
		assert.equal(data.errors[0].originalName, name);
		assert.deepEqual(data.uploaded, []);
	}
	assert.equal(calls.length, 0, 'rejected filenames must not call GitHub or Discord');
});

test('server preflights all files before writing any file of a mixed multipart upload', async (t) => {
	const fetch = t.mock.method(globalThis, 'fetch', async () => {
		throw Error('must not reach storage');
	});
	const data = await form(['BMW V8 Spa GO.zip', 'Spa GO.zip']);
	const response = await storeSetupFiles(await request(data), env, data);
	assert.equal(response.status, 400);
	assert.equal((await response.json()).errors.length, 1);
	assert.equal(fetch.mock.callCount(), 0);
});

test('server rejects an otherwise valid name for the wrong destination', async (t) => {
	const fetch = t.mock.method(globalThis, 'fetch', async () => {
		throw Error('must not reach storage');
	});
	const data = await form(['BMW V8 Spa GO.zip'], { category: 'Hypercar', vehicle: 'Ferrari 499P' });
	const response = await storeUploadedSetups(await request(data), env);
	assert.equal(response.status, 400);
	assert.match((await response.json()).error, /ausgewählten Fahrzeug/);
	assert.equal(fetch.mock.callCount(), 0);
});

test('a duplicate substitution cannot bypass validation of the original filename', async (t) => {
	const fetch = t.mock.method(globalThis, 'fetch', async () => {
		throw Error('must not reach storage');
	});
	const data = await form(['Spa GO.zip']);
	data.set(
		'previousSetups',
		JSON.stringify({
			action: 'keep',
			targets: [],
			duplicateOf: { name: 'BMW V8 Spa GO.zip', sha: 'a'.repeat(40) },
		})
	);
	const response = await storeUploadedSetups(await request(data), env);
	assert.equal(response.status, 400);
	assert.equal((await response.json()).code, 'INVALID_SETUP_FILENAME');
	assert.equal(fetch.mock.callCount(), 0);
});

test('valid format still stores the original name and version through the complete upload handler', async (t) => {
	const stored = [];
	const sha = await gitBlobSha(bytes);
	t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
		if (options.method !== 'PUT') return Response.json({}, { status: 404 });
		stored.push(decodeURIComponent(new URL(url).pathname));
		return Response.json({ content: { sha } }, { status: 201 });
	});
	const response = await storeUploadedSetups(await request(await form(['BMW V8 Spa GO.zip'])), env);
	assert.equal(response.status, 200);
	const data = await response.json();
	assert.equal(data.uploaded[0].name, 'BMW V8 Spa GO.zip');
	assert.equal(data.uploaded[0].version, 'v1.4.3');
	assert.equal(stored.length, 1);
	assert.ok(stored[0].endsWith('/setups/Hypercar/BMW M Hybrid V8/BMW V8 Spa GO.zip'));
});

test('filename validation does not grant upload access to anonymous visitors', async (t) => {
	const fetch = t.mock.method(globalThis, 'fetch', async () => {
		throw Error('must not reach storage');
	});
	const data = await form(['BMW V8 Spa GO.zip']);
	const response = await storeSetupFiles(await request(data, false), env, data);
	assert.equal(response.status, 401);
	assert.equal(fetch.mock.callCount(), 0);
});
