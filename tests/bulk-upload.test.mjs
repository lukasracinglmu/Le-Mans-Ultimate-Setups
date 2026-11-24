import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
	detectUploadTarget,
	flattenUploadCatalog,
	uploadJobKey,
	validateUploadTargets,
} from '../public/js/home/upload-targets.js';
import { runUploadJobs, validateUploadFiles, uploadIsBusy } from '../public/js/home/upload.js';
import { state } from '../public/js/home/state.js';
import { syncBulkUploadAccess } from '../public/js/home/bulk-upload.js';

const catalog = flattenUploadCatalog(
	JSON.parse(readFileSync(new URL('../public/setups.json', import.meta.url), 'utf8'))
);
const samples = [
	['Alpine Bahrain HYMO.zip', 'Alpine A424'],
	['Valkyrie Monza HYMO.zip', 'Aston Martin Valkyrie AMR LMH'],
	['BMW V8 Bahrain HYMO.zip', 'BMW M Hybrid V8'],
	['Cadillac Daytona GO.zip', 'Cadillac V-Series.R'],
	['499P Bahrain HYMO.zip', 'Ferrari 499P'],
	['Genesis Monza HYMO.zip', 'Genesis GMR-001'],
	['Glick Barcelona GO (Version 1.4.3).zip', 'Glickenhaus SCG 007'],
	['Isotta COTA HYMO.zip', 'Isotta Fraschini Tipo6-C'],
	['SC63 COTA HYMO.zip', 'Lamborghini SC63'],
	['9X8 Fuji HYMO.zip', 'Peugeot 9X8'],
	['9X8 Evo Bahrain HYMO.zip', 'Peugeot 9X8 Evo'],
	['963 Daytona HYMO.zip', 'Porsche 963'],
	['Toyota Bahrain HYMO.zip', 'Toyota GR010'],
	['Vanwall Le Mans GO.zip', 'Vanwall Vandervell 680'],
	['Oreca 07 ELMS Barcelona HYMO.zip', 'Oreca 07 Gibson'],
	['Adess Barcelona HYMO.zip', 'Adess AD25'],
	['Duqueine Bahrain HYMO.zip', 'Duqueine D09'],
	['Ginetta Bahrain HYMO.zip', 'Ginetta G61-LT-P325'],
	['Ligier Bahrain HYMO.zip', 'Ligier JS P325'],
	['Vantage Bahrain HYMO.zip', 'Aston Martin Vantage AMR LMGT3'],
	['BMW M4 Bahrain HYMO.zip', 'BMW M4 LMGT3'],
	['Corvette Fuji HYMO.zip', 'Chevrolet Corvette Z06 LMGT3.R'],
	['296 Daytona GO.zip', 'Ferrari 296 LMGT3'],
	['Mustang Imola HYMO.zip', 'Ford Mustang LMGT3'],
	['Huracán Bahrain HYMO.zip', 'Lamborghini Huracán LMGT3'],
	['Lexus Daytona HYMO.zip', 'Lexus RC F LMGT3'],
	['720S Bahrain HYMO.zip', 'McLaren 720S LMGT3'],
	['Benz Bahrain HYMO.zip', 'Mercedes-AMG LMGT3'],
	['911 Barcelona GO.zip', 'Porsche 911 GT3 R'],
	['Vantage AMR GTE Spa GO.zip', 'Aston Martin Vantage AMR'],
	['Corvette RGTE Le Mans HYMO.zip', 'Corvette RGTE'],
	['488 GTE Evo Monza beAlien.zip', 'Ferrari 488 GTE Evo'],
	['911 RSR-19 GTE Sebring GO.zip', 'Porsche 911 RSR-19'],
];
test('a representative filename for every current car identifies the exact catalog entry', () => {
	assert.equal(samples.length, catalog.length);
	for (const [name, vehicle] of samples) {
		const detected = detectUploadTarget(name, catalog).target;
		assert.equal(detected?.vehicle, vehicle, name);
		assert.ok(catalog.includes(detected));
	}
});

