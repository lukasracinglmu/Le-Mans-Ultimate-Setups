import { $ } from '../shared/dom.js';
import { renderSetups } from './setup-list.js';
import { state } from './state.js';
import { vehicleBrand } from './vehicle-brands.js';

let setupData = {};
let favoriteVehicles = new Set();
let favoritesOnly = false;
let activeClass = '';
let selectVehicle = () => {};

export async function loadData() {
	try {
		const [r, f] = await Promise.all([
			fetch('/setups.json', { credentials: 'same-origin', cache: 'no-store' }),
			fetch('/api/favorites', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null),
		]);
		if (!r.ok) {
			const error = await r.json().catch(() => ({}));
			throw new Error(error.error || 'Fahrzeuge konnten nicht geladen werden.');
		}
		setupData = await r.json();
		const favorites = f?.ok ? await f.json() : { favorites: [] };
		favoriteVehicles = new Set(
			(favorites.favorites || []).map((item) => item.category + '\u001f' + item.vehicle)
		);
		renderCategories();
	} catch (error) {
		const out = document.createElement('div');
		out.className = 'empty';
		out.textContent = error.message || 'Fahrzeuge konnten nicht geladen werden.';
		$('categories').replaceChildren(out);
	}
}

// Decorative, the name next to it says the same. A sibling of .vehicle-name, so
// refreshVehicleCounts() still reads the plain vehicle name.
function buildBrandBadge(vehicle) {
	const brand = vehicleBrand(vehicle);
	const badge = document.createElement('span');
	badge.className = 'vehicle-brand';
	badge.setAttribute('aria-hidden', 'true');
	if (brand.logo) {
		const logo = document.createElement('span');
		logo.className = 'vehicle-brand-logo';
		logo.style.setProperty('--brand-logo', "url('" + brand.logo + "')");
		badge.appendChild(logo);
	} else badge.textContent = brand.mark;
	return badge;
}

async function toggleFavorite(category, vehicle, button) {
	const key = category + '\u001f' + vehicle;
	const next = !favoriteVehicles.has(key);
	button.disabled = true;
	try {
		const r = await fetch('/api/favorites', {
			method: next ? 'POST' : 'DELETE',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ category, vehicle }),
		});
		const data = await r.json().catch(() => ({}));
		if (!r.ok || !data.success)
			throw new Error(data.error || 'Favorit konnte nicht gespeichert werden.');
		if (next) favoriteVehicles.add(key);
		else favoriteVehicles.delete(key);
		button.classList.toggle('active', next);
		button.textContent = '★';
		button.title = next ? 'Favorit entfernen' : 'Fahrzeug als Favorit markieren';
		button.setAttribute('aria-label', button.title);
		if (favoritesOnly && !next) renderCategories($('search').value);
	} catch (error) {
		console.error(error);
	} finally {
		button.disabled = false;
	}
}

export function renderCategories(filter = '') {
	const box = $('categories');
	box.innerHTML = '';
	const q = filter.trim().toLowerCase();
	Object.entries(setupData).forEach(([cat, vehicles]) => {
		if (activeClass && cat !== activeClass) return;
		const list = vehicles.filter(
			(v) =>
				(!favoritesOnly || favoriteVehicles.has(cat + '\u001f' + v.name)) &&
				v.name.toLowerCase().includes(q)
		);
		if (!list.length) return;
		const sec = document.createElement('section');
		sec.className = 'category';
		sec.setAttribute('data-class', cat);
		const h = document.createElement('h2');
		h.textContent = cat;
		sec.appendChild(h);
		const grid = document.createElement('div');
		grid.className = 'vehicle-grid';
		list.forEach((v) => {
			const card = document.createElement('div');
			card.className = 'vehicle';
			const key = cat + '\u001f' + v.name;
			const favorite = favoriteVehicles.has(key);
			const star = document.createElement('button');
			star.type = 'button';
			star.className = 'favorite-toggle' + (favorite ? ' active' : '');
			star.textContent = '★';
			star.title = favorite ? 'Favorit entfernen' : 'Fahrzeug als Favorit markieren';
			star.setAttribute('aria-label', star.title);
			star.addEventListener('click', (event) => {
				event.stopPropagation();
				toggleFavorite(cat, v.name, star);
			});
			const n = document.createElement('div');
			n.className = 'vehicle-name';
			n.textContent = v.name;
			const c = document.createElement('div');
			c.className = 'vehicle-class';
			c.textContent = cat;
			card.append(star, buildBrandBadge(v.name), n, c);
			card.addEventListener('click', () => selectVehicle(cat, v.name));
			grid.appendChild(card);
		});
		sec.appendChild(grid);
		box.appendChild(sec);
	});
	if (!box.children.length)
		box.innerHTML =
			'<div class="empty">' +
			(favoritesOnly ? 'Keine Favoriten vorhanden.' : 'Kein Fahrzeug gefunden.') +
			'</div>';
}

