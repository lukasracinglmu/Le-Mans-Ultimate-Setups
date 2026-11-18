const CACHE_KEY = 'tpr-owner-navigation-v1';
const DEFAULT_ORDER = ['races', 'calendar', 'tickets', 'panel', 'request', 'bug-report'];
const ITEMS = {
	races: { label: 'Rennen', href: '/', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5m0 0h12l-2 4 2 4H4"/><path d="M8 19h12"/></svg>' },
	calendar: { label: 'Kalender', href: '/calendar', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>' },
	tickets: { label: 'Tickets', href: '/bug-tickets', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>' },
	panel: { label: 'My Panel', href: '/admin', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v16H3z"/><path d="M3 10h18M9 10v10"/></svg>' },
	request: { label: 'Setup Request', href: '/request', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18v3h3l6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"/></svg>' },
	'bug-report': { label: 'Bug melden', href: '/bug-report', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="M12 8v5M12 16h.01"/></svg>' },
};

function validOrder(value) {
	return Array.isArray(value) && value.length === DEFAULT_ORDER.length &&
		new Set(value).size === DEFAULT_ORDER.length &&
		value.every((key) => Object.hasOwn(ITEMS, key));
}
function readCache() {
	try {
		const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
		return validOrder(parsed) ? parsed : [...DEFAULT_ORDER];
	} catch {
		return [...DEFAULT_ORDER];
	}
}
function writeCache(order) {
	try { localStorage.setItem(CACHE_KEY, JSON.stringify(order)); } catch {}
}
function addStylesheet() {
	if (document.querySelector('link[data-owner-navigation-css]')) return;
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = '/css/shared/owner-navigation.css';
	link.dataset.ownerNavigationCss = '1';
	document.head.appendChild(link);
}
function iconButton(label, svg) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'owner-nav-icon-button';
	button.setAttribute('aria-label', label);
	button.title = label;
	button.innerHTML = svg;
	return button;
}

export async function initOwnerNavigation() {
	const header = document.querySelector('header');
	if (!header || document.getElementById('ownerGlobalNav')) return;
	let response;
	try {
		response = await fetch('/api/owner/navigation', { credentials: 'same-origin', cache: 'no-store' });
	} catch { return; }
	if (!response.ok) return;
	let data;
	try { data = await response.json(); } catch { return; }
	if (!data?.success || !validOrder(data.navigationOrder)) return;

	addStylesheet();
	let order = data.navigationOrder;
	writeCache(order);
	const nav = document.createElement('nav');
	nav.id = 'ownerGlobalNav';
	nav.setAttribute('aria-label', 'Hauptnavigation');
	const edit = iconButton('Navigation bearbeiten', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"/></svg>');
	edit.id = 'ownerNavigationEdit';
	nav.appendChild(edit);
	const headerActions = header.querySelector('.header-actions');
	if (headerActions) header.insertBefore(nav, headerActions);
	else header.appendChild(nav);
	header.querySelector('#roleHeaderActions')?.classList.add('owner-nav-replaced');

	const render = () => {
		nav.querySelectorAll('a').forEach((node) => node.remove());
		for (const key of order) {
			const item = ITEMS[key];
			const link = document.createElement('a');
			link.href = item.href;
			link.className = 'owner-nav-link';
			link.dataset.navKey = key;
			link.innerHTML = item.icon + '<span>' + item.label + '</span>';
			if (location.pathname === item.href || (key === 'races' && /^\/(?:race|race\.html)$/.test(location.pathname))) {
				link.classList.add('active');
				link.setAttribute('aria-current', 'page');
			}
			nav.insertBefore(link, edit);
		}
	};
	render();

	const backdrop = document.createElement('div');
	backdrop.className = 'owner-nav-backdrop';
	backdrop.hidden = true;
	backdrop.innerHTML = `<section class="owner-nav-dialog" role="dialog" aria-modal="true" aria-labelledby="ownerNavTitle">
		<div class="owner-nav-dialog-head"><h2 id="ownerNavTitle">Navigation bearbeiten</h2><button type="button" class="owner-nav-close" aria-label="Schließen">×</button></div>
		<p>Ziehe die Punkte in deine gewünschte Reihenfolge oder nutze die Pfeile.</p>
		<ol class="owner-nav-sort-list"></ol>
		<div class="owner-nav-dialog-actions"><button type="button" class="owner-nav-reset">Zurücksetzen</button><span></span><button type="button" class="owner-nav-cancel">Abbrechen</button><button type="button" class="owner-nav-save">Speichern</button></div>
		<div class="owner-nav-status" role="status" aria-live="polite"></div>
	</section>`;
	document.body.appendChild(backdrop);
	const list = backdrop.querySelector('.owner-nav-sort-list');
	let draft = [...order];
	let dragged = null;
	const renderList = () => {
		list.replaceChildren();
		draft.forEach((key, index) => {
			const item = ITEMS[key];
			const row = document.createElement('li');
			row.className = 'owner-nav-sort-item';
			row.draggable = true;
			row.dataset.key = key;
			const grip = document.createElement('span');
			grip.className = 'owner-nav-grip';
			grip.textContent = '⠿';
			grip.setAttribute('aria-hidden', 'true');
			const label = document.createElement('span');
			label.className = 'owner-nav-sort-label';
			label.textContent = item.label;
			const controls = document.createElement('span');
			controls.className = 'owner-nav-move-controls';
			for (const [direction, symbol, text] of [[-1, '↑', 'Nach oben'], [1, '↓', 'Nach unten']]) {
				const button = document.createElement('button');
				button.type = 'button';
				button.textContent = symbol;
				button.setAttribute('aria-label', text);
				button.disabled = index + direction < 0 || index + direction >= draft.length;
				button.addEventListener('click', () => move(index, index + direction));
				controls.appendChild(button);
			}
			row.append(grip, label, controls);
			row.addEventListener('dragstart', () => { dragged = key; row.classList.add('dragging'); });
			row.addEventListener('dragend', () => { dragged = null; row.classList.remove('dragging'); });
			row.addEventListener('dragover', (event) => event.preventDefault());
			row.addEventListener('drop', (event) => {
				event.preventDefault();
				if (!dragged || dragged === key) return;
				move(draft.indexOf(dragged), draft.indexOf(key));
			});
			list.appendChild(row);
		});
	};
	const move = (from, to) => {
		if (from < 0 || to < 0 || from >= draft.length || to >= draft.length) return;
		const [item] = draft.splice(from, 1);
		draft.splice(to, 0, item);
		renderList();
	};
	const close = () => { backdrop.hidden = true; };
	const open = () => {
		draft = [...order];
		backdrop.querySelector('.owner-nav-status').textContent = '';
		renderList();
		backdrop.hidden = false;
		backdrop.querySelector('.owner-nav-close').focus();
	};
	edit.addEventListener('click', open);
	backdrop.querySelector('.owner-nav-close').addEventListener('click', close);
	backdrop.querySelector('.owner-nav-cancel').addEventListener('click', close);
	backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
	backdrop.querySelector('.owner-nav-reset').addEventListener('click', () => {
		draft = [...DEFAULT_ORDER];
		renderList();
	});
	backdrop.querySelector('.owner-nav-save').addEventListener('click', async () => {
		const save = backdrop.querySelector('.owner-nav-save');
		const status = backdrop.querySelector('.owner-nav-status');
		save.disabled = true;
		status.textContent = 'Wird gespeichert …';
		try {
			const result = await fetch('/api/owner/navigation', {
				method: 'PUT',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ navigationOrder: draft }),
			});
			const payload = await result.json();
			if (!result.ok || !payload.success || !validOrder(payload.navigationOrder)) {
				throw new Error(payload.error || 'Speichern fehlgeschlagen.');
			}
			order = payload.navigationOrder;
			writeCache(order);
			render();
			status.textContent = 'Gespeichert.';
			close();
		} catch (error) {
			status.textContent = error.message || 'Speichern fehlgeschlagen.';
		} finally {
			save.disabled = false;
		}
	});
	window.addEventListener('storage', (event) => {
		if (event.key !== CACHE_KEY) return;
		try {
			const next = JSON.parse(event.newValue || 'null');
			if (validOrder(next)) { order = next; render(); }
		} catch {}
	});
	renderList();
}