test('separators, case, accents and EVO do not change the model identity', () => {
	for (const name of ['lmu_HURACAN_Spa_bA1.zip', 'Huracán_Spa_GO.ZIP'])
		assert.equal(detectUploadTarget(name, catalog).target?.vehicle, 'Lamborghini Huracán LMGT3');
	for (const name of ['PEUGEOT_9X8_EVO_SPA.zip', '9X8EVO-Spa-GO.zip', '9x8 Spa EVO.zip'])
		assert.equal(detectUploadTarget(name, catalog).target?.vehicle, 'Peugeot 9X8 Evo');
	assert.equal(detectUploadTarget('Oreca07_WEC_Spa_GO.zip', catalog).target?.category, 'LMP2');
	assert.equal(detectUploadTarget('Vantage GTE Spa GO.zip', catalog).target?.category, 'GTE');
	assert.equal(detectUploadTarget('911 RSR-19 GTE Spa GO.zip', catalog).target?.vehicle, 'Porsche 911 RSR-19');
	assert.equal(detectUploadTarget('911 RSR-19 Spa GO.zip', catalog).target, null);
	assert.equal(detectUploadTarget('Vantage AMR Spa GO.zip', catalog).target, null);
});

test('unknown names, partial matches, brands and conflicting models are never auto-assigned', () => {
	for (const name of [
		'Spa GO.zip',
		'BMW Spa.zip',
		'Ferrari Monza.zip',
		'Porsche.zip',
		'Peugeot.zip',
		'x963y.zip',
		'911963.zip',
		'499P 296 Spa.zip',
		'963 BMW M4 Spa.zip',
	])
		assert.equal(detectUploadTarget(name, catalog).target, null, name);
	assert.equal(detectUploadTarget('Peugeot Spa.zip', catalog).candidates.length, 2);
	assert.equal(detectUploadTarget('BMW Spa.zip', catalog).candidates.length, 2);
});

test('recognition never assigns a car that is not in the current catalog', () => {
	assert.equal(
		detectUploadTarget(
			'499P Spa GO.zip',
			catalog.filter((target) => target.vehicle !== 'Ferrari 499P')
		).target,
		null
	);
});

test('unresolved targets and duplicate destinations block the batch, identical names on other cars do not', () => {
	const file = { name: 'Spa GO.zip' };
	assert.ok(validateUploadTargets([file], [null]));
	assert.ok(validateUploadTargets([file, file], [catalog[0], catalog[0]]));
	assert.equal(validateUploadTargets([file, file], [catalog[0], catalog[1]]), '');
	assert.notEqual(uploadJobKey({ file, ...catalog[0] }), uploadJobKey({ file, ...catalog[1] }));
});

test('batch limits match the normal uploader without splitting ZIPs on the server', () => {
	assert.equal(validateUploadFiles([{ name: 'a.zip', size: 1 }]), '');
	for (const files of [
		[],
		[{ name: 'a.exe', size: 1 }],
		[{ name: 'a.zip', size: 0 }],
		[{ name: 'a.zip', size: 25 * 1024 * 1024 + 1 }],
		Array(51).fill({ name: 'a.zip', size: 1 }),
	])
		assert.ok(validateUploadFiles(files));
});

// Only the DOM surface used by the queue is mocked. FormData, requests and job
// processing are real; GitHub/Discord remain behind the mocked upload API.
function element() {
	return {
		children: [],
		dataset: {},
		textContent: '',
		disabled: false,
		style: {},
		classList: {
			values: new Set(),
			add(value) {
				this.values.add(value);
			},
			remove(value) {
				this.values.delete(value);
			},
			toggle(value, force) {
				if (force) this.add(value);
				else this.remove(value);
			},
			contains(value) {
				return this.values.has(value);
			},
		},
		set innerHTML(value) {
			this.children = [];
		},
		appendChild(child) {
			this.children.push(child);
		},
		querySelectorAll() {
			return this.children;
		},
		setAttribute(name, value) {
			this[name] = value;
		},
	};
}
function documentMock() {
	const elements = new Map();
	return {
		elements,
		documentElement: { dataset: { dbAccess: 'login' } },
		getElementById(id) {
			if (!elements.has(id)) elements.set(id, element());
			return elements.get(id);
		},
		createElement: element,
	};
}

