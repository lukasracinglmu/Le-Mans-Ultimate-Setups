(() => {
	document.body.classList.add('no-database-access');
	const hide = () => {
		document
			.querySelectorAll(
				'#adminPanel,[id*="adminAccess"],.admin-panel,.request-section,#requestForm,#requestLoginRequired'
			)
			.forEach((el) => {
				const section = el.closest('.request-section') || el;
				section.classList.add('hidden');
			});
		const oldBug = [...document.querySelectorAll('button,a')].find(
			(el) => /bug melden/i.test((el.textContent || '').trim()) && !el.closest('#roleHeaderActions')
		);
		if (oldBug) oldBug.classList.add('hidden');
	};
	hide();
	fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
		.then((r) => r.json())
		.then((me) => {
			if (me?.loggedIn && me?.databaseAccess) document.body.classList.remove('no-database-access');
			else document.body.classList.add('no-database-access');
		})
		.catch(() => document.body.classList.add('no-database-access'));
	new MutationObserver(hide).observe(document.body, { childList: true, subtree: true });
})();
