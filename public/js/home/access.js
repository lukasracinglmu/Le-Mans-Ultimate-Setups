import { fetchMeResponse } from '../shared/session.js';
import { state } from './state.js';

export function logout() {
	location.href = '/auth/logout';
}

function accessBox() {
	let box = document.getElementById('databaseAccessState');
	if (!box) {
		box = document.createElement('section');
		box.id = 'databaseAccessState';
		box.className = 'database-access-state';
		const main = document.querySelector('.layout>main');
		main?.prepend(box);
	}
	return box;
}

const setLoginControls = (visible) =>
	document
		.querySelectorAll('.login-only-control')
		.forEach((el) => el.classList.toggle('hidden', !visible));

// Checks the login and the Discord roles. onAuthorized loads the database once access
// is confirmed; errors there show the "unavailable" notice like a failed check.
export function createAccessCheck({ onAuthorized }) {
	const showAccessState = (mode, user) => {
		const box = accessBox();
		if (!box) return;
		document.documentElement.dataset.dbAccess = mode;
		if (mode === 'authorized') {
			box.remove();
			return;
		}
		const login = document.getElementById('loginButton');
		if (mode === 'checking') {
			box.innerHTML = '<h2>Setup Database</h2><p>Zugriff wird geprüft…</p>';
			return;
		}
		if (mode === 'login') {
			box.innerHTML =
				'<h2>Setup Database</h2><p>Melde dich mit Discord an, um auf die Setup Database zuzugreifen.</p><a class="discord-button" href="/auth/discord">Mit Discord anmelden</a>';
			if (login) login.classList.remove('hidden');
			return;
		}
		if (mode === 'reauthorize') {
			box.innerHTML =
				'<h2>Discord-Zugriff erneuern</h2><p>Bitte melde dich erneut mit Discord an und erlaube das Lesen deiner Server-Mitgliedschaft. Danach werden deine Rollen automatisch übernommen.</p><a class="discord-button" href="/auth/discord">Mit Discord erneut anmelden</a>';
			return;
		}
		if (mode === 'unavailable') {
			box.innerHTML =
				'<h2>Rollenprüfung momentan nicht verfügbar</h2><p>Discord konnte gerade nicht erreicht werden. Dein Zugriff wurde deshalb noch nicht bestätigt. Bitte versuche es erneut.</p><button type="button" id="retryRoleCheck">Erneut prüfen</button>';
			document.getElementById('retryRoleCheck').addEventListener('click', () => authorize(true));
			return;
		}
		box.innerHTML =
			'<h2>Setup Database</h2><p>Du hast aktuell nicht die erforderliche Discord-Rolle für den Zugriff auf die Setup Database.</p>';
	};

	const authorize = async (forceRefresh = false) => {
		setLoginControls(false);
		showAccessState('checking');
		try {
			let d = null,
				responseOk = false;
			for (let attempt = 0; attempt < 3; attempt++) {
				const r = await fetchMeResponse(forceRefresh || attempt > 0);
				d = await r.json().catch(() => null);
				responseOk = r.ok && typeof d?.loggedIn === 'boolean';
				if (responseOk && (!d.loggedIn || d.databaseAccess || d.rolesAvailable !== false)) break;
				if (d?.roleCheckError === 'RATE_LIMITED') break;
				if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
			}
			if (!responseOk) {
				showAccessState('unavailable');
				return;
			}
			if (!d?.loggedIn) {
				state.currentUser = null;
				setLoginControls(false);
				showAccessState('login');
				return;
			}
			state.currentUser = d.user || null;
			setLoginControls(true);
			const login = document.getElementById('loginButton');
			const account = document.getElementById('account');
			const accountName = document.getElementById('accountName');
			const accountAvatar = document.getElementById('accountAvatar');
			if (login) login.classList.add('hidden');
			if (account) account.style.display = 'flex';
			if (accountName) accountName.textContent = d.user?.username || '';
			if (accountAvatar && d.user?.avatar) {
				accountAvatar.src = d.user.avatar;
				accountAvatar.style.display = 'block';
			}
			if (!d.databaseAccess) {
				showAccessState(
					d.rolesAvailable === false
						? d.reauthorize
							? 'reauthorize'
							: 'unavailable'
						: 'forbidden',
					d.user
				);
				return;
			}
			showAccessState('authorized', d.user);
			await onAuthorized();
		} catch {
			setLoginControls(false);
			showAccessState('unavailable');
		}
	};

	return authorize;
}
