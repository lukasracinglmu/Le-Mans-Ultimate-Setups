/* @file-notes: Routing-Tabelle des Workers. Jede Route steht hier genau einmal. */
import { backupCompletionApi } from './automatic-backup.js';
import { ticketApi } from './bug-tickets.js';
import { catalogFile } from './features/catalog.js';
import { favoritesApi } from './features/favorites.js';
import {
	adminPage,
	bugReportPage,
	homePage,
	requestPage,
	retiredStrategyPage,
	ticketsPage,
} from './features/pages.js';
import {
	changeAdminPanelAccess,
	changeFullAdminAccess,
	changeManagedAccess,
	grantDatabaseAccess,
	listAdminPanelAccess,
	listCombinedAccess,
	listDatabaseAccess,
	revokeDatabaseAccess,
	withAccessSchema,
} from './features/access.js';
import { discordInteraction } from './features/discord-interactions.js';
import { manufacturerImage } from './features/manufacturer-images.js';
import { withPermissionAudit } from './features/permission-audit.js';
import { bugReportsApi } from './features/reports.js';
import { createWebsiteRequest, requestTracks } from './features/requests.js';
import { deleteSetup, updateSetupVersion, uploadSetups } from './features/setup-changes.js';
import { listSetups } from './features/setup-list.js';
import { fullAdminApi } from './full-admin.js';
import legacyWorker from './legacy.js';
import { catchErrors } from './lib/http.js';
import { maintenanceGate } from './middleware/maintenance.js';
import { enforceSameOriginForStateChange } from './middleware/origin.js';

// Runs before every route, in this order.
export const middleware = [enforceSameOriginForStateChange, maintenanceGate];

// The first matching route answers.
export const routes = [
	{ method: '*', path: '/api/internal/backups/complete', handler: backupCompletionApi },
	{
		method: '*',
		path: ['/strategy', '/strategy.html', '/strategy.js'],
		handler: retiredStrategyPage,
	},
	{ method: 'GET', path: '/bug-report', handler: bugReportPage },
	{ method: 'GET', path: '/request', handler: requestPage },
	{ method: 'GET', path: '/bug-tickets', handler: ticketsPage },
	{ method: 'GET', path: '/admin', handler: adminPage },
	{
		method: '*',
		path: [
			'/api/admin/full-admin',
			'/api/admin/maintenance',
			'/api/admin/backup',
			'/api/admin/backups',
		],
		handler: (request, env, ctx) => fullAdminApi(request, env, ctx, legacyWorker),
	},
	{ method: ['GET', 'POST', 'DELETE'], path: '/api/favorites', handler: favoritesApi },
	{ method: '*', path: '/api/bug-reports', handler: bugReportsApi },
	{
		method: '*',
		path: '/api/admin/bug-tickets*',
		handler: (request, env, ctx) => ticketApi(request, env, ctx, legacyWorker),
	},
	{ method: 'GET', path: '/setups.json', handler: catalogFile },
	{ method: 'GET', path: '/', handler: homePage },
	{
		method: 'GET',
		path: [
			'/assets/manufacturers/go-setups.webp',
			'/assets/manufacturers/hymo-setups.webp',
			'/assets/manufacturers/bealien.webp',
		],
		handler: manufacturerImage,
	},
	{ method: 'GET', path: '/api/request/tracks', handler: requestTracks },
	{ method: 'POST', path: '/api/request', handler: createWebsiteRequest },
	{ method: 'POST', path: '/interactions/discord', handler: discordInteraction },
	{
		method: 'GET',
		path: '/api/admin/admin-panel-access',
		handler: withAccessSchema(listAdminPanelAccess),
	},
	{
		method: ['POST', 'DELETE'],
		path: '/api/admin/admin-panel-access',
		handler: grantChange(changeAdminPanelAccess),
	},
	{
		method: ['POST', 'DELETE'],
		path: '/api/admin/full-admin-access',
		handler: grantChange(changeFullAdminAccess),
	},
	{
		method: 'GET',
		path: '/api/admin/database-access',
		handler: withAccessSchema(listDatabaseAccess),
	},
	{ method: 'POST', path: '/api/admin/database-access', handler: grantChange(grantDatabaseAccess) },
	{
		method: 'DELETE',
		path: '/api/admin/database-access',
		handler: grantChange(revokeDatabaseAccess),
	},
	{ method: 'GET', path: '/api/admin/access', handler: withAccessSchema(listCombinedAccess) },
	{
		method: ['POST', 'DELETE'],
		path: '/api/admin/upload-access',
		handler: grantChange((request, env, ctx) => changeManagedAccess(request, env, ctx, false)),
	},
	{
		method: ['POST', 'DELETE'],
		path: '/api/admin/all-access',
		handler: grantChange((request, env, ctx) => changeManagedAccess(request, env, ctx, true)),
	},
	{ method: 'GET', path: '/api/setups', handler: catchErrors(listSetups) },
	{ method: 'POST', path: '/api/setups/upload', handler: uploadSetups },
	{ method: 'POST', path: '/api/setups/version', handler: updateSetupVersion },
	{ method: 'POST', path: '/api/setups/delete', handler: deleteSetup },
];

// Grants and revokes are recorded in the audit log.
function grantChange(handler) {
	return withPermissionAudit(withAccessSchema(handler));
}

// Routes without an entry still pass the older worker (#10). Its admin APIs also need the
// grant tables.
const legacyAdmin = withAccessSchema((request, env, ctx) => legacyWorker.fetch(request, env, ctx));
export const fallback = (request, env, ctx) =>
	new URL(request.url).pathname.startsWith('/api/admin/')
		? legacyAdmin(request, env, ctx)
		: legacyWorker.fetch(request, env, ctx);
