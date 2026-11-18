import { fetchMeResponse } from './session.js';

const CACHE_KEY = 'tpr-owner-nav-order';
const KEYS = ['/calendar', '/bug-tickets', '/admin', '/request', '/bug-report'];

function validOrder(value) {
	return Array.isArray(value) && value.length === KEYS.length &&
		new Set(value).size === KEYS.length && value.every((key) => KEYS.includes(key));
}
function cachedOrder() {
	try {
		const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
		return validOrder(value) ? value : [...KEYS];
	} catch { return [...KEYS]; }
}
function saveCache(order) {
	try { localStorage.setItem(CACHE_KEY, JSON.stringify(order)); } catch {}
}
function itemKey(link) {
	const path = new URL(link.href, location.origin).pathname.replace(/\/$/, '');
	return KEYS.includes(path) ? path : null;
}

export async function initOwnerNavEditor() {
	let me;
	try {
		const response = await fetchMeResponse();
		me = await response.json();
	} catch { return; }
	if (!me?.loggedIn || !me?.user?.isOwner) return;

	const nav = document.getElementById('roleHeaderActions');
	if (!nav) return;
	const linksReady = () => new Promise((resolve) => {
		if (nav.querySelectorAll('a').length >= KEYS.length) return resolve();
		const observer = new MutationObserver(() => {
			if (nav.querySelectorAll('a').length >= KEYS.length) {
				observer.disconnect();
				resolve();
			}
		});
		observer.observe(nav, { childList: true });
		setTimeout(() => { observer.disconnect(); resolve(); }, 5000);
	});
	await linksReady();

	const links = [...nav.querySelectorAll('a')];
	if (links.length !== KEYS.length || links.some((link) => !itemKey(link))) return;

	let order = cachedOrder();
	try {
		const response = await fetch('/api/owner/navigation', { credentials: 'same-origin', cache: 'no-store' });
		const data = await response.json();
		if (response.ok && data.success && validOrder(data.navigationOrder)) order = data.navigationOrder;
	} catch {}
	saveCache(order);

	const applyOrder = () => {
		for (const key of order) nav.appendChild(links.find((link) => itemKey(link) === key));
	};
	applyOrder();

	const pencil = document.createElement('button');
	pencil.type = 'button';
	pencil.className = 'owner-nav-pencil';
	pencil.setAttribute('aria-label', 'Navigation bearbeiten');
	pencil.title = 'Navigation bearbeiten';
	pencil.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"/></svg>';
	nav.appendChild(pencil);

	const modal = document.createElement('div');
	modal.className = 'owner-nav-editor-backdrop';
	modal.hidden = true;
	modal.innerHTML = '<section class="owner-nav-editor" role="dialog" aria-modal="true" aria-label="Navigation bearbeiten"><button type="button" class="owner-nav-editor-close" aria-label="Schließen">×</button><p>Navigation verschieben</p><ol></ol><div class="owner-nav-editor-actions"><button type="button" data-cancel>Abbrechen</button><button type="button" data-save>Speichern</button></div><div class="owner-nav-editor-status" role="status"></div></section>';
	document.body.appendChild(modal);
	const list = modal.querySelector('ol');
	let draft = [...order];
	let dragged = null;

	const render = () => {
		list.replaceChildren();
		draft.forEach((key, index) => {
			const original = links.find((link) => itemKey(link) === key);
			const row = document.createElement('li');
			row.draggable = true;
			row.dataset.key = key;
			const grip = document.createElement('span');
			grip.textContent = '⠿';
			grip.setAttribute('aria-hidden', 'true');
			const label = document.createElement('span');
			label.textContent = original.querySelector('.action-label')?.textContent.trim() || original.textContent.trim();
			const controls = document.createElement('span');
			controls.className = 'owner-nav-editor-moves';
			for (const [step, symbol, labelText] of [[-1, '↑', 'Nach oben'], [1, '↓', 'Nach unten']]) {
				const button = document.createElement('button');
				button.type = 'button';
				button.textContent = symbol;
				button.setAttribute('aria-label', labelText);
				button.disabled = index + step < 0 || index + step >= draft.length;
				button.addEventListener('click', () => move(index, index + step));
				controls.appendChild(button);
			}
			row.append(grip, label, controls);
			row.addEventListener('dragstart', () => { dragged = key; });
			row.addEventListener('dragover', (event) => event.preventDefault());
			row.addEventListener('drop', (event) => {
				event.preventDefault();
				if (dragged && dragged !== key) move(draft.indexOf(dragged), draft.indexOf(key));
			});
			list.appendChild(row);
		});
	};
	const move = (from, to) => {
		if (from < 0 || to < 0 || from >= draft.length || to >= draft.length) return;
		const [value] = draft.splice(from, 1);
		draft.splice(to, 0, value);
		render();
	};
	const close = () => { modal.hidden = true; };
	pencil.addEventListener('click', () => {
		draft = [...order];
		modal.querySelector('.owner-nav-editor-status').textContent = '';
		render();
		modal.hidden = false;
	});
	modal.querySelector('.owner-nav-editor-close').addEventListener('click', close);
	modal.querySelector('[data-cancel]').addEventListener('click', close);
	modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
	modal.querySelector('[data-save]').addEventListener('click', async () => {
		const button = modal.querySelector('[data-save]');
		const status = modal.querySelector('.owner-nav-editor-status');
		button.disabled = true;
		try {
			const response = await fetch('/api/owner/navigation', {
				method: 'PUT',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ navigationOrder: draft }),
			});
			const data = await response.json();
			if (!response.ok || !data.success || !validOrder(data.navigationOrder)) {
				throw new Error(data.error || 'Speichern fehlgeschlagen.');
			}
			order = data.navigationOrder;
			saveCache(order);
			applyOrder();
			close();
		} catch (error) {
			status.textContent = error.message || 'Speichern fehlgeschlagen.';
		} finally { button.disabled = false; }
	});
	window.addEventListener('storage', (event) => {
		if (event.key !== CACHE_KEY) return;
		try {
			const next = JSON.parse(event.newValue || 'null');
			if (validOrder(next)) { order = next; applyOrder(); }
		} catch {}
	});
}
