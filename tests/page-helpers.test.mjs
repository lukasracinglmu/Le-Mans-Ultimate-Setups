import assert from 'node:assert/strict';
import test from 'node:test';
import {
	formatDate,
	statusText,
	ticketMatches,
	ticketNumber,
} from '../public/js/bug-tickets/ticket.js';
import { listCars } from '../public/js/request/form.js';
import { escapeHtml } from '../public/js/shared/dom.js';

test('tickets show a four-digit number and a German status', () => {
	assert.equal(ticketNumber(7), '0007');
	assert.equal(ticketNumber(12345), '12345');
	assert.equal(statusText('open'), 'Offen');
	assert.equal(statusText('progress'), 'In Bearbeitung');
	assert.equal(statusText('closed'), 'Geschlossen');
	assert.equal(statusText(undefined), 'Offen');
});

test('ticket dates are read as UTC and missing dates show a dash', () => {
	assert.equal(
		formatDate('2026-10-27 12:00:00'),
		new Date(Date.UTC(2026, 9, 27, 12)).toLocaleString('de-DE')
	);
	assert.equal(formatDate(null), '—');
	assert.equal(formatDate(''), '—');
});

test('the ticket search finds numbers, status texts and fields', () => {
	const ticket = {
		id: 42,
		title: 'Download kaputt',
		reporter_name: 'Tester',
		reporter_id: '333',
		description: 'Bricht ab',
		priority: 'High',
		status: 'progress',
		resolution: null,
	};
	for (const query of ['', '0042', '#0042', 'download', 'tester', '333', 'high', 'in bearb']) {
		assert.equal(ticketMatches(ticket, query), true, query);
	}
	assert.equal(ticketMatches(ticket, 'geschlossen'), false);
	assert.equal(ticketMatches(ticket, 'null'), false);
});

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
