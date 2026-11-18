/* @file-notes: Routing-Tabelle des Workers. Jede Route steht hier genau einmal. */
import { backupCompletionApi } from './automatic-backup.js';
import { ticketApi } from './bug-tickets.js';
import { staticFile } from './features/assets.js';
import { currentUser, discordCallback, discordLogin, logout } from './features/auth.js';
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
	listUploadAccess,
	revokeDatabaseAccess,
	withAccessSchema,
} from './features/access.js';
import { discordRoleStatus, registerRequestCommand } from './features/discord-admin.js';
import {
	discordChannels,
	discordMessages,
	discordSendMessage,
} from './features/discord-channels.js';
import { discordInteraction } from './features/discord-interactions.js';
import { manufacturerImage } from './features/manufacturer-images.js';
import { withPermissionAudit } from './features/permission-audit.js';
import { bugReportsApi } from './features/reports.js';
import { createWebsiteRequest, requestTracks } from './features/requests.js';
import { deleteSetup, updateSetupVersion, uploadSetups } from './features/setup-changes.js';
import { downloadSetup, setupSummary } from './features/setup-files.js';
import { listSetups } from './features/setup-list.js';
import { fullAdminApi } from './full-admin.js';
import { calendarApi } from './features/calendar.js';
import { catchErrors } from './lib/http.js';
import { requireHttps } from './middleware/https.js';
import { maintenanceGate } from './middleware/maintenance.js';
import { enforceSameOriginForStateChange } from './middleware/origin.js';

// Runs before every route, in this order.
export const middleware = [enforceSameOriginForStateChange, maintenanceGate];

// Login and logout take the methods that staticFile() accepts; the others get its 405.
const BASE_METHODS = ['GET', 'HEAD', 'POST', 'DELETE'];

// The first matching route answers.
export const routes = [
	{ method: '*', path: '/api/internal/backups/complete', handler: backupCompletionApi },
	// Login and logout answer synchronously, so the former base worker caught their errors.
	// It also required HTTPS for every route that came from it.
	{ method: BASE_METHODS, path: '/auth/discord', handler: requireHttps(catchErrors(discordLogin)) },
	{ method: BASE_METHODS, path: '/auth/discord/callback', handler: requireHttps(discordCallback) },
	{ method: BASE_METHODS, path: '/auth/logout', handler: requireHttps(catchErrors(logout)) },
	{ method: 'GET', path: '/api/me', handler: requireHttps(currentUser) },
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
		handler: fullAdminApi,
	},
	{ method: ['GET', 'POST', 'DELETE'], path: '/api/favorites', handler: favoritesApi },
	{ method: '*', path: '/api/bug-reports', handler: bugReportsApi },
	{
		method: '*',
		path: '/api/admin/bug-tickets*',
		handler: ticketApi,
	},
	{ method: 'GET', path: '/setups.json', handler: catalogFile },
	{ method: 'GET', path: '/', handler: homePage },
	{ method: 'GET', path: ['/calendar','/calendar.html'], handler: (request, env, ctx) => staticPublic(request, env, ctx) },
	{ method: 'GET', path: ['/race', '/race.html'], handler: (request, env, ctx) => staticPublic(request, env, ctx) },
	{ method: 'GET', path: '/api/calendar', handler: calendarApi },
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
		handler: grantChange((request, env) => changeManagedAccess(request, env, false)),
	},
	{
		method: ['POST', 'DELETE'],
		path: '/api/admin/all-access',
		handler: grantChange((request, env) => changeManagedAccess(request, env, true)),
	},
	{ method: 'GET', path: '/api/admin/upload-access', handler: ownerTool(listUploadAccess) },
	{ method: 'GET', path: '/api/admin/discord/role-status', handler: ownerTool(discordRoleStatus) },
	{
		method: 'POST',
		path: '/api/admin/discord/register-request',
		handler: ownerTool(registerRequestCommand),
	},
	{ method: 'GET', path: '/api/discord/channels', handler: requireHttps(discordChannels) },
	{ method: 'GET', path: '/api/discord/messages', handler: requireHttps(discordMessages) },
	{ method: 'POST', path: '/api/discord/messages', handler: requireHttps(discordSendMessage) },
	{ method: 'GET', path: '/api/setups/summary', handler: requireHttps(setupSummary) },
	{ method: 'GET', path: '/api/setups', handler: requireHttps(catchErrors(listSetups)) },
	{ method: 'GET', path: '/api/setups/download', handler: requireHttps(downloadSetup) },
	// Upload and delete need no HTTPS check: readMe() treats plain HTTP as logged out.
	{ method: 'POST', path: '/api/setups/upload', handler: uploadSetups },
	{ method: 'POST', path: '/api/setups/version', handler: updateSetupVersion },
	{ method: 'POST', path: '/api/setups/delete', handler: deleteSetup },
];

// Grants and revokes are recorded in the audit log.
function grantChange(handler) {
	return withPermissionAudit(withAccessSchema(handler));
}

// Owner tools under /api/admin/ of the former base worker.
function ownerTool(handler) {
	return withAccessSchema(requireHttps(handler));
}

// Everything else is a deployed file. Paths under /api/admin/ still create the grant tables
// first, as every admin request did before (#8 removes this).
const staticPublic = requireHttps(catchErrors(staticFile));
const staticAdmin = withAccessSchema(staticPublic);
export const fallback = (request, env, ctx) =>
	new URL(request.url).pathname.startsWith('/api/admin/')
		? staticAdmin(request, env, ctx)
		: staticPublic(request, env, ctx);
