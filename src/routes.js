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
import { PERMISSION_PATHS, auditPermissionChange } from './features/permission-audit.js';
import { bugReportsApi } from './features/reports.js';
import { fullAdminApi } from './full-admin.js';
import legacyWorker from './legacy.js';
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
	{ method: ['POST', 'DELETE'], path: PERMISSION_PATHS, handler: auditPermissionChange },
	{ method: 'GET', path: '/', handler: homePage },
];

// Routes without an entry still pass the older worker layers (#10).
export const fallback = (request, env, ctx) => legacyWorker.fetch(request, env, ctx);
