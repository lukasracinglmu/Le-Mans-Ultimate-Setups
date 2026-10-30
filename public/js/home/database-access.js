import { fetchMeResponse } from '../shared/session.js';
// The body class hides the filters until the database access is confirmed.
export function initDatabaseAccess() {
	document.body.classList.add('no-database-access');
	fetchMeResponse()
		.then((r) => r.json())
		.then((me) => {
			if (me?.loggedIn && me?.databaseAccess) document.body.classList.remove('no-database-access');
			else document.body.classList.add('no-database-access');
		})
		.catch(() => document.body.classList.add('no-database-access'));
}
