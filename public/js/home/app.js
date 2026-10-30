// Classic script until the home page scripts become modules. enhancements.js
// sets refreshVehicleCounts on window and calls loadData, actions.js calls the
// button handlers.
/* global refreshVehicleCounts */
/* exported loadData, logout, showHome, toggleTheme */
const $ = (id) => document.getElementById(id);
let setupData = {},
	favoriteVehicles = new Set(),
	favoritesOnly = false,
	currentUser = null,
	currentCar = { category: '', vehicle: '' },
	pendingDelete = null,
	lastUploadJobs = [],
	activeMfr = '',
	activeClass = '',
	savedScrollY = 0,
	trackSearchVal = '',
	uploadQueueRunning = false,
	uploadPreparing = false;
const setupCache = new Map(),
	setupPending = new Map(),
	setupRevisions = new Map();
const SETUP_CACHE_MS = 30000;
function displaySetupFileName(name) {
	return String(name || '')
		.replace(
			/\s*\[[^\]]*\s+(?:GO|HYMO|BE_?ALIEN)\s+(?:[a-f0-9]{12}|[a-f0-9]{4}\s+[a-f0-9]{4}\s+[a-f0-9]{4})\](?=\.zip$)/i,
			''
		)
		.replace(/\s*\(Version [^)]*\)(?=\.zip$)/i, '');
}
function esc(v) {
	return String(v ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
function updateThemeButton(t) {
	const button = $('themeButton');
	if (!button) return;
	const light = t === 'dark';
	button.textContent = (light ? '☀ ' : '☾ ') + (light ? 'Light Mode' : 'Dark Mode');
	button.setAttribute(
		'aria-label',
		light ? 'In den Light Mode wechseln' : 'In den Dark Mode wechseln'
	);
	button.title = button.getAttribute('aria-label');
}
function loadTheme() {
	const saved = localStorage.getItem('tpr-theme');
	const t = saved === 'light' ? 'light' : 'dark';
	document.documentElement.dataset.theme = t;
	updateThemeButton(t);
}
function toggleTheme() {
	const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
	document.documentElement.dataset.theme = t;
	localStorage.setItem('tpr-theme', t);
	updateThemeButton(t);
}
function logout() {
	location.href = '/auth/logout';
}
async function loadData() {
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
function renderCategories(filter = '') {
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
			card.addEventListener('click', () => showCar(cat, v.name));
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
} // Vehicle routes live in the URL so reloads and direct links select the same car.
function updateCarUrl(category, vehicle, setup = '') {
	const params = new URLSearchParams({ category, vehicle });
	if (setup) params.set('setup', setup);
	const next = '/?' + params.toString();
	if (location.pathname + location.search !== next)
		history.pushState({ category, vehicle, setup }, '', next);
}
function showHome(updateHistory = true) {
	if (updateHistory && (location.pathname !== '/' || location.search || location.hash))
		history.pushState({}, '', '/');
	try {
		sessionStorage.removeItem('tpr-open-vehicle');
	} catch {}
	activeMfr = '';
	document
		.querySelectorAll('#mfrFilter .mfr-btn')
		.forEach((b) => b.classList.toggle('active', (b.dataset.mfr || '') === ''));
	$('carPage').classList.remove('active');
	$('homePage').classList.add('active');
	const sy = savedScrollY;
	requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, sy)));
}
async function showCar(category, vehicle, updateHistory = true) {
	savedScrollY = window.scrollY;
	currentCar = { category, vehicle };
	lastUploadJobs = [];
	trackSearchVal = '';
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
	$('uploadArea').style.display = currentUser?.canUpload ? 'flex' : 'none';
	const ts = $('trackSearch');
	if (ts) {
		ts.value = '';
		ts.style.display = 'block';
	}
	await loadCarSetups(category, vehicle);
}
window.addEventListener('popstate', () => {
	const params = new URLSearchParams(location.search);
	if (params.get('category') && params.get('vehicle')) openSetupFromQuery();
	else showHome(false);
});
function classifyVendor(name) {
	const n = String(name || '').toUpperCase();
	if (n.includes('HYMO')) return 'HYMO';
	if (
		n.includes('BEALIEN') ||
		n.includes('BE_ALIEN') ||
		/(?:^|[^A-Z0-9])BA[12]?(?=$|[^A-Z0-9])/.test(n)
	)
		return 'beAlien';
	if (n.includes(' GO') || n.includes('_GO') || /\bGO\b/.test(n)) return 'GO';
	return null;
}
function setupCacheKey(c, v) {
	return c + '\u0000' + v;
}
function invalidateSetupCache(category, vehicle) {
	const key = setupCacheKey(category, vehicle);
	setupRevisions.set(key, (setupRevisions.get(key) || 0) + 1);
	setupCache.delete(key);
	setupPending.delete(key);
}
async function getCarSetups(category, vehicle) {
	const key = setupCacheKey(category, vehicle),
		hit = setupCache.get(key);
	if (hit && Date.now() - hit.time < SETUP_CACHE_MS) return hit.data;
	if (setupPending.has(key)) return setupPending.get(key);
	const generation = setupRevisions.get(key) || 0;
	const p = (async () => {
		const r = await fetch(
			`/api/setups?category=${encodeURIComponent(category)}&vehicle=${encodeURIComponent(vehicle)}`,
			{ cache: 'no-store', credentials: 'same-origin' }
		);
		const d = await r.json();
		if (!d.success) throw new Error(d.error || 'Fehler beim Laden.');
		if (generation === (setupRevisions.get(key) || 0))
			setupCache.set(key, { time: Date.now(), data: d });
		return d;
	})().finally(() => {
		if (setupPending.get(key) === p) setupPending.delete(key);
	});
	setupPending.set(key, p);
	return p;
}
function groupSetups(items) {
	const groups = new Map();
	for (const s of items) {
		const parts = [];
		if (s.series) parts.push(s.series);
		if (s.variant && s.variant !== 'Standard') parts.push(s.variant);
		const key = parts.length ? parts.join(' · ') : 'Standard';
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(s);
	}
	return groups;
}
let currentCarSetups = [];
function renderSetups(setups) {
	const list = $('setupList');
	list.innerHTML = '';
	const mfr = activeMfr;
	const track = trackSearchVal.trim().toLowerCase();
	const filtered = setups.filter((s) => {
		const vendor = classifyVendor(s.name);
		if (mfr && vendor !== mfr) return false;
		if (track && !((s.displayName || '') + ' ' + s.name).toLowerCase().includes(track))
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
	for (const [group, items] of groupSetups(filtered)) {
		const wrap = document.createElement('section');
		wrap.className = 'setup-group';
		const title = document.createElement('div');
		title.className = 'setup-group-title';
		title.textContent = group;
		wrap.appendChild(title);
		items.forEach((s) => {
			const el = document.createElement('div');
			el.className = 'setup';
			const info = document.createElement('div');
			info.className = 'setup-info';
			const name = document.createElement('div');
			name.className = 'setup-track';
			const vendor = classifyVendor(s.name);
			const tag = vendor ? '<span class="vendor-tag ' + vendor + '">' + vendor + '</span>' : '';
			name.innerHTML = esc(s.displayName || displaySetupFileName(s.name)) + tag;
			const meta = document.createElement('div');
			meta.className = 'setup-meta';
			meta.textContent = [s.series, s.variant, 'ZIP'].filter(Boolean).join(' · ');
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
			dl.download = '';
			dl.textContent = 'Download';
			actions.appendChild(dl);
			if (currentUser?.canUpload) {
				const del = document.createElement('button');
				del.className = 'delete-btn';
				del.style.display = 'flex';
				del.title = 'Setup löschen';
				del.setAttribute('aria-label', 'Setup löschen');
				del.textContent = '🗑';
				del.addEventListener('click', () => openDeleteModal(s.name));
				actions.appendChild(del);
			}
			el.append(info, actions);
			wrap.appendChild(el);
		});
		list.appendChild(wrap);
	}
}
async function loadCarSetups(category, vehicle) {
	const list = $('setupList');
	list.innerHTML = '<div class="empty">Setups werden geladen...</div>';
	try {
		const d = await getCarSetups(category, vehicle);
		if (currentCar.category !== category || currentCar.vehicle !== vehicle) return;
		list.innerHTML = '';
		currentCarSetups = d.setups;
		renderSetups(d.setups);
	} catch (e) {
		list.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
	}
}
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
function updateSessionUploadProgress(done, total, current) {
	const percent = total ? Math.round((done / total) * 100) : 0;
	$('sessionUploadProgress').classList.remove('hidden');
	$('sessionProgressCount').textContent = `${done} / ${total} Setups verarbeitet`;
	$('sessionProgressPercent').textContent = `${percent} %`;
	$('sessionProgressBar').setAttribute('aria-valuenow', String(percent));
	$('sessionProgressFill').style.width = percent + '%';
	$('sessionProgressCurrent').textContent = current ? 'Aktuell: ' + current : '';
	$('sessionProgressCurrent').classList.toggle('hidden', !current);
}
function uploadRow(statuses, name) {
	return [...statuses.querySelectorAll('.file-status')].find((x) => x.dataset.name === name);
}
function markUploadJob(statuses, job, cls, text) {
	job.state = cls;
	const x = uploadRow(statuses, job.file.name);
	if (x) {
		x.className = 'file-status ' + (cls === 'ok' ? 'ok' : cls === 'err' ? 'err' : '');
		x.textContent = job.file.name + ' — ' + text;
	}
}
const MAX_UPLOAD_ATTEMPTS = 5;
function uploadRetryDelay(response, data, fileError) {
	const header = response.headers.get('Retry-After');
	const headerMs =
		header === null
			? 0
			: /^\d+(\.\d+)?$/.test(header)
				? Number(header) * 1000
				: Date.parse(header) - Date.now();
	return Math.max(
		0,
		Number.isFinite(headerMs) ? headerMs : 0,
		Number(data.retryAfterMs) || 0,
		Number(fileError?.retryAfterMs) || 0
	);
}
async function waitForUploadRetry(job, statuses) {
	while (job.nextRetryAt > Date.now()) {
		markUploadJob(
			statuses,
			job,
			'waiting',
			'Erneuter Versuch in ' +
				Math.ceil((job.nextRetryAt - Date.now()) / 1000) +
				' s · ' +
				job.error
		);
		await new Promise((resolve) =>
			setTimeout(resolve, Math.min(1000, job.nextRetryAt - Date.now()))
		);
	}
}
async function requestUploadJob(job) {
	const form = new FormData();
	form.append('category', job.category);
	form.append('vehicle', job.vehicle);
	form.append('version', job.version);
	form.append(
		'previousSetups',
		JSON.stringify(job.previousSetups || { action: 'keep', targets: [] })
	);
	form.append('files', job.file, job.file.name);
	const controller = new AbortController(),
		timeout = setTimeout(() => controller.abort(), 180000);
	try {
		const response = await fetch('/api/setups/upload', {
			method: 'POST',
			body: form,
			credentials: 'same-origin',
			signal: controller.signal,
		});
		let data = {};
		try {
			data = await response.json();
		} catch {
			return {
				error: 'Ungültige Server-Antwort (HTTP ' + response.status + ')',
				retryable: response.status >= 500 || response.ok || response.status === 429,
				retryAfterMs: uploadRetryDelay(response, {}),
			};
		}
		const stored = (data.uploaded || []).find(
			(item) => item.originalName === job.file.name || item.name === job.file.name
		);
		if (response.ok && stored) {
			job.storedName = stored.name;
			return { success: true };
		}
		const fileError = (data.errors || []).find(
			(item) => item.originalName === job.file.name || item.name === job.file.name
		);
		const retryable =
			fileError?.retryable ??
			data.retryable ??
			([408, 409, 425, 429].includes(response.status) || response.status >= 500);
		return {
			error:
				fileError?.error || data.error || 'Upload fehlgeschlagen (HTTP ' + response.status + ')',
			retryable,
			retryAfterMs: uploadRetryDelay(response, data, fileError),
		};
	} catch (error) {
		return {
			error:
				error.name === 'AbortError'
					? 'Zeitüberschreitung. Speicherstand wird erneut geprüft.'
					: 'Netzwerkfehler',
			retryable: true,
		};
	} finally {
		clearTimeout(timeout);
	}
}
async function uploadSingleJob(job, statuses) {
	const file = job.file;
	if (!/\.zip$/i.test(file.name) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
		job.error = 'Ungültige ZIP-Datei oder Dateigröße (maximal 25 MiB).';
		markUploadJob(statuses, job, 'err', job.error);
		return false;
	}
	for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
		await waitForUploadRetry(job, statuses);
		markUploadJob(
			statuses,
			job,
			'uploading',
			'Wird hochgeladen · Versuch ' + attempt + '/' + MAX_UPLOAD_ATTEMPTS
		);
		const result = await requestUploadJob(job);
		if (result.success) {
			job.error = '';
			job.nextRetryAt = 0;
			markUploadJob(
				statuses,
				job,
				'ok',
				'Erfolgreich' +
					(job.storedName && job.storedName !== file.name
						? ' · gespeichert als ' + displaySetupFileName(job.storedName)
						: '') +
					(job.previousSetups?.decisionNote ? ' · ' + job.previousSetups.decisionNote : '')
			);
			return true;
		}
		job.error = result.error;
		job.nextRetryAt = result.retryable
			? Date.now() +
				Math.max(result.retryAfterMs || 0, 2000 * 2 ** (attempt - 1)) +
				Math.floor(Math.random() * 500)
			: 0;
		if (!result.retryable || attempt === MAX_UPLOAD_ATTEMPTS) break;
	}
	markUploadJob(statuses, job, 'err', 'Fehlgeschlagen · ' + job.error);
	return false;
}

async function refreshUploadedCarState(category, vehicle) {
	invalidateSetupCache(category, vehicle);
	const d = await getCarSetups(category, vehicle);
	if (currentCar.category === category && currentCar.vehicle === vehicle) {
		currentCarSetups = d.setups;
		renderSetups(d.setups);
	}
	if (typeof refreshVehicleCounts === 'function') await refreshVehicleCounts();
}
async function runUploadJobs(jobs, { appendRows = false } = {}) {
	if (uploadQueueRunning) return { ok: 0, failed: jobs.length, failedJobs: jobs };
	uploadQueueRunning = true;
	const status = $('uploadStatus'),
		statuses = $('fileStatuses'),
		btn = $('uploadBtn'),
		retryBtn = $('retryFailedBtn'),
		uploadCategory = jobs[0].category,
		uploadVehicle = jobs[0].vehicle;
	if (!appendRows) statuses.innerHTML = '';
	for (const job of jobs) {
		let x = uploadRow(statuses, job.file.name);
		if (!x) {
			x = document.createElement('div');
			x.className = 'file-status';
			x.dataset.name = job.file.name;
			statuses.appendChild(x);
		}
		x.textContent = job.file.name + ' — Wartet';
		x.className = 'file-status';
		job.state = 'waiting';
		job.error = '';
	}
	btn.disabled = true;
	retryBtn.disabled = true;
	retryBtn.classList.remove('show');
	let done = 0,
		ok = 0,
		failed = 0,
		refreshError = false;
	const updateSummary = (current) => {
		updateSessionUploadProgress(done, jobs.length, current);
		status.textContent =
			(current ? `Aktuell: ${current} · ` : '') +
			`${done}/${jobs.length} verarbeitet · ${ok} erfolgreich · ${failed} fehlgeschlagen`;
	};
	updateSummary('');
	try {
		for (const job of jobs) {
			updateSummary(job.file.name);
			const success = await uploadSingleJob(job, statuses);
			if (success) ok++;
			else failed++;
			done++;
			updateSummary('');
			if (done < jobs.length) await new Promise((resolve) => setTimeout(resolve, 1100));
		}
		if (ok) {
			try {
				await refreshUploadedCarState(uploadCategory, uploadVehicle);
			} catch {
				refreshError = true;
			}
		}
	} finally {
		uploadQueueRunning = false;
		btn.disabled = false;
		retryBtn.disabled = false;
		const failedJobs = jobs.filter((job) => job.state === 'err');
		if (failedJobs.length) retryBtn.classList.add('show');
		else retryBtn.classList.remove('show');
		status.textContent =
			`${ok} erfolgreich · ${failed} fehlgeschlagen` +
			(refreshError ? ' · Anzeige konnte nicht aktualisiert werden.' : '');
	}
	return { ok, failed, failedJobs: jobs.filter((job) => job.state === 'err'), refreshError };
}
function uploadVersionError(version) {
	if (version.length > 40) return 'Version ist zu lang (maximal 40 Zeichen).';
	if (/[\u0000-\u001F\u007F]/.test(version)) return 'Ungültige Version.';
	return '';
}
function chooseUploadVersions(files, sharedVersion) {
	return new Promise((resolve) => {
		const dialog = document.createElement('dialog');
		dialog.className = 'upload-version-dialog';
		dialog.setAttribute('aria-labelledby', 'uploadVersionTitle');
		dialog.setAttribute('aria-describedby', 'uploadVersionHint');
		dialog.innerHTML =
			'<h2 id="uploadVersionTitle">Haben alle Setups die gleiche Version?</h2><p id="uploadVersionHint"></p><div id="uploadVersionFiles" class="upload-version-files hidden"></div><p id="uploadVersionError" class="upload-version-error" role="alert"></p><div class="upload-version-actions"><button type="button" id="uploadVersionCancel">Abbrechen</button><button type="button" id="uploadVersionNo" autofocus>Nein</button><button type="button" id="uploadVersionYes" class="discord-button">Ja</button><button type="button" id="uploadVersionStart" class="discord-button hidden">Hochladen</button></div>';
		document.body.appendChild(dialog);
		const hint = dialog.querySelector('#uploadVersionHint'),
			list = dialog.querySelector('#uploadVersionFiles'),
			error = dialog.querySelector('#uploadVersionError');
		hint.textContent =
			files.length +
			' ZIP-Dateien ausgewählt. ' +
			(sharedVersion
				? 'Gemeinsame Version: „' + sharedVersion + '“.'
				: 'Die Versionsangabe ist optional. Ohne Angabe wird keine Version hinterlegt.');
		let versions = null,
			mode = 'question';
		dialog.querySelector('#uploadVersionCancel').addEventListener('click', () => dialog.close());
		dialog.querySelector('#uploadVersionYes').addEventListener('click', () => {
			mode = 'shared';
			dialog.querySelector('#uploadVersionTitle').textContent =
				files.length === 1 ? 'Version eintragen' : 'Gemeinsame Version eintragen';
			hint.textContent = 'Diese Version gilt für alle ausgewählten ZIPs. Die Angabe ist optional.';
			list.innerHTML =
				'<div class="upload-version-row"><label for="uploadSharedVersion">Version für alle Setups</label><input id="uploadSharedVersion" type="text" maxlength="40" placeholder="Version (optional)"></div>';
			const input = list.querySelector('input');
			input.value = sharedVersion;
			list.classList.remove('hidden');
			error.textContent = '';
			dialog.querySelector('#uploadVersionNo').classList.add('hidden');
			dialog.querySelector('#uploadVersionYes').classList.add('hidden');
			dialog.querySelector('#uploadVersionStart').classList.remove('hidden');
			dialog.querySelector('#uploadVersionStart').textContent = 'Weiter';
			input.focus();
		});
		dialog.querySelector('#uploadVersionNo').addEventListener(
			'click',
			() => {
				mode = 'individual';
				dialog.querySelector('#uploadVersionTitle').textContent = 'Version je Setup eintragen';
				hint.textContent =
					'Trage die passende Version neben jeder ZIP ein. Alle Versionsfelder sind optional und dürfen leer bleiben.';
				error.textContent = '';
				files.forEach((file, index) => {
					const row = document.createElement('div');
					row.className = 'upload-version-row';
					const label = document.createElement('label');
					label.htmlFor = 'uploadFileVersion' + index;
					label.textContent = file.name;
					const input = document.createElement('input');
					input.id = label.htmlFor;
					input.type = 'text';
					input.maxLength = 40;
					input.placeholder = 'Version (optional)';
					input.setAttribute('aria-label', 'Version für ' + file.name + ' (optional)');
					row.append(label, input);
					list.appendChild(row);
				});
				list.classList.remove('hidden');
				dialog.querySelector('#uploadVersionNo').classList.add('hidden');
				dialog.querySelector('#uploadVersionYes').classList.add('hidden');
				dialog.querySelector('#uploadVersionStart').classList.remove('hidden');
				list.querySelector('input').focus();
			},
			{ once: true }
		);
		dialog.querySelector('#uploadVersionStart').addEventListener('click', () => {
			const inputs = [...list.querySelectorAll('input')];
			const values = inputs.map((input) => input.value.trim());
			const invalid = values.findIndex((value) => uploadVersionError(value));
			if (invalid !== -1) {
				error.textContent = uploadVersionError(values[invalid]);
				inputs[invalid].focus();
				return;
			}
			versions = mode === 'shared' ? files.map(() => values[0]) : values;
			dialog.close();
		});
		dialog.addEventListener(
			'close',
			() => {
				dialog.remove();
				resolve(versions);
			},
			{ once: true }
		);
		dialog.showModal();
		if (files.length === 1) dialog.querySelector('#uploadVersionYes').click();
	});
}
function uploadSetupFamily(name, version) {
	let key = displaySetupFileName(name).replace(/\.zip$/i, '');
	key = key.replace(/\bv\d+(?:[._-]\d+)*\b/gi, ' ');
	const value = String(version || '').trim();
	if (value && (value.includes('.') || /^v/i.test(value))) {
		const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		key = key.replace(new RegExp('(^|[^a-z0-9])' + escaped + '(?=$|[^a-z0-9])', 'gi'), '$1');
	}
	return key
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}
async function uploadFileIdentity(file) {
	const bytes = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(new Uint8Array(reader.result));
		reader.onerror = () => reject(new Error('ZIP konnte nicht geprüft werden.'));
		reader.readAsArrayBuffer(file);
	});
	const header = new TextEncoder().encode('blob ' + bytes.length + '\0'),
		input = new Uint8Array(header.length + bytes.length);
	input.set(header);
	input.set(bytes, header.length);
	return [...new Uint8Array(await crypto.subtle.digest('SHA-1', input))]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}
