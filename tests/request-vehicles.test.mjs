import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { flattenRequestVehicles } from '../discord-presence/request-vehicles.js';

const catalog = JSON.parse(readFileSync(new URL('../public/setups.json', import.meta.url), 'utf8'));

test('Discord /request autocomplete receives every GTE vehicle with class GTE', () => {
	const vehicles = flattenRequestVehicles(catalog);
	const gte = vehicles.filter((vehicle) => vehicle.className === 'GTE');
	assert.deepEqual(gte.map((vehicle) => vehicle.name), [
		'Aston Martin Vantage AMR',
		'Corvette RGTE',
		'Ferrari 488 GTE Evo',
		'Porsche 911 RSR-19',
	]);
	for (const vehicle of gte) {
		const query = vehicle.name.slice(0, 3).toLowerCase();
		const matches = vehicles.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 25);
		assert.ok(matches.some((item) => item.name === vehicle.name), vehicle.name);
	}
});