let countRun = 0,
	summaryCache = null,
	summaryPending = null,
	summaryRevision = 0;
const readSummary = (force = false) => {
	if (force) {
		summaryCache = null;
		summaryRevision++;
	}
	const revision = summaryRevision;
	if (summaryCache && Date.now() - summaryCache.at < 30000)
		return Promise.resolve(summaryCache.vehicles);
	if (summaryPending?.revision === revision) return summaryPending.promise;
	const promise = fetch('/api/setups/summary', { cache: 'no-store', credentials: 'same-origin' })
		.then(async (response) => {
			const data = await response.json();
			if (!response.ok || !data.success || data.complete !== true || !Array.isArray(data.vehicles))
				throw Error('Invalid setup summary');
			const vehicles = new Map();
			for (const row of data.vehicles) {
				if (
					typeof row.category !== 'string' ||
					typeof row.vehicle !== 'string' ||
					!Number.isSafeInteger(row.count) ||
					row.count < 0 ||
					!row.manufacturers ||
					['GO', 'HYMO', 'beAlien', 'other'].some(
						(key) => !Number.isSafeInteger(row.manufacturers[key]) || row.manufacturers[key] < 0
					)
				)
					throw Error('Invalid vehicle count');
				vehicles.set(JSON.stringify([row.category, row.vehicle]), row);
			}
			if (revision === summaryRevision) summaryCache = { at: Date.now(), vehicles };
			return vehicles;
		})
		.finally(() => {
			if (summaryPending?.revision === revision) summaryPending = null;
		});
	summaryPending = { revision, promise };
	return promise;
};
export async function refreshVehicleCounts(force = false) {
	if (document.documentElement.dataset.dbAccess !== 'authorized') return;
	const run = ++countRun;
	let vehicles = null;
	try {
		vehicles = await readSummary(force);
	} catch {}
	if (run !== countRun) return;
	const manufacturer = state.activeMfr;
	for (const card of document.querySelectorAll('#categories .vehicle')) {
		const vehicle = card.querySelector('.vehicle-name')?.textContent?.trim(),
			category = card.querySelector('.vehicle-class')?.textContent?.trim();
		if (!vehicle || !category) continue;
		const row = vehicles?.get(JSON.stringify([category, vehicle]));
		const count = vehicles
			? manufacturer
				? row?.manufacturers[manufacturer] || 0
				: row?.count || 0
			: null;
		let label = card.querySelector('.vehicle-setup-count');
		if (!label) {
			label = document.createElement('div');
			label.className = 'vehicle-setup-count';
			card.appendChild(label);
		}
		label.textContent = 'Verfügbare Setups: ' + (count === null ? 'nicht abrufbar' : count);
	}
}

export function initCatalog({ onSelectVehicle }) {
	selectVehicle = onSelectVehicle;
	$('search').addEventListener('input', (e) => renderCategories(e.target.value));

	$('favoriteFilterButton').addEventListener('click', () => {
		favoritesOnly = !favoritesOnly;
		const button = $('favoriteFilterButton');
		button.classList.toggle('active', favoritesOnly);
		button.textContent = favoritesOnly ? 'Alle Fahrzeuge anzeigen' : 'Favoriten anzeigen';
		renderCategories($('search').value);
	});

	document.querySelectorAll('#classFilter .mfr-btn[data-class]').forEach((btn) =>
		btn.addEventListener('click', () => {
			activeClass = btn.dataset.class || '';
			document
				.querySelectorAll('#classFilter .mfr-btn[data-class]')
				.forEach((b) => b.classList.toggle('active', b === btn));
			renderCategories($('search').value);
		})
	);

	document.querySelectorAll('#mfrFilter .mfr-btn').forEach((btn) =>
		btn.addEventListener('click', () => {
			state.activeMfr = btn.dataset.mfr || '';
			document
				.querySelectorAll('#mfrFilter .mfr-btn')
				.forEach((b) => b.classList.toggle('active', b === btn));
			if ($('carPage').classList.contains('active')) renderSetups(state.currentCarSetups);
			refreshVehicleCounts();
		})
	);
}

// The counts follow every new rendering of the catalog.
export function observeCategories() {
	const categories = $('categories');
	if (categories) {
		new MutationObserver(() => refreshVehicleCounts()).observe(categories, {
			childList: true,
			subtree: false,
		});
	}
}
