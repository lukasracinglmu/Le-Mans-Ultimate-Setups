import { adminApi } from './admin-api.js';
import { renderGrantList, selectGrantUsers } from './grants.js';

const DISCORD_ID = /^\d{16,22}$/;
const INVALID_ID = 'Bitte eine gültige Discord User ID eingeben.';
const LABELS = {
	'/api/admin/database-access': 'Database',
	'/api/admin/upload-access': 'Upload/Delete',
	'/api/admin/all-access': 'Database, Upload und Delete',
	'/api/admin/admin-panel-access': 'Admin-Panel',
	'/api/admin/full-admin': 'Full Admin',
};
const ACCESS_ACTIONS = [
	['database', '/api/admin/database-access', 'POST'],
	['upload', '/api/admin/upload-access', 'POST'],
	['database-remove', '/api/admin/database-access', 'DELETE'],
	['upload-remove', '/api/admin/upload-access', 'DELETE'],
	['all', '/api/admin/all-access', 'POST'],
];
const PANEL_ACTIONS = [
	['panel', '/api/admin/admin-panel-access', 'POST'],
	['panel-remove', '/api/admin/admin-panel-access', 'DELETE'],
];

// Unique Discord IDs from a list separated by spaces, commas or semicolons.
export function parseUserIds(text) {
	return [
		...new Set(
			String(text || '')
				.split(/[\s,;]+/)
				.map((value) => value.trim())
				.filter((value) => DISCORD_ID.test(value))
		),
	];
}

// Adds the Full Admin grants to the access list. Users who only have Full
// Admin appear as their own entry.
export function mergeGrantUsers(accessUsers, fullRows) {
	const users = [...new Map(accessUsers.map((user) => [String(user.userId), user])).values()];
	for (const row of fullRows) {
		let user = users.find((item) => String(item.userId) === String(row.user_id));
		if (!user) {
			user = {
				userId: String(row.user_id),
				username: row.username || 'Discord-Nutzer',
				fullAdminAccess: true,
				fullAdminGrantedAt: row.created_at,
			};
			users.push(user);
		}
		if (row.username) {
			user.username = row.username;
		}
		if (row.avatar) {
			user.avatar = row.avatar;
		}
	}
	return users;
}

export function initAccessPanel() {
	const permissionFilter = document.getElementById('permissionFilter');
	const grantSort = document.getElementById('grantSort');
	const input = document.getElementById('userId');
	const status = document.getElementById('status');
	const list = document.getElementById('list');
	const fullButton = document.getElementById('fullAdminBtn');
	const fullRemoveButton = document.getElementById('fullAdminRemoveBtn');
	const adminInput = document.getElementById('adminUserId');
	const adminStatus = document.getElementById('adminStatus');
	const multiUserIds = document.getElementById('multiUserIds');
	const multiAdminUserIds = document.getElementById('multiAdminUserIds');
	const statusTimers = new Map();
	let me = null;
	let grantUsers = [];
	let grantFullRows = [];

	// A status message disappears after two seconds; a new one restarts the timer.
	const message = (text, ok = false, target = status) => {
		target.textContent = text;
		target.className = 'status ' + (ok ? 'ok' : 'err');
		clearTimeout(statusTimers.get(target));
		statusTimers.set(
			target,
			setTimeout(() => {
				target.textContent = '';
				target.className = 'status';
			}, 2000)
		);
	};

	const renderGrants = () => {
		const users = selectGrantUsers(
			grantUsers,
			grantFullRows,
			permissionFilter.value,
			grantSort.value
		);
		renderGrantList(list, users, { isOwner: Boolean(me?.isOwner), change });
	};

	async function load() {
		list.innerHTML = '<div class="empty">Wird geladen…</div>';
		let data;
		try {
			data = await adminApi('/api/admin/access');
		} catch (error) {
			list.textContent = error.message;
			return;
		}
		const fullRows = (data.users || [])
			.filter((user) => user.fullAdminAccess)
			.map((user) => ({
				user_id: user.userId,
				created_at: user.fullAdminGrantedAt,
				username: user.username,
				avatar: user.avatar,
			}));
		grantUsers = mergeGrantUsers(data.users || [], fullRows);
		grantFullRows = fullRows;
		renderGrants();
	}

	async function change(path, method, id = input.value.trim(), reload = true) {
		const admin = path.includes('/admin-panel-access') || path.includes('/full-admin');
		const target = admin ? adminStatus : status;
		const grant = method === 'POST';
		const label = LABELS[path] || 'Rechte';
		if (!DISCORD_ID.test(id)) {
			message(INVALID_ID, false, target);
			return;
		}
		try {
			await adminApi(path, method, { userId: id });
			message(label + (grant ? ' wurde freigegeben.' : ' wurde entfernt.'), grant, target);
			if (reload) {
				await load();
			}
		} catch (error) {
			message(error.message, false, target);
		}
	}

	async function changeMany(path, method, ids, target) {
		let failed = 0;
		for (const id of ids) {
			try {
				await adminApi(path, method, { userId: id });
			} catch {
				failed++;
			}
		}
		message(
			failed
				? ids.length - failed + ' von ' + ids.length + ' verarbeitet.'
				: ids.length + ' Freigaben verarbeitet.',
			failed === 0,
			target
		);
		await load();
	}

	// IDs in the list field win over the single ID field.
	const applyIdsOrSingle = (path, method, multiField, singleField, target) => {
		const ids = parseUserIds(multiField?.value);
		if (ids.length) {
			return changeMany(path, method, ids, target);
		}
		return DISCORD_ID.test(singleField.value.trim())
			? change(path, method, singleField.value.trim())
			: message(INVALID_ID, false, target);
	};

	const changeFullAdmin = (method) => () =>
		DISCORD_ID.test(adminInput.value.trim())
			? change('/api/admin/full-admin', method, adminInput.value.trim())
			: message(INVALID_ID, false, adminStatus);

	for (const [action, path, method] of ACCESS_ACTIONS) {
		document
			.querySelector(`[data-action="${action}"]`)
			.addEventListener('click', () => applyIdsOrSingle(path, method, multiUserIds, input, status));
	}
	for (const [action, path, method] of PANEL_ACTIONS) {
		document
			.querySelector(`[data-action="${action}"]`)
			.addEventListener('click', () =>
				applyIdsOrSingle(path, method, multiAdminUserIds, adminInput, adminStatus)
			);
	}
	fullButton.addEventListener('click', changeFullAdmin('POST'));
	fullRemoveButton.addEventListener('click', changeFullAdmin('DELETE'));
	document.querySelector('[data-action="remove"]').addEventListener('click', async () => {
		if (!DISCORD_ID.test(input.value.trim())) {
			message(INVALID_ID);
			return;
		}
		await change('/api/admin/all-access', 'DELETE');
	});
	permissionFilter.addEventListener('change', renderGrants);
	grantSort.addEventListener('change', renderGrants);
	document.getElementById('refresh').addEventListener('click', () => load());

	return {
		// Called once the login check knows the visitor.
		show(visitor) {
			me = visitor;
			if (visitor.user.fullAdmin) {
				fullButton.classList.remove('hidden');
				fullRemoveButton.classList.remove('hidden');
			}
		},
		load,
	};
}
