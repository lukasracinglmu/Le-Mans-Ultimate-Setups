const PERMISSION_FILTERS = new Map([
	['all', () => true],
	['full', (user) => user.isFull],
	['panel', (user) => user.adminPanelAccess],
	['database', (user) => user.databaseAccess],
	['upload', (user) => user.uploadAccess],
]);

const BADGES = [
	['isFull', 'FULL ADMIN', 'full-admin-badge'],
	['adminPanelAccess', 'ADMIN PANEL', 'admin-badge'],
	['databaseAccess', 'DATABASE', 'database-badge'],
	['uploadAccess', 'UPLOAD / DELETE', 'upload-badge'],
];

// SQLite timestamps are UTC. Missing dates stay at the bottom in both orders.
export function grantTime(value) {
	if (!value) {
		return null;
	}
	let text = String(value).trim().replace(' ', 'T');
	if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
		text += 'Z';
	}
	const time = Date.parse(text);
	return Number.isFinite(time) ? time : null;
}

export function latestGrantTime(user, fullGrant) {
	const times = [
		user.databaseGrantedAt,
		user.uploadGrantedAt,
		user.adminPanelGrantedAt,
		user.fullAdminGrantedAt,
		fullGrant?.created_at,
	]
		.map(grantTime)
		.filter((time) => time !== null);
	return times.length ? Math.max(...times) : null;
}

export function compareGrantUsers(a, b, order) {
	if (a.grantTime === null && b.grantTime !== null) {
		return 1;
	}
	if (b.grantTime === null && a.grantTime !== null) {
		return -1;
	}
	const difference = (a.grantTime ?? 0) - (b.grantTime ?? 0);
	if (!difference) {
		return String(a.userId).localeCompare(String(b.userId));
	}
	return order === 'oldest' ? difference : -difference;
}

export function formatGrantDate(time) {
	return time === null ? 'Nicht verfügbar' : new Date(time).toLocaleString('de-DE');
}

// Filter and order work on the loaded list; only "Aktualisieren" asks the server again.
export function selectGrantUsers(users, fullRows, permission, order) {
	const fullById = new Map(fullRows.map((row) => [String(row.user_id), row]));
	const full = new Set([
		...fullById.keys(),
		...users.filter((user) => user.fullAdminAccess).map((user) => String(user.userId)),
	]);
	return users
		.map((user) => ({
			...user,
			isFull: full.has(String(user.userId)),
			grantTime: latestGrantTime(user, fullById.get(String(user.userId))),
		}))
		.filter((user) => PERMISSION_FILTERS.get(permission)?.(user))
		.sort((a, b) => compareGrantUsers(a, b, order));
}

function defaultAvatar(userId) {
	return (
		'https://cdn.discordapp.com/embed/avatars/' +
		(Number(BigInt(String(userId)) >> 22n) % 6) +
		'.png'
	);
}

function displayName(username) {
	return username && username !== 'Full Admin' && username !== 'FULL ADMIN'
		? '@' + username.replace(/^@/, '')
		: 'Discord-Nutzer';
}

// `change(path, method, userId, reload)` grants or revokes a permission.
export function createGrantCard(user, { isOwner, change }) {
	const card = document.createElement('div');
	card.className = 'user';
	card.dataset.grantedAt = user.grantTime === null ? '' : new Date(user.grantTime).toISOString();
	const meta = document.createElement('div');
	meta.className = 'meta';
	const avatar = document.createElement('img');
	avatar.className = 'user-avatar';
	avatar.alt = '';
	avatar.src = user.avatar || defaultAvatar(user.userId);
	const userMain = document.createElement('div');
	userMain.className = 'user-main';
	const name = document.createElement('div');
	name.className = 'name';
	name.textContent = displayName(user.username);
	for (const [key, label, className] of BADGES) {
		if (!user[key]) {
			continue;
		}
		const badge = document.createElement('span');
		badge.className = 'badge ' + className;
		badge.textContent = label;
		name.appendChild(badge);
	}
	const details = document.createElement('div');
	details.className = 'details';
	details.textContent =
		'Discord-ID: ' + user.userId + ' · Letzte Freigabe: ' + formatGrantDate(user.grantTime);
	meta.append(userMain, details);
	userMain.append(avatar, name);

	const actions = document.createElement('div');
	actions.className = 'actions';
	const copy = document.createElement('button');
	copy.textContent = 'Discord ID kopieren';
	copy.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(user.userId);
			copy.textContent = 'Kopiert';
			setTimeout(() => (copy.textContent = 'Discord ID kopieren'), 1200);
		} catch {}
	});
	actions.append(copy);
	if (isOwner && user.isFull) {
		const revoke = document.createElement('button');
		revoke.className = 'danger';
		revoke.textContent = 'Full Admin entfernen';
		revoke.addEventListener('click', () => change('/api/admin/full-admin', 'DELETE', user.userId));
		actions.append(revoke);
	}
	const remove = document.createElement('button');
	remove.className = 'danger';
	remove.textContent = 'Alles entfernen';
	remove.addEventListener('click', async () => {
		if (isOwner && user.isFull) {
			await change('/api/admin/full-admin', 'DELETE', user.userId, false);
		}
		await change('/api/admin/all-access', 'DELETE', user.userId);
	});
	actions.append(remove);
	card.append(meta, actions);
	return card;
}

export function renderGrantList(list, users, options) {
	if (!users.length) {
		list.innerHTML = '<div class="empty">Keine persönlichen Freigaben vorhanden.</div>';
		return;
	}
	list.innerHTML = '';
	for (const user of users) {
		list.append(createGrantCard(user, options));
	}
}
