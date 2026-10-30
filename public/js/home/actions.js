// Classic script. Click handlers of the buttons with data-action, formerly
// onclick attributes. They look the functions up on click, like the attributes
// did, because admin-access.js replaces some of them after app.js.
/* global adminSetAllFromInput, adminSetFullAdminFromInput, grantDatabaseAccess, grantUploadAccess,
   logout, revokeDatabaseAccess, revokeUploadAccess, showHome, toggleTheme */
(() => {
	const actions = {
		logout: () => logout(),
		'toggle-theme': () => toggleTheme(),
		'grant-all': () => adminSetAllFromInput(true),
		'revoke-all': () => adminSetAllFromInput(false),
		'grant-full-admin': () => adminSetFullAdminFromInput(true),
		'revoke-full-admin': () => adminSetFullAdminFromInput(false),
		'grant-database': () => grantDatabaseAccess(),
		'revoke-database': () => revokeDatabaseAccess(),
		'grant-upload': () => grantUploadAccess(),
		'revoke-upload': () => revokeUploadAccess(),
		'show-home': () => showHome(),
	};
	for (const element of document.querySelectorAll('[data-action]')) {
		element.addEventListener('click', actions[element.dataset.action]);
	}
})();
