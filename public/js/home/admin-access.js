(() => {
	let adminBusy = false;
	const escAdmin = (v) =>
		String(v ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	async function loadAdminAccessList() {
		const panel = document.getElementById('adminPanel'),
			list = document.getElementById('adminAccessList');
		if (!panel || !list) return;
		try {
			const me = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' }).then(
				(r) => r.json()
			);
			if (!me?.user?.isAdmin) {
				panel.classList.add('hidden');
				return;
			}
			panel.classList.remove('hidden');
			panel
				.querySelectorAll('[data-upload-admin]')
				.forEach((button) => button.classList.toggle('hidden', !me.user.canManageUploadAccess));
			panel
				.querySelectorAll('[data-full-admin]')
				.forEach((button) => button.classList.toggle('hidden', !me.user.canManageAdminAccess));
			const r = await fetch('/api/admin/access', { cache: 'no-store', credentials: 'same-origin' }),
				d = await r.json();
			if (!d.success) throw new Error(d.error || 'Fehler');
			list.innerHTML =
				(d.users || [])
					.map(
						(u) =>
							'<div style="display:flex;align-items:center;gap:12px;border:1px solid var(--border);border-radius:8px;padding:12px"><img src="' +
							escAdmin(u.avatar) +
							'" alt="" width="40" height="40" style="border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.src=\'https://cdn.discordapp.com/embed/avatars/0.png\'"><div style="min-width:0"><div style="font-weight:700">' +
							escAdmin(u.username) +
							'</div><div style="font-size:12px;color:var(--muted);margin-top:2px">' +
							escAdmin(u.userId) +
							'</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' +
							(u.permissions || [])
								.map((p) => {
									const classes = {
										FULL_ADMIN: 'full-admin-badge',
										ADMIN_PANEL: 'admin-badge',
										DATABASE: 'database-badge',
										UPLOAD: 'upload-badge',
									};
									return (
										'<span class="badge ' + (classes[p] || '') + '">' + escAdmin(p) + '</span>'
									);
								})
								.join('') +
							'</div></div></div>'
					)
					.join('') || '<div class="empty">Noch keine individuellen Freigaben.</div>';
		} catch (e) {
			list.textContent = e.message || 'Freigaben konnten nicht geladen werden.';
		}
	}
	async function mutate(url, method, userId) {
		if (adminBusy) return;
		adminBusy = true;
		const buttons = document.querySelectorAll('#adminPanel button');
		buttons.forEach((b) => (b.disabled = true));
		try {
			const r = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ userId }),
			});
			const d = await r.json().catch(() => ({}));
			if (!r.ok || !d.success) throw new Error(d.error || 'Fehler.');
			await loadAdminAccessList();
		} finally {
			adminBusy = false;
			buttons.forEach((b) => (b.disabled = false));
		}
	}
	window.adminSetFullAdminFromInput = async (grant) => {
		const id = document.getElementById('adminUserId')?.value.trim(),
			out = document.getElementById('adminResult');
		if (!id) {
			out.textContent = 'Discord User ID fehlt.';
			return;
		}
		try {
			await mutate('/api/admin/full-admin-access', grant ? 'POST' : 'DELETE', id);
			out.textContent = grant ? 'Full Admin freigegeben.' : 'Full Admin entfernt.';
		} catch (e) {
			out.textContent = e.message;
		}
	};
	window.adminSetAllFromInput = async (grant) => {
		const id = document.getElementById('adminUserId')?.value.trim(),
			out = document.getElementById('adminResult');
		if (!id) {
			out.textContent = 'Discord User ID fehlt.';
			return;
		}
		try {
			await mutate('/api/admin/all-access', grant ? 'POST' : 'DELETE', id);
			out.textContent = grant
				? 'Datenbank und Upload/Delete freigegeben.'
				: 'Alle persönlichen Freigaben entfernt. Discord-Rollen gelten weiterhin.';
		} catch (e) {
			out.textContent = e.message;
		}
	};
	window.adminSetDatabase = async (id, grant) => {
		try {
			await mutate('/api/admin/database-access', grant ? 'POST' : 'DELETE', id);
			const out = document.getElementById('adminResult');
			if (out) out.textContent = grant ? 'Datenbank freigegeben.' : 'Datenbank entfernt.';
		} catch (e) {
			const out = document.getElementById('adminResult');
			if (out) out.textContent = e.message;
		}
	};
	window.adminSetUpload = async (id, grant) => {
		try {
			await mutate('/api/admin/upload-access', grant ? 'POST' : 'DELETE', id);
		} catch (e) {
			const out = document.getElementById('adminResult');
			if (out) out.textContent = e.message;
		}
	};
	window.grantDatabaseAccess = async () => {
		const id = document.getElementById('adminUserId')?.value.trim();
		if (id) await window.adminSetDatabase(id, true);
	};
	window.revokeDatabaseAccess = async () => {
		const id = document.getElementById('adminUserId')?.value.trim();
		if (id) await window.adminSetDatabase(id, false);
	};
	window.grantUploadAccess = async () => {
		const id = document.getElementById('adminUserId')?.value.trim();
		if (id) await window.adminSetUpload(id, true);
	};
	window.revokeUploadAccess = async () => {
		const id = document.getElementById('adminUserId')?.value.trim();
		if (id) await window.adminSetUpload(id, false);
	};
	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', () => setTimeout(loadAdminAccessList, 0), {
			once: true,
		});
	else setTimeout(loadAdminAccessList, 0);
})();