async function choosePreviousSetups(files, target, versions) {
	invalidateSetupCache(target.category, target.vehicle);
	const data = await getCarSetups(target.category, target.vehicle),
		incoming = new Set(files.map((file) => file.name)),
		choices = [];
	for (let index = 0; index < files.length; index++) {
		const file = files[index],
			version = versions[index],
			vendor = classifyVendor(file.name),
			family = uploadSetupFamily(file.name, version);
		const matches = (data.setups || []).filter(
			(old) =>
				vendor &&
				classifyVendor(old.name) === vendor &&
				(!incoming.has(old.name) || old.name === file.name) &&
				/^[a-f0-9]{40}$/.test(old.sha || '') &&
				uploadSetupFamily(old.name, old.version) === family
		);
		const sameName = matches.find((old) => old.name === file.name);
		const sha = matches.length ? await uploadFileIdentity(file) : null,
			duplicate = matches.find((old) => old.sha === sha);
		const candidates = matches;
		choices.push({
			file,
			version,
			candidates,
			sameName,
			duplicate,
			decisionNote: duplicate
				? 'Identische ZIP bereits vorhanden: ' + displaySetupFileName(duplicate.name)
				: '',
		});
	}
	const defaultPlan = (choice) => ({
		action: 'keep',
		targets:
			!choice.duplicate && choice.sameName
				? [{ name: choice.sameName.name, sha: choice.sameName.sha }]
				: [],
		...(choice.duplicate
			? { duplicateOf: { name: choice.duplicate.name, sha: choice.duplicate.sha } }
			: {}),
		decisionNote: choice.decisionNote,
	});
	if (!choices.some((choice) => choice.candidates.length)) return choices.map(defaultPlan);
	return new Promise((resolve) => {
		const dialog = document.createElement('dialog');
		dialog.className = 'upload-version-dialog';
		dialog.setAttribute('aria-labelledby', 'oldSetupsTitle');
		dialog.innerHTML =
			'<h2 id="oldSetupsTitle">Setup bereits vorhanden</h2><p>Wähle, was mit den vorhandenen passenden Setups desselben Herstellers passieren soll. Die Entscheidung gilt auch bei gleicher oder fehlender Version. Ersetzen aktualisiert eine gleichnamige Datei. Löschen entfernt die alte Datei erst, nachdem die neue separat gespeichert ist. Veraltet markieren behält die alte ZIP und kennzeichnet sie.</p><div class="old-setup-choices"></div><p class="upload-version-error" role="alert"></p><div class="upload-version-actions"><button type="button" data-cancel>Abbrechen</button><button type="button" class="discord-button" data-start>Upload starten</button></div>';
		let plans = null;
		const rows = [],
			container = dialog.querySelector('.old-setup-choices'),
			error = dialog.querySelector('[role="alert"]');
		choices.forEach((choice) => {
			const { file, version, candidates } = choice;
			if (!candidates.length) {
				rows.push({ choice });
				return;
			}
			const row = document.createElement('section');
			row.className = 'old-setup-choice';
			const heading = document.createElement('h3');
			heading.textContent =
				displaySetupFileName(file.name) +
				' · angegebene Version: ' +
				(version || 'nicht angegeben') +
				(choice.duplicate ? ' · identischer Inhalt' : '');
			row.append(heading);
			const label = document.createElement('label');
			label.textContent = 'Alte Setups: ';
			const select = document.createElement('select');
			select.setAttribute('aria-label', 'Umgang mit alten Setups für ' + file.name);
			for (const [value, text] of [
				['keep', 'Behalten'],
				['replace', 'Durch aktuellen Upload ersetzen'],
				['delete', 'Alte Datei nach dem Upload löschen'],
				['outdate', 'Als veraltet markieren'],
			]) {
				const option = document.createElement('option');
				option.value = value;
				option.textContent = text;
				select.append(option);
			}
			label.append(select);
			row.append(label);
			const list = document.createElement('div');
			list.className = 'old-setup-list hidden';
			const inputs = [];
			for (const old of candidates) {
				const item = document.createElement('label'),
					input = document.createElement('input');
				input.type = 'checkbox';
				input.checked = true;
				item.append(
					input,
					document.createTextNode(
						displaySetupFileName(old.name) +
							' · bisherige Version: ' +
							(old.version || 'nicht angegeben') +
							(old.outdated ? ' · veraltet' : '')
					)
				);
				list.append(item);
				inputs.push({ input, old });
			}
			select.addEventListener('change', () =>
				list.classList.toggle('hidden', select.value === 'keep')
			);
			row.append(list);
			container.append(row);
			rows.push({ choice, select, inputs });
		});
		dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
		dialog.querySelector('[data-start]').addEventListener('click', () => {
			const next = rows.map(({ choice, select, inputs }) =>
				!select || select.value === 'keep'
					? defaultPlan(choice)
					: {
							action: select.value,
							targets: inputs
								.filter((x) => x.input.checked)
								.map(({ old }) => ({ name: old.name, sha: old.sha })),
						}
			);
			if (next.some((plan) => plan.action !== 'keep' && !plan.targets.length)) {
				error.textContent = 'Bitte die betroffenen alten Dateien auswählen oder „Behalten“ wählen.';
				return;
			}
			plans = next;
			dialog.close();
		});
		dialog.addEventListener(
			'close',
			() => {
				dialog.remove();
				resolve(plans);
			},
			{ once: true }
		);
		document.body.append(dialog);
		dialog.showModal();
	});
}
$('uploadBtn').addEventListener('click', () => {
	if (!uploadQueueRunning && !uploadPreparing) $('fileInput').click();
});
$('fileInput').addEventListener('change', async function () {
	if (uploadQueueRunning || uploadPreparing) {
		this.value = '';
		return;
	}
	const files = [...this.files],
		status = $('uploadStatus');
	if (!files.length) return;
	if (files.length > 50) {
		status.textContent = 'Maximal 50 ZIP-Dateien gleichzeitig.';
		this.value = '';
		return;
	}
	if (
		files.some(
			(file) => !/\.zip$/i.test(file.name) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES
		)
	) {
		status.textContent = 'Nur ZIP-Dateien mit maximal 25 MiB pro Datei sind erlaubt.';
		this.value = '';
		return;
	}
	const sharedVersion = '';
	const target = { ...currentCar };
	uploadPreparing = true;
	$('uploadBtn').disabled = true;
	$('retryFailedBtn').disabled = true;
	try {
		const versions = await chooseUploadVersions(files, sharedVersion);
		if (!versions) return;
		const error = versions.map(uploadVersionError).find(Boolean);
		if (error) {
			status.textContent = error;
			return;
		}
		const previous = await choosePreviousSetups(files, target, versions);
		if (!previous) return;
		lastUploadJobs = files.map((file, index) => ({
			file,
			previousSetups: previous[index],
			version: versions[index],
			category: target.category,
			vehicle: target.vehicle,
			state: 'waiting',
			error: '',
		}));
		await runUploadJobs(lastUploadJobs);
	} catch (error) {
		status.textContent =
			error.message || 'Vorhandene Setups konnten nicht geprüft werden. Bitte erneut versuchen.';
	} finally {
		uploadPreparing = false;
		$('uploadBtn').disabled = false;
		$('retryFailedBtn').disabled = false;
		this.value = '';
	}
});
$('retryFailedBtn').addEventListener('click', async () => {
	if (uploadQueueRunning || uploadPreparing) return;
	const failed = lastUploadJobs.filter((job) => job.state === 'err');
	if (!failed.length) {
		$('retryFailedBtn').classList.remove('show');
		return;
	}
	await runUploadJobs(failed, { appendRows: true });
});

