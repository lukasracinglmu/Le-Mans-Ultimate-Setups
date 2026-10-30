import { escapeHtml } from '../shared/dom.js';
import { adminApi } from './admin-api.js';

const DEFAULT_MESSAGE = 'Die Website ist momentan wegen Wartungsarbeiten nicht erreichbar.';
const MAINTENANCE_NODES =
	'[id*="maintenance" i],[class*="maintenance" i],[data-section*="maintenance" i]';
const OWNER_MARKER = 'data-owner-maintenance-authorized';

// Preview of the maintenance page with the entered message. The window inherits
// the CSP of the admin page, so the styles come from a file.
function previewDocument(message) {
	return (
		'<!doctype html><meta charset="utf-8"><title>Wartungsseiten-Vorschau</title><link rel="stylesheet" href="/css/maintenance-preview.css"><main><h1>Wartungsarbeiten</h1><p>' +
		escapeHtml(message) +
		'</p></main>'
	);
}

export function initMaintenance() {
	const enabled = document.getElementById('maintenanceEnabled');
	const message = document.getElementById('maintenanceMessage');
	const save = document.getElementById('maintenanceSave');
	const status = document.getElementById('maintenanceStatus');

	document.getElementById('maintenancePreview').addEventListener('click', () => {
		const preview = window.open('', 'maintenance-preview', 'width=900,height=650');
		if (!preview) {
			return;
		}
		preview.document.write(previewDocument(message.value.trim() || DEFAULT_MESSAGE));
		preview.document.close();
	});

	save.addEventListener('click', async () => {
		try {
			await adminApi('/api/admin/maintenance', 'POST', {
				enabled: enabled.checked,
				message: message.value,
			});
			status.textContent = 'Wartungsmodus gespeichert.';
			status.className = 'status ok';
			setTimeout(() => {
				status.textContent = '';
				status.className = 'status';
			}, 2000);
		} catch (error) {
			status.textContent = error.message;
			status.className = 'status err';
		}
	});

	adminApi('/api/admin/maintenance')
		.then((data) => {
			enabled.checked = data.enabled;
			message.value = data.message || '';
		})
		.catch(() => {});
}

function hideMaintenance() {
	if (document.querySelector('[' + OWNER_MARKER + ']')) {
		return;
	}
	for (const node of document.querySelectorAll(MAINTENANCE_NODES)) {
		(node.closest('.card,section,fieldset') || node).classList.add('hidden');
	}
}

// Only the owner may switch the maintenance mode. Content added later is
// hidden as well.
export function restrictMaintenanceToOwner(isOwner) {
	if (isOwner) {
		document.documentElement.setAttribute(OWNER_MARKER, '1');
		return;
	}
	hideMaintenance();
	new MutationObserver(hideMaintenance).observe(document.body, { childList: true, subtree: true });
}
