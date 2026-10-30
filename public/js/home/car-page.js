import { $, escapeHtml } from '../shared/dom.js';
import { refreshVehicleCounts } from './catalog.js';
import { getCarSetups } from './setup-cache.js';
import { renderSetups } from './setup-list.js';
import { state } from './state.js';

let savedScrollY = 0;

// Vehicle routes live in the URL so reloads and direct links select the same car.
function updateCarUrl(category, vehicle, setup = '') {
	const params = new URLSearchParams({ category, vehicle });
	if (setup) params.set('setup', setup);
	const next = '/?' + params.toString();
	if (location.pathname + location.search !== next)
		history.pushState({ category, vehicle, setup }, '', next);
}

export function showHome(updateHistory = true) {
	if (updateHistory && (location.pathname !== '/' || location.search || location.hash))
		history.pushState({}, '', '/');
	state.activeMfr = '';
	document
		.querySelectorAll('#mfrFilter .mfr-btn')
		.forEach((b) => b.classList.toggle('active', (b.dataset.mfr || '') === ''));
	$('carPage').classList.remove('active');
	$('homePage').classList.add('active');
	const sy = savedScrollY;
	requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, sy)));
}

export async function showCar(category, vehicle, updateHistory = true) {
	if (document.documentElement.dataset.dbAccess !== 'authorized') return;
	state.activeCarSeries = '';
	savedScrollY = window.scrollY;
	state.currentCar = { category, vehicle };
	state.lastUploadJobs = [];
	state.trackSearchVal = '';
	if (updateHistory) updateCarUrl(category, vehicle);
	$('retryFailedBtn').classList.remove('show');
	$('homePage').classList.remove('active');
	$('carPage').classList.add('active');
	window.scrollTo(0, 0);
	$('carTitle').textContent = vehicle;
	$('carSubtitle').textContent = category;
	$('uploadStatus').textContent = '';
	$('fileStatuses').innerHTML = '';
	$('sessionUploadProgress').classList.add('hidden');
	$('uploadArea').style.display = state.currentUser?.canUpload ? 'flex' : 'none';
	const ts = $('trackSearch');
	if (ts) {
		ts.value = '';
		ts.style.display = 'block';
	}
	await loadCarSetups(category, vehicle);
	syncCarFilter();
	renderSetups(state.currentCarSetups);
	window.scrollTo(0, 0);
}

async function loadCarSetups(category, vehicle) {
	const list = $('setupList');
	list.innerHTML = '<div class="empty">Setups werden geladen...</div>';
	try {
		const d = await getCarSetups(category, vehicle);
		if (state.currentCar.category !== category || state.currentCar.vehicle !== vehicle) return;
		list.innerHTML = '';
		state.currentCarSetups = d.setups;
		renderSetups(d.setups);
	} catch (e) {
		list.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
	}
}

export async function openSetupFromQuery() {
	const params = new URLSearchParams(location.search);
	const category = params.get('category');
	const vehicle = params.get('vehicle');
	const setup = params.get('setup');
	if (!category || !vehicle) return;
	await showCar(category, vehicle, false);
	// A slower setup response must not change the route after the user leaves.
	const activeParams = new URLSearchParams(location.search);
	if (activeParams.get('category') !== category || activeParams.get('vehicle') !== vehicle) return;
	if (setup) {
		state.trackSearchVal = setup;
		const input = $('trackSearch');
		if (input) input.value = setup;
		renderSetups(state.currentCarSetups);
		requestAnimationFrame(() => {
			const target = [...document.querySelectorAll('#setupList .setup')].find((el) =>
				el.textContent.toLowerCase().includes(setup.toLowerCase())
			);
			(target || $('setupList')).scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}
}

export function syncCarFilter() {
	if (document.documentElement.dataset.dbAccess !== 'authorized') return;
	const carPage = document.getElementById('carPage');
	const trackSearch = document.getElementById('trackSearch');
	if (!carPage || !trackSearch) return;
	let toolbar = document.getElementById('carFilterToolbar');
	if (!toolbar) {
		toolbar = document.createElement('div');
		toolbar.id = 'carFilterToolbar';
		toolbar.className = 'car-filter-toolbar';
		trackSearch.before(toolbar);
	}
	let holder = document.getElementById('carMfrFilter');
	if (!holder) {
		holder = document.createElement('div');
		holder.id = 'carMfrFilter';
		holder.className = 'mfr-filter car-mfr-filter';
		holder.innerHTML =
			'<button class="mfr-btn" data-mfr="">Alle</button><button class="mfr-btn" data-mfr="GO">GO</button><button class="mfr-btn" data-mfr="HYMO">HYMO</button><button class="mfr-btn" data-mfr="beAlien">beAlien</button>';
	}
	if (holder.parentElement !== toolbar) toolbar.prepend(holder);
	// Only LMP2 has separate ELMS/WEC setups. Filtering reuses the loaded list.
	let seriesFilter = document.getElementById('carSeriesFilter');
	if (!seriesFilter) {
		seriesFilter = document.createElement('div');
		seriesFilter.id = 'carSeriesFilter';
		seriesFilter.className = 'mfr-filter car-series-filter';
		seriesFilter.setAttribute('role', 'group');
		seriesFilter.setAttribute('aria-label', 'Rennserie');
		for (const value of ['', 'ELMS', 'WEC']) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'mfr-btn';
			button.dataset.series = value;
			button.textContent = value || 'Alle Serien';
			button.addEventListener('click', () => {
				state.activeCarSeries = value;
				seriesFilter.querySelectorAll('button').forEach((item) => {
					const selected = item.dataset.series === value;
					item.classList.toggle('active', selected);
					item.setAttribute('aria-pressed', String(selected));
				});
				renderSetups(state.currentCarSetups);
			});
			seriesFilter.appendChild(button);
		}
		toolbar.appendChild(seriesFilter);
	}
	seriesFilter.hidden = state.currentCar.category !== 'LMP2';
	seriesFilter.querySelectorAll('button').forEach((button) => {
		const selected = button.dataset.series === state.activeCarSeries;
		button.classList.toggle('active', selected);
		button.setAttribute('aria-pressed', String(selected));
	});
	const homeButtons = [...document.querySelectorAll('#mfrFilter .mfr-btn')];
	const carButtons = [...holder.querySelectorAll('.mfr-btn')];
	const paint = (value) =>
		carButtons.forEach((b) => b.classList.toggle('active', (b.dataset.mfr || '') === value));
	paint(state.activeMfr);
	carButtons.forEach((btn) => {
		if (btn.dataset.bound) return;
		btn.dataset.bound = '1';
		btn.addEventListener('click', () => {
			const target = homeButtons.find((b) => (b.dataset.mfr || '') === (btn.dataset.mfr || ''));
			if (target) target.click();
			paint(btn.dataset.mfr || '');
		});
	});
	homeButtons.forEach((btn) => {
		if (btn.dataset.carSync) return;
		btn.dataset.carSync = '1';
		btn.addEventListener('click', () => {
			paint(btn.dataset.mfr || '');
			refreshVehicleCounts();
		});
	});
}

export function initCarPage() {
	window.addEventListener('popstate', () => {
		const params = new URLSearchParams(location.search);
		if (params.get('category') && params.get('vehicle')) openSetupFromQuery();
		else showHome(false);
	});

	$('trackSearch').addEventListener('input', (e) => {
		state.trackSearchVal = e.target.value;
		renderSetups(state.currentCarSetups);
	});
}
