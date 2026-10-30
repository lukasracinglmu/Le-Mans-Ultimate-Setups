/* @file-notes: Nimmt Bugmeldungen von Mitgliedern entgegen. */
import { submitBugReport } from '../bug-reports.js';
import { json } from '../lib/http.js';
import { hasSiteAccess, readMe } from './auth.js';

export async function bugReportsApi(request, env, ctx) {
	if (request.method !== 'POST')
		return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
	const me = await readMe(request, env, ctx);
	if (!hasSiteAccess(me))
		return json({ success: false, error: 'Keine Berechtigung.' }, 403, {
			'Cache-Control': 'no-store',
		});
	return submitBugReport(request, me.user, env);
}
