/* @file-notes: Einstiegspunkt des Workers: Routing, geplante Backups und Queue. */
import { createScheduledBackup } from './automatic-backup.js';
import { createRouter } from './router.js';
import { fallback, middleware, routes } from './routes.js';

export default {
	fetch: createRouter({ middleware, routes, fallback }),
	async scheduled(event, env, ctx) {
		try {
			await createScheduledBackup(env, new Date(event.scheduledTime || Date.now()));
		} catch (error) {
			console.error('Automatic backup failed', error);
		}
	},
	async queue(batch, env, ctx) {
		for (const message of batch.messages) {
			try {
				message.ack?.();
			} catch {
				message.retry?.({ delaySeconds: 10 });
			}
		}
	},
};
