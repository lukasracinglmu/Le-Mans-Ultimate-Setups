import { adminApi } from './admin-api.js';

const POLL_INTERVAL = 3000;
const MAX_POLLS = 300;

function backupLabel(backup) {
	if (backup.status === 'pending') {
		return 'Wird erstellt';
	}
	if (backup.status === 'failed') {
		return 'Fehlgeschlagen';
	}
	return backup.verified
		? 'Vollständiges Repository · ' + backup.fileCount + ' Dateien'
		: 'Altbestand · Vollständigkeit nicht geprüft';
}

function backupLinks(backup) {
	if (backup.status === 'pending' || backup.status === 'failed') {
		return [['Fortschritt ansehen', backup.runUrl]];
	}
	return [
		['Ansehen', backup.viewUrl],
		['Herunterladen', backup.downloadUrl],
	];
}

function emptyRow(text) {
	const empty = document.createElement('div');
	empty.className = 'empty';
	empty.textContent = text;
	return empty;
}

function createBackupRow(backup) {
	const row = document.createElement('div');
	row.className = 'user';
	const meta = document.createElement('div');
	meta.className = 'meta';
	const name = document.createElement('div');
	name.className = 'name';
	name.textContent = backup.tag;
	const details = document.createElement('div');
	details.className = 'details';
	details.textContent =
		backupLabel(backup) +
		' · Erstellt: ' +
		new Date(backup.createdAt).toLocaleString('de-DE') +
		' · Automatische Löschung: ' +
		new Date(backup.deleteAt).toLocaleString('de-DE');
	meta.append(name, details);
	row.appendChild(meta);
	const actions = document.createElement('div');
	actions.className = 'actions';
	for (const [text, url] of backupLinks(backup)) {
		if (!url) {
			continue;
		}
		const link = document.createElement('a');
		link.className = 'button-link';
		link.target = '_blank';
		link.rel = 'noopener';
		link.href = url;
		link.textContent = text;
		actions.appendChild(link);
	}
	row.appendChild(actions);
	return row;
}

export function initBackups() {
	const button = document.getElementById('manualBackup');
	const status = document.getElementById('backupStatus');
	const list = document.getElementById('backupList');
	const latestLink = document.getElementById('latestBackupLink');

	async function loadBackups() {
		if (!list) {
			return;
		}
		try {
			const data = await adminApi('/api/admin/backups');
			const rows = data.backups || [];
			const latest = rows.find((item) => item.verified);
			if (latest && latestLink) {
				latestLink.href = latest.viewUrl;
				latestLink.classList.remove('hidden');
			} else {
				latestLink?.classList.add('hidden');
			}
			list.replaceChildren();
			if (!rows.length) {
				list.appendChild(emptyRow('Noch keine Backups vorhanden.'));
				return;
			}
			for (const backup of rows) {
				list.appendChild(createBackupRow(backup));
			}
		} catch (error) {
			list.replaceChildren();
			list.appendChild(emptyRow(error.message));
		}
	}

	const createBackup = async () => {
		button.disabled = true;
		status.textContent = 'Backup wird vorbereitet…';
		status.className = 'status';
		try {
			const result = await adminApi('/api/admin/backup', 'POST', {});
			if (!result.success) {
				throw Error(result.error || 'Backup fehlgeschlagen.');
			}
			await loadBackups();
			let job = result;
			// GitHub copies the complete repository in the background. A 202 is not a completed backup.
			for (let attempt = 0; job.status === 'pending' && attempt < MAX_POLLS; attempt++) {
				status.textContent = 'Das vollständige Repository wird gesichert…';
				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
				job = (await adminApi('/api/admin/backups?job=' + encodeURIComponent(result.id))).job;
			}
			if (job.status === 'failed') {
				throw Error(job.error || 'Backup fehlgeschlagen.');
			}
			if (job.status === 'completed') {
				status.textContent =
					'Vollständiges Backup erstellt. ' +
					(job.notificationDelivered
						? 'Discord-DM wurde zugestellt.'
						: 'Discord-Benachrichtigung wird erneut versucht.');
				status.className = 'status ok';
			} else {
				status.textContent =
					'Die Sicherung läuft auf GitHub weiter. Die DM kommt nach erfolgreichem Abschluss.';
			}
			await loadBackups();
		} catch (error) {
			status.textContent = error.message;
			status.className = 'status err';
			await loadBackups();
		} finally {
			button.disabled = false;
		}
	};

	button.addEventListener('click', createBackup);
	const schedule = document.createElement('p');
	schedule.textContent =
		'Automatisch täglich um 00:00 und 12:00 Uhr (deutsche Zeit) · Aufbewahrung: 14 Tage';
	list.before(schedule);

	return { loadBackups };
}
