import { invalidateSetupCache } from './setup-cache.js';
import { renderSetups } from './setup-list.js';
import { displaySetupFileName } from './setup-names.js';
import { state } from './state.js';

let openEditor = null;

// Opens the editor for a setup of the current vehicle. initVersionEditor() runs first.
export function openVersionEditor(setup) {
	openEditor(setup);
}

let editSetup = null;

export function initVersionEditor() {
	if (document.getElementById('versionEditModal')) return;
	const modal = document.createElement('div');
	modal.id = 'versionEditModal';
	modal.className = 'version-edit-backdrop';
	modal.innerHTML =
		'<div class="version-edit-modal"><h3>Setup bearbeiten</h3><label for="displayNameEditInput">Anzeigename</label><input id="displayNameEditInput" type="text" maxlength="160"><p class="edit-name-hint">Nur der Name in der Übersicht wird geändert. Leer lassen, um den normalen Dateinamen zu verwenden.</p><label for="versionEditInput">Version (optional)</label><input id="versionEditInput" type="text" maxlength="40"><div id="versionEditError" class="version-edit-error"></div><div class="version-edit-actions"><button type="button" id="versionEditCancel">Abbrechen</button><button type="button" id="outdatedToggle" class="action"></button><button type="button" id="versionEditSave">Speichern</button></div></div>';
	document.body.appendChild(modal);
	let saving = false;
	modal.setAttribute('role', 'dialog');
	modal.setAttribute('aria-modal', 'true');
	modal.querySelector('h3').id = 'setupEditTitle';
	modal.setAttribute('aria-labelledby', 'setupEditTitle');
	const close = () => {
		if (saving) return;
		editSetup = null;
		modal.classList.remove('show');
		document.getElementById('versionEditError').textContent = '';
	};
	document.getElementById('versionEditCancel').addEventListener('click', close);
	modal.addEventListener('click', (e) => {
		if (e.target === modal) close();
	});
	document.getElementById('versionEditSave').addEventListener('click', async () => {
		if (!editSetup || saving) return;
		const target = { ...editSetup },
			input = document.getElementById('versionEditInput'),
			nameInput = document.getElementById('displayNameEditInput'),
			err = document.getElementById('versionEditError'),
			btn = document.getElementById('versionEditSave'),
			cancel = document.getElementById('versionEditCancel');
		const version = input.value.trim(),
			displayName = nameInput.value.trim();
		if (displayName.length > 160) {
			err.textContent = 'Anzeigename ist zu lang.';
			return;
		}
		if (version.length > 40) {
			err.textContent = 'Version ist zu lang.';
			return;
		}
		saving = true;
		btn.disabled = true;
		cancel.disabled = true;
		input.disabled = true;
		nameInput.disabled = true;
		btn.textContent = 'Wird gespeichert…';
		err.textContent = '';
		try {
			const response = await fetch('/api/setups/version', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				signal: AbortSignal.timeout(45000),
				body: JSON.stringify({ ...target, version, displayName, outdated: target.outdated }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok || !data.success) throw Error(data.error || 'Speichern fehlgeschlagen.');
			if (
				state.currentCar.category === target.category &&
				state.currentCar.vehicle === target.vehicle
			) {
				const item = state.currentCarSetups.find((setup) => setup.name === target.name);
				if (item) {
					item.version = data.version;
					item.displayName = data.displayName || null;
					item.outdated = data.outdated;
				}
				renderSetups(state.currentCarSetups);
			}
			invalidateSetupCache(target.category, target.vehicle);
			saving = false;
			close();
		} catch (error) {
			err.textContent = error.message || 'Speichern fehlgeschlagen.';
		} finally {
			saving = false;
			btn.disabled = false;
			cancel.disabled = false;
			input.disabled = false;
			nameInput.disabled = false;
			btn.textContent = 'Speichern';
		}
	});
	openEditor = (setup) => {
		if (!state.currentUser?.canUpload || saving) return;
		editSetup = {
			category: state.currentCar.category,
			vehicle: state.currentCar.vehicle,
			name: setup.name,
			outdated: Boolean(setup.outdated),
		};
		document.getElementById('displayNameEditInput').value = setup.displayName || '';
		document.getElementById('displayNameEditInput').placeholder = displaySetupFileName(setup.name);
		document.getElementById('versionEditInput').value = setup.version || '';
		document.getElementById('outdatedToggle').textContent = editSetup.outdated
			? 'Als aktuell markieren'
			: 'Als veraltet markieren';
		document.getElementById('outdatedToggle').onclick = () => {
			if (saving) return;
			editSetup.outdated = !editSetup.outdated;
			document.getElementById('outdatedToggle').textContent = editSetup.outdated
				? 'Als aktuell markieren'
				: 'Als veraltet markieren';
			document.getElementById('versionEditSave').click();
		};
		document.getElementById('versionEditError').textContent = '';
		modal.classList.add('show');
		document.getElementById('displayNameEditInput').focus();
	};
}
