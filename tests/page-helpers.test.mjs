import assert from 'node:assert/strict';
import test from 'node:test';
import { listCars } from '../public/js/request/form.js';
import { escapeHtml } from '../public/js/shared/dom.js';

test('escapeHtml escapes markup and quotes and treats missing values as empty', () => {
	assert.equal(
		escapeHtml(`<a href="x">Tom's & Co</a>`),
		'&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; Co&lt;/a&gt;'
	);
	assert.equal(escapeHtml(null), '');
	assert.equal(escapeHtml(undefined), '');
	assert.equal(escapeHtml(0), '0');
});

test('the request page reads cars from a list of groups and from classes', () => {
	assert.deepEqual(
		listCars([
			{ vehicles: [{ name: 'A' }, { name: '' }] },
			{ cars: [{ name: 'B' }] },
			{ name: 'C' },
		]),
		[{ name: 'A' }, { name: 'B' }, { name: 'C' }]
	);
	assert.deepEqual(
		listCars({ categories: { Hypercar: ['A'], GT3: [{ name: 'B', class: 'LMGT3' }] } }),
		[
			{ name: 'A', class: 'Hypercar' },
			{ name: 'B', class: 'LMGT3' },
		]
	);
	assert.deepEqual(listCars({ Hypercar: [{ name: 'A' }], note: 'x' }), [
		{ name: 'A', class: 'Hypercar' },
	]);
});
