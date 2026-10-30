import { escapeHtml } from '../shared/dom.js';
import { adminApi } from './admin-api.js';

const DEFAULT_MESSAGE = 'Die Website ist momentan wegen Wartungsarbeiten nicht erreichbar.';
const MAINTENANCE_NODES =
	'[id*="maintenance" i],[class*="maintenance" i],[data-section*="maintenance" i]';
const OWNER_MARKER = 'data-owner-maintenance-authorized';

// Preview of the maintenance page with the entered message.
function previewDocument(message) {
	return (
		'<!doctype html><meta charset="utf-8"><title>Wartungsseiten-Vorschau</title><style>*{box-sizing:border-box}@keyframes maintenanceDrift{from{background-position:70px 75px,300px 305px}to{background-position:105px 110px,335px 340px}}body{font:16px Arial;background:#111318;color:#f5f6f8;display:grid;place-items:center;min-height:100vh;text-align:center;overflow:hidden;animation:maintenanceDrift 28s ease-in-out infinite alternate;background-image:url("/assets/bp-logo.webp?v=maintenance-gray-2"),url("/assets/bp-logo.webp?v=maintenance-gray-2");background-size:460px auto;background-position:70px 75px,300px 305px;background-repeat:repeat}main{max-width:620px;margin:30px;padding:34px 38px;border:1px solid #343943;border-radius:18px;background:#191c22;box-shadow:0 18px 60px #0008}h1{margin:0 0 12px}p{margin:0;color:#a5a9b3;line-height:1.55}</style><main><h1>Wartungsarbeiten</h1><p>' +
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