let deleteInFlight = false;
function openDeleteModal(name) {
	if (deleteInFlight) return;
	const item = currentCarSetups.find((setup) => setup.name === name);
	pendingDelete = { ...currentCar, name, ...(item?.sha ? { sha: item.sha } : {}) };
	$('deleteModalText').textContent =
		`Möchtest du „${displaySetupFileName(name)}“ wirklich löschen?`;
	$('deleteConfirm').textContent = 'Löschen';
	$('deleteModal').classList.add('show');
}
function closeDeleteModal() {
	if (deleteInFlight) return;
	pendingDelete = null;
	$('deleteModal').classList.remove('show');
}
$('deleteCancel').addEventListener('click', closeDeleteModal);
$('deleteModal').addEventListener('click', (e) => {
	if (e.target === $('deleteModal')) closeDeleteModal();
});
async function requestSetupDelete(target) {
	for (let attempt = 0; attempt < 3; attempt++) {
		let response, data;
		try {
			response = await fetch('/api/setups/delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify(target),
				signal: AbortSignal.timeout(45000),
			});
			data = await response.json();
		} catch {
			if (attempt === 2)
				throw new Error(
					'Verbindung unterbrochen. Bitte erneut versuchen; der Löschstand wird dabei geprüft.'
				);
			await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
			continue;
		}
		if (response.ok && data.success) return data;
		if (!(data.retryable ?? (response.status >= 500 || response.status === 429)) || attempt === 2)
			throw new Error(data.error || 'Löschen fehlgeschlagen.');
		$('deleteModalText').textContent =
			'GitHub ist gerade beschäftigt. Löschstand wird erneut geprüft…';
		await new Promise((resolve) =>
			setTimeout(resolve, Math.max(1000 * (attempt + 1), uploadRetryDelay(response, data)))
		);
	}
}
$('deleteConfirm').addEventListener('click', async () => {
	if (!pendingDelete || deleteInFlight) return;
	const target = { ...pendingDelete };
	deleteInFlight = true;
	$('deleteConfirm').disabled = true;
	$('deleteCancel').disabled = true;
	$('deleteConfirm').textContent = 'Wird gelöscht…';
	$('deleteModalText').textContent =
		'„' + displaySetupFileName(target.name) + '“ wird gelöscht. Bitte kurz warten.';
	try {
		await requestSetupDelete(target);
		invalidateSetupCache(target.category, target.vehicle);
		if (currentCar.category === target.category && currentCar.vehicle === target.vehicle) {
			currentCarSetups = currentCarSetups.filter((setup) => setup.name !== target.name);
			renderSetups(currentCarSetups);
		}
		deleteInFlight = false;
		closeDeleteModal();
		if (typeof refreshVehicleCounts === 'function') void refreshVehicleCounts().catch(() => {});
	} catch (error) {
		$('deleteModalText').textContent = error.message;
	} finally {
		deleteInFlight = false;
		$('deleteConfirm').disabled = false;
		$('deleteCancel').disabled = false;
		$('deleteConfirm').textContent = 'Löschen';
	}
});
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
$('trackSearch').addEventListener('input', (e) => {
	trackSearchVal = e.target.value;
	renderSetups(currentCarSetups);
});
document.querySelectorAll('#mfrFilter .mfr-btn').forEach((btn) =>
	btn.addEventListener('click', () => {
		activeMfr = btn.dataset.mfr || '';
		document
			.querySelectorAll('#mfrFilter .mfr-btn')
			.forEach((b) => b.classList.toggle('active', b === btn));
		if ($('carPage').classList.contains('active')) renderSetups(currentCarSetups);
	})
);
async function openSetupFromQuery() {
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
		trackSearchVal = setup;
		const input = $('trackSearch');
		if (input) input.value = setup;
		renderSetups(currentCarSetups);
		requestAnimationFrame(() => {
			const target = [...document.querySelectorAll('#setupList .setup')].find((el) =>
				el.textContent.toLowerCase().includes(setup.toLowerCase())
			);
			(target || $('setupList')).scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}
}
loadTheme();
