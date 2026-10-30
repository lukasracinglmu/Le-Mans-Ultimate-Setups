import { $ } from '../shared/dom.js';
import { refreshVehicleCounts } from './catalog.js';
import { invalidateSetupCache } from './setup-cache.js';
import { renderSetups } from './setup-list.js';
import { displaySetupFileName } from './setup-names.js';
import { state } from './state.js';
import { uploadRetryDelay } from './upload.js';

let pendingDelete = null;
let deleteInFlight = false;

export function openDeleteModal(name) {
	if (deleteInFlight) return;
	const item = state.currentCarSetups.find((setup) => setup.name === name);
	pendingDelete = { ...state.currentCar, name, ...(item?.sha ? { sha: item.sha } : {}) };
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

export function initDelete() {
	$('deleteCancel').addEventListener('click', closeDeleteModal);

	$('deleteModal').addEventListener('click', (e) => {
		if (e.target === $('deleteModal')) closeDeleteModal();
	});

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
			if (
				state.currentCar.category === target.category &&
				state.currentCar.vehicle === target.vehicle
			) {
				state.currentCarSetups = state.currentCarSetups.filter(
					(setup) => setup.name !== target.name
				);
				renderSetups(state.currentCarSetups);
			}
			deleteInFlight = false;
			closeDeleteModal();
			void refreshVehicleCounts(true).catch(() => {});
		} catch (error) {
			$('deleteModalText').textContent = error.message;
		} finally {
			deleteInFlight = false;
			$('deleteConfirm').disabled = false;
			$('deleteCancel').disabled = false;
			$('deleteConfirm').textContent = 'Löschen';
		}
	});
}