// Run this independently of the source shape so a wrong car/version/action in
// FormData, a lost failed job, or a duplicated status row breaks the test.
test('mixed-car jobs preserve versions and cleanup plans; failed-only retries keep separate status rows', async (t) => {
	const previousDocument = globalThis.document;
	const previousCar = state.currentCar;
	const previousUser = state.currentUser;
	const doc = documentMock();
	globalThis.document = doc;
	t.after(() => {
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
		state.currentCar = previousCar;
		state.currentUser = previousUser;
	});
	state.currentCar = { category: '', vehicle: '' };
	state.currentUser = { canUpload: false };
	syncBulkUploadAccess();
	assert.ok(doc.getElementById('bulkUploadArea').classList.contains('hidden'));
	state.currentUser = { canUpload: true };
	syncBulkUploadAccess();
	assert.equal(doc.getElementById('bulkUploadArea').classList.contains('hidden'), false);
	const jobs = [catalog[0], catalog[1]].map((target, index) => ({
		...target,
		file: new File(['PK\\x03\\x04test'], 'Spa GO.zip', { type: 'application/zip' }),
		version: index ? 'v2.1' : 'v1.4.3',
		previousSetups: {
			action: index ? 'outdate' : 'replace',
			targets: [{ name: 'old.zip', sha: String(index).repeat(40) }],
		},
	}));
	let fail = true;
	const calls = [];
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		assert.equal(url, '/api/setups/upload');
		const form = options.body;
		calls.push({
			category: form.get('category'),
			vehicle: form.get('vehicle'),
			version: form.get('version'),
			previousSetups: JSON.parse(form.get('previousSetups')),
			file: form.get('files').name,
		});
		assert.equal(uploadIsBusy(), true);
		assert.equal(doc.getElementById('bulkUploadBtn').disabled, true);
		if (form.get('vehicle') === jobs[1].vehicle && fail)
			return Response.json({ error: 'Test: ungültige ZIP', retryable: false }, { status: 400 });
		return Response.json({ uploaded: [{ originalName: 'Spa GO.zip', name: 'Spa GO.zip' }] });
	});
	const first = await runUploadJobs(jobs, { bulk: true });
	assert.equal(first.ok, 1);
	assert.equal(first.failed, 1);
	assert.equal(first.failedJobs[0], jobs[1]);
	assert.equal(doc.getElementById('bulkFileStatuses').children.length, 2);
	assert.equal(doc.getElementById('fileStatuses').children.length, 0);
	assert.equal(doc.getElementById('bulkRetryFailedBtn').classList.contains('show'), true);
	fail = false;
	await runUploadJobs(first.failedJobs, { bulk: true, appendRows: true });
	assert.equal(calls.length, 3);
	for (const [index, call] of calls.entries()) {
		const job = jobs[index === 0 ? 0 : 1];
		assert.deepEqual(call, {
			category: job.category,
			vehicle: job.vehicle,
			version: job.version,
			previousSetups: job.previousSetups,
			file: job.file.name,
		});
	}
	assert.equal(doc.getElementById('bulkFileStatuses').children.length, 2);
	assert.equal(doc.getElementById('bulkRetryFailedBtn').classList.contains('show'), false);
	assert.equal(uploadIsBusy(), false);
	assert.equal(doc.getElementById('bulkUploadBtn').disabled, false);
	assert.equal(doc.getElementById('bulkProgressBar')['aria-valuenow'], '100');
});
