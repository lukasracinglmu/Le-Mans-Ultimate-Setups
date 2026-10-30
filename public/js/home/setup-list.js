import { escapeHtml } from '../shared/dom.js';
import { classifyVendor, displaySetupFileName, groupSetups } from './setup-names.js';
import { state } from './state.js';

// Edit and delete live in their own modules, which render this list again.
let setupActions = { edit() {}, delete() {} };

export function setSetupActions(next) {
	setupActions = next;
}

const vendors = ['GO', 'HYMO', 'beAlien'];

function buildSetup(s) {
	const el = document.createElement('div');
	el.className = 'setup' + (s.outdated ? ' outdated' : '');
	const info = document.createElement('div');
	info.className = 'setup-info';
	const name = document.createElement('div');
	name.className = 'setup-track';
	const vendor = classifyVendor(s.name);
	const tag = vendor ? '<span class="vendor-tag ' + vendor + '">' + vendor + '</span>' : '';
	name.innerHTML =
		escapeHtml(s.displayName || displaySetupFileName(s.name)) +
		tag +
		(s.outdated ? '<span class="setup-outdated-tag">Veraltet</span>' : '');
	const meta = document.createElement('div');
	meta.className = 'setup-meta';
	meta.textContent = [s.series, s.variant === 'Standard' ? null : s.variant, 'ZIP']
		.filter(Boolean)
		.join(' · ');
	const version = document.createElement('span');
	version.className = 'setup-version-value' + (s.version ? '' : ' is-empty');
	version.textContent = 'Version: ' + (s.version || '—');
	meta.append(' · ', version);
	info.append(name, meta);
	const actions = document.createElement('div');
	actions.className = 'setup-actions';
	const dl = document.createElement('a');
	dl.className = 'download';
	dl.href = s.download;
	dl.download = displaySetupFileName(s.name);
	dl.textContent = 'Download';
	actions.appendChild(dl);
	if (state.currentUser?.canUpload) {
		const edit = document.createElement('button');
		edit.className = 'edit-version-btn';
		edit.title = 'Setup bearbeiten';
		edit.setAttribute('aria-label', 'Setup bearbeiten');
		edit.textContent = '✎';
		edit.addEventListener('click', () => setupActions.edit(s));
		actions.appendChild(edit);
		const del = document.createElement('button');
		del.className = 'delete-btn';
		del.style.display = 'flex';
		del.title = 'Setup löschen';
		del.setAttribute('aria-label', 'Setup löschen');
		del.textContent = '🗑';
		del.addEventListener('click', () => setupActions.delete(s.name));
		actions.appendChild(del);
	}
	el.append(info, actions);
	return el;
}

export function renderSetups(setups) {
	const list = document.getElementById('setupList');
	if (!list || document.documentElement.dataset.dbAccess !== 'authorized') return;
	list.innerHTML = '';
	const mfr = state.activeMfr;
	const track = state.trackSearchVal.trim().toLowerCase();
	const filtered = setups.filter((s) => {
		if (
			state.currentCar.category === 'LMP2' &&
			state.activeCarSeries &&
			s.series !== state.activeCarSeries
		)
			return false;
		const vendor = classifyVendor(s.name);
		if (mfr && vendor !== mfr) return false;
		if (
			track &&
			!String((s.displayName || '') + ' ' + displaySetupFileName(s.name) + ' ' + s.name)
				.toLowerCase()
				.includes(track)
		)
			return false;
		return true;
	});
	if (!filtered.length) {
		list.innerHTML =
			'<div class="empty">' +
			(setups.length
				? 'Keine Setups für diesen Filter.'
				: 'Noch keine Setups für dieses Fahrzeug verfügbar.') +
			'</div>';
		return;
	}
	const visibleVendors = mfr ? [mfr] : vendors;
	for (const vendor of visibleVendors) {
		const vendorItems = filtered.filter((s) => classifyVendor(s.name) === vendor);
		if (!vendorItems.length) continue;
		const section = document.createElement('section');
		section.className = 'vendor-section';
		const vendorTitle = document.createElement('div');
		vendorTitle.className = 'vendor-section-title ' + vendor;
		vendorTitle.textContent = vendor;
		section.appendChild(vendorTitle);
		for (const [group, items] of groupSetups(vendorItems)) {
			const wrap = document.createElement('section');
			wrap.className = 'setup-group';
			const title = document.createElement('div');
			title.className = 'setup-group-title';
			title.textContent = group;
			if (group !== 'Standard') wrap.appendChild(title);
			items.forEach((s) => wrap.appendChild(buildSetup(s)));
			section.appendChild(wrap);
		}
		list.appendChild(section);
	}
	const unclassified = filtered.filter((s) => !classifyVendor(s.name));
	if (!mfr && unclassified.length) {
		for (const [group, items] of groupSetups(unclassified)) {
			const wrap = document.createElement('section');
			wrap.className = 'setup-group';
			const title = document.createElement('div');
			title.className = 'setup-group-title';
			title.textContent = group;
			if (group !== 'Standard') wrap.appendChild(title);
			items.forEach((s) => wrap.appendChild(buildSetup(s)));
			list.appendChild(wrap);
		}
	}
}
