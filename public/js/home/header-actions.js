// Quick links in the header, depending on the permissions of the visitor.
export function initHeaderActions() {
	const header = document.querySelector('header');
	if (!header) return;
	const icons = {
		ticket:
			'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
		admin:
			'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
		bug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
		request:
			'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18v3h3l6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"/></svg>',
	};
	const group = document.createElement('nav');
	group.id = 'roleHeaderActions';
	group.setAttribute('aria-label', 'Schnellzugriff');
	header.appendChild(group);
	const add = (label, href, cls, icon) => {
		const a = document.createElement('a');
		a.href = href;
		a.className = cls;
		a.innerHTML = icons[icon] + '<span class="action-label">' + label + '</span>';
		group.appendChild(a);
		return a;
	};
	fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
		.then((r) => r.json())
		.then((me) => {
			if (!me?.loggedIn || !me?.databaseAccess) return;
			const user = me.user || {};
			if (user.canViewTickets) {
				const t = add('Tickets', '/bug-tickets', 'ticket-action', 'ticket'),
					count = document.createElement('span');
				count.id = 'privateTicketCount';
				count.textContent = '0';
				t.appendChild(count);
				const refresh = async () => {
					try {
						const [ro, rp] = await Promise.all([
							fetch('/api/admin/bug-tickets?status=open', {
								credentials: 'same-origin',
								cache: 'no-store',
							}),
							fetch('/api/admin/bug-tickets?status=progress', {
								credentials: 'same-origin',
								cache: 'no-store',
							}),
						]);
						const [od, pd] = await Promise.all([ro.json(), rp.json()]);
						if (!ro.ok || !rp.ok) return;
						const open = (od.tickets || []).length,
							progress = (pd.tickets || []).length,
							total = open + progress;
						count.textContent = total;
						t.classList.toggle('alert', open > 0);
						t.classList.toggle('in-progress', open === 0 && progress > 0);
					} catch {}
				};
				refresh();
				setInterval(refresh, 30000);
			}
			if (user.canViewAdminPanel) add('Admin Panel', '/admin', 'admin-action', 'admin');
			add('Setup Request', '/request', 'request-action', 'request');
			add('Bug melden', '/bug-report', 'bug-action', 'bug');
		})
		.catch(() => {});
}
