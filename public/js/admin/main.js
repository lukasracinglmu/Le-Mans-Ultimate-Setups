import { fetchMe } from '../shared/api.js';
import { initAccessPanel } from './access.js';
import { initBackups } from './backups.js';
import { initMaintenance, restrictMaintenanceToOwner } from './maintenance.js';
import { initOwnerNavigation } from '../shared/owner-navigation.js';

// Module scripts run after the document is parsed, so all panels already exist.
initOwnerNavigation();
const access = initAccessPanel();
initMaintenance();
const backups = initBackups();

function openPanel(data) {
	const owner = Boolean(data?.user?.isOwner);
	const full = Boolean(data?.user?.fullAdmin || owner);
	if (!data.loggedIn || (!data.user?.canViewAdminPanel && !owner)) {
		location.replace('/');
		return;
	}
	access.show({ ...data, isOwner: owner, user: { ...data.user, isOwner: owner, fullAdmin: full } });
	if (owner) {
		document.getElementById('backupCard').classList.remove('hidden');
		backups.loadBackups();
	} else {
		document.getElementById('backupCard').classList.add('hidden');
	}
	if (!full) {
		document.getElementById('adminRightsCard').classList.add('hidden');
		document.getElementById('maintenanceCard').classList.add('hidden');
	}
	access.load();
}

async function start() {
	let data;
	try {
		data = await fetchMe();
	} catch {
		restrictMaintenanceToOwner(false);
		location.replace('/');
		return;
	}
	try {
		openPanel(data);
	} catch {
		location.replace('/');
	}
	restrictMaintenanceToOwner(Boolean(data?.user?.isOwner));
}

start();
