import assert from 'node:assert/strict';
import test from 'node:test';
import { storeUploadedSetups } from '../src/features/setup-upload.js';
import { readSetupVersion, enrichSetupVersions } from '../src/setup-version.js';
import { gitBlobSha } from '../src/upload-storage.js';
import { repositoryEnv } from './helpers/repository-env.mjs';
import { sessionCookie } from './helpers/session.mjs';

function formWithVersion(value) {
	const form = new FormData();
	if (value !== undefined) form.set('version', value);
	return form;
}

test('upload versions are optional and still validate supplied values', () => {
	for (const value of [undefined, '', '   ']) {
		assert.deepEqual(readSetupVersion(formWithVersion(value)), { version: '' });
	}
	assert.deepEqual(readSetupVersion(formWithVersion('  v2.1  ')), { version: 'v2.1' });
	assert.deepEqual(readSetupVersion(formWithVersion('v'.repeat(40))), { version: 'v'.repeat(40) });
	for (const value of ['v'.repeat(41), 'v2\u0000x', 'v2\nx', new File(['v2'], 'version.txt')]) {
		assert.ok(readSetupVersion(formWithVersion(value)).error);
	}
});

test('separate uploads store their own versions, including an empty replacement', async () => {
	const originalFetch = globalThis.fetch;
	const rows = new Map([['Alpine Spa GO.zip', 'old-version']]);
	const stored = [];
	const clearedLifecycle = [];
	const owner = '1033453785416208564';
	const env = {
		...repositoryEnv,
		DISCORD_OWNER_USER_ID: owner,
		SESSION_SECRET: 'upload-test',
		ACCESS_DB: {
			prepare(sql) {
				return {
					bind(...values) {
						return {
							async run() {
								if (sql.startsWith('INSERT INTO setup_versions')) rows.set(values[2], values[3]);
								else if (sql.startsWith('DELETE FROM setup_lifecycle'))
									clearedLifecycle.push(values[2]);
								else throw Error('Unexpected run: ' + sql);
							},
							async all() {
								return {
									results: [...rows].map(([file_name, version]) => ({ file_name, version })),
								};
							},
						};
					},
				};
			},
		},
	};
	const sha = await gitBlobSha(new TextEncoder().encode('PK\x03\x04'));
	// GitHub holds none of the files yet and confirms every new one.
	globalThis.fetch = async (url, options = {}) => {
		if (options.method !== 'PUT') return Response.json({ message: 'Not Found' }, { status: 404 });
		stored.push(decodeURIComponent(new URL(url).pathname).split('/contents/setups/')[1]);
		return Response.json({ content: { sha } }, { status: 201 });
	};
	const cookie = await sessionCookie(owner, env.SESSION_SECRET);
	try {
		for (const [name, version] of [
			['Alpine Spa GO.zip', ''],
			['Alpine Monza GO.zip', 'v2'],
			['Alpine Le Mans GO.zip', 'v3'],
		]) {
			const form = formWithVersion(version);
			form.set('category', 'Hypercar');
			form.set('vehicle', 'Alpine A424');
			form.set('files', new File(['PK\x03\x04'], name));
			const response = await storeUploadedSetups(
				new Request('https://example.test/api/setups/upload', {
					method: 'POST',
					headers: { Cookie: cookie },
					body: form,
				}),
				env
			);
			assert.equal(response.status, 200);
			assert.equal((await response.json()).uploaded[0].version, version);
			assert.equal(rows.get(name), version);
		}
		assert.deepEqual(stored, [
			'Hypercar/Alpine A424/Alpine Spa GO.zip',
			'Hypercar/Alpine A424/Alpine Monza GO.zip',
			'Hypercar/Alpine A424/Alpine Le Mans GO.zip',
		]);
		assert.deepEqual(clearedLifecycle, [
			'Alpine Spa GO.zip',
			'Alpine Monza GO.zip',
			'Alpine Le Mans GO.zip',
		]);
		const setups = await enrichSetupVersions(
			[...rows.keys()].map((name) => ({ name })),
			'Hypercar',
			'Alpine A424',
			env
		);
		assert.deepEqual(
			setups.map((x) => x.version),
			[null, 'v2', 'v3']
		);
		const invalid = formWithVersion('v'.repeat(41));
		const response = await storeUploadedSetups(
			new Request('https://example.test/api/setups/upload', {
				method: 'POST',
				headers: { Cookie: cookie },
				body: invalid,
			}),
			env
		);
		assert.equal(response.status, 400);
		assert.equal(stored.length, 3, 'invalid version must not reach ZIP storage');
	} finally {
		globalThis.fetch = originalFetch;
	}
});
