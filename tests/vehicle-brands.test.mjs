import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { BRANDS, vehicleBrand } from '../public/js/home/vehicle-brands.js';

const brandsDir = new URL('../public/assets/brands/', import.meta.url);

test('vehicle names map to their brand logo', () => {
	assert.equal(
		vehicleBrand('Aston Martin Valkyrie AMR LMH').logo,
		'/assets/brands/aston-martin.svg'
	);
	assert.equal(vehicleBrand('Mercedes-AMG LMGT3').logo, '/assets/brands/mercedes-amg.svg');
	assert.equal(vehicleBrand('Chevrolet Corvette Z06 LMGT3.R').logo, '/assets/brands/chevrolet.svg');
	assert.equal(vehicleBrand('peugeot 9X8 Evo').logo, '/assets/brands/peugeot.svg');
	assert.equal(
		vehicleBrand('Isotta Fraschini Tipo6-C').logo,
		'/assets/brands/isotta-fraschini.svg'
	);
	assert.deepEqual(vehicleBrand('Glickenhaus SCG 007'), {
		name: 'Glickenhaus',
		logo: '/assets/brands/glickenhaus.png',
		mark: '',
	});
});

test('unknown brands fall back to their first letter', () => {
	assert.deepEqual(vehicleBrand('Nissan GT-R LMGT3'), { name: 'Nissan', logo: null, mark: 'N' });
	assert.deepEqual(vehicleBrand('  '), { name: '', logo: null, mark: '' });
	assert.deepEqual(vehicleBrand(undefined), { name: '', logo: null, mark: '' });
});

test('a brand only matches a whole word', () => {
	assert.equal(vehicleBrand('Fordham X1').logo, null);
});

test('every logo file exists and is used', () => {
	const files = readdirSync(brandsDir).sort();
	const used = BRANDS.map((b) => b.file).sort();
	assert.deepEqual(files, used);
});

// Same-origin SVGs run their scripts when opened directly.
test('logos are plain SVG without active content or PNG', () => {
	for (const file of readdirSync(brandsDir)) {
		const bytes = readFileSync(new URL(file, brandsDir));
		if (file.endsWith('.png')) {
			assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', file);
			continue;
		}
		assert.ok(file.endsWith('.svg'), file);
		const svg = bytes.toString('utf8');
		assert.match(svg, /viewBox=/, file);
		assert.doesNotMatch(
			svg,
			/<script|<foreignObject|\son[a-z]+\s*=|href\s*=\s*["']?\s*(?:https?:|javascript:|data:)/i,
			file
		);
	}
});

test('every vehicle in setups.json has a brand logo', () => {
	const data = JSON.parse(readFileSync(new URL('../public/setups.json', import.meta.url), 'utf8'));
	for (const cars of Object.values(data))
		for (const car of cars) assert.ok(vehicleBrand(car.name).logo, car.name);
});
