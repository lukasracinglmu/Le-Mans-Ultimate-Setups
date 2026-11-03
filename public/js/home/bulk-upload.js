import { $ } from '../shared/dom.js';
import { getUploadCatalog } from './catalog.js';
import { state } from './state.js';
import {
	choosePreviousSetups,
	chooseUploadVersions,
	runUploadJobs,
	setUploadPreparing,
	uploadIsBusy,
	validateUploadFiles,
} from './upload.js';
import { detectUploadTarget, validateUploadTargets } from './upload-targets.js';
import { checkUploadNames } from './upload-name-check.js';

let lastBulkJobs = [];

export function syncBulkUploadAccess() {
	$('bulkUploadArea').classList.toggle('hidden', !state.currentUser?.canUpload);
}

// Nothing is sent while this dialog is open. Every suggestion stays editable.
function chooseTargets(files, catalog) {
	return new Promise((resolve) => {
		const dialog = document.createElement('dialog');
		dialog.className = 'upload-version-dialog bulk-upload-dialog';
		dialog.setAttribute('aria-labelledby', 'bulkUploadTitle');
		dialog.innerHTML =
			'<h2 id="bulkUploadTitle">Sammel-Upload prüfen</h2><p>Die Fahrzeuge werden anhand der ZIP-Dateinamen vorgeschlagen. Prüfe die Zuordnung. Unbekannte oder mehrdeutige Dateien bleiben offen. Danach legst du Versionen und den Umgang mit alten Setups fest.</p><div class="upload-version-files"></div><p class="upload-version-error" role="alert"></p><div class="upload-version-actions"><button type="button" data-cancel>Abbrechen</button><button type="button" class="discord-button" data-next>Weiter zu Versionen</button></div>';
		const list = dialog.querySelector('.upload-version-files');
		const rows = files.map((file, index) => {
			const detected = detectUploadTarget(file.name, catalog);
			const row = document.createElement('div');
			row.className = 'upload-version-row bulk-upload-row';
			const label = document.createElement('label');
			label.htmlFor = 'bulkTarget' + index;
			label.textContent = file.name;
			const note = document.createElement('span');
			note.className = 'bulk-upload-note';
			const select = document.createElement('select');
			select.id = label.htmlFor;
			const add = (value, text) => {
				const option = document.createElement('option');
				option.value = value;
				option.textContent = text;
				select.append(option);
			};
			add('', 'Fahrzeug auswählen …');
			add('skip', 'Diese Datei überspringen');
			catalog.forEach((target, i) => add(String(i), target.vehicle + ' · ' + target.category));
			select.value = detected.target ? String(catalog.indexOf(detected.target)) : '';
			const update = () => {
				const selected = select.value === '' ? null : catalog[Number(select.value)];
				note.textContent =
					select.value === 'skip'
						? 'Wird übersprungen'
						: selected
							? detected.target === selected
								? 'Automatisch erkannt · bitte prüfen'
								: 'Manuell zugeordnet'
							: detected.candidates.length
								? 'Mehrdeutig · bitte auswählen'
								: 'Nicht erkannt · bitte auswählen';
				row.classList.toggle('needs-target', select.value === '');
				select.setAttribute('aria-invalid', String(select.value === ''));
			};
			select.addEventListener('change', update);
			label.append(note);
			row.append(label, select);
			list.append(row);
			update();
			return { file, select };
		});
		let result = null;
		dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
		dialog.querySelector('[data-next]').addEventListener('click', () => {
			const selected = rows.filter((row) => row.select.value !== 'skip');
			const targets = selected.map((row) =>
				row.select.value === '' ? null : catalog[Number(row.select.value)]
			);
			const error = !selected.length
				? 'Bitte mindestens eine Datei zum Hochladen auswählen.'
				: validateUploadTargets(
						selected.map((row) => row.file),
						targets
					);
			dialog.querySelector('[role="alert"]').textContent = error;
			if (error) {
				selected.find((row) => row.select.value === '')?.select.focus();
				return;
			}
			result = { files: selected.map((row) => row.file), targets };
			dialog.close();
		});
		dialog.addEventListener(
			'close',
			() => {
				dialog.remove();
				resolve(result);
			},
			{ once: true }
		);
		document.body.append(dialog);
		dialog.showModal();
	});
}

export function initBulkUpload() {
	$('bulkUploadBtn').addEventListener('click', () => {
		if (state.currentUser?.canUpload && !uploadIsBusy()) $('bulkFileInput').click();
	});
	$('bulkFileInput').addEventListener('change', async function () {
		const files = [...this.files];
		if (!files.length || !state.currentUser?.canUpload || uploadIsBusy()) {
			this.value = '';
			return;
		}
		const status = $('bulkUploadStatus');
		const error = validateUploadFiles(files);
		if (error) {
			status.textContent = error;
			this.value = '';
			return;
		}
		setUploadPreparing(true);
		try {
			await checkUploadNames(files);
			const selection = await chooseTargets(files, getUploadCatalog());
			if (!selection) return;
			await checkUploadNames(selection.files, selection.targets);
			const versions = await chooseUploadVersions(selection.files, '');
			if (!versions) return;
			status.textContent = 'Vorhandene Setups und Ersetzungen werden geprüft …';
			const previous = await choosePreviousSetups(selection.files, selection.targets, versions);
			if (!previous) {
				status.textContent = '';
				return;
			}
			lastBulkJobs = selection.files.map((file, index) => ({
				file,
				...selection.targets[index],
				version: versions[index],
				previousSetups: previous[index],
				state: 'waiting',
				error: '',
			}));
			await runUploadJobs(lastBulkJobs, { bulk: true });
		} catch (error) {
			status.textContent = error.message || 'Sammel-Upload konnte nicht vorbereitet werden.';
		} finally {
			setUploadPreparing(false);
			this.value = '';
		}
	});
	$('bulkRetryFailedBtn').addEventListener('click', async () => {
		if (uploadIsBusy() || !state.currentUser?.canUpload) return;
		const failed = lastBulkJobs.filter((job) => job.state === 'err');
		if (failed.length) await runUploadJobs(failed, { bulk: true, appendRows: true });
	});
}
