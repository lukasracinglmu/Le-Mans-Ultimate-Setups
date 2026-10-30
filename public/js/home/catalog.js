import { $ } from '../shared/dom.js';
import { getCarSetups } from './setup-cache.js';
import { renderSetups } from './setup-list.js';
import { classifyVendor } from './setup-names.js';
import { state } from './state.js';

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
			card.append(star, n, c);
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

const countFor = (setups) => {
	const mfr = state.activeMfr;
	return setups.filter((s) => !mfr || classifyVendor(s.name) === mfr).length;
};

let countRun = 0;

export async function refreshVehicleCounts() {
	if (document.documentElement.dataset.dbAccess !== 'authorized') return;
	const run = ++countRun;
	const cards = [...document.querySelectorAll('#categories .vehicle')];
	let cursor = 0;
	const worker = async () => {
		while (cursor < cards.length) {
			const card = cards[cursor++];
			if (run !== countRun) return;
			const vehicle = card.querySelector('.vehicle-name')?.textContent?.trim();
			const category = card.querySelector('.vehicle-class')?.textContent?.trim();
			if (!vehicle || !category) continue;
			let count = null;
			try {
				const data = await getCarSetups(category, vehicle);
				count = countFor(Array.isArray(data?.setups) ? data.setups : []);
			} catch {}
			if (run !== countRun) return;
			let label = card.querySelector('.vehicle-setup-count');
			if (!label) {
				label = document.createElement('div');
				label.className = 'vehicle-setup-count';
				card.appendChild(label);
			}
			label.textContent = 'Verfügbare Setups: ' + (count === null ? 'nicht abrufbar' : count);
		}
	};
	await Promise.all(Array.from({ length: Math.min(4, cards.length) }, worker));
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
