import { SESSION_COOKIE, createSession } from '../../src/lib/session.js';

// The session cookie the Discord login sets. Without a role snapshot in `extra` the worker
// asks Discord for the roles, except for the owner from DISCORD_OWNER_USER_ID.
export async function sessionCookie(id, secret, extra = {}) {
	const session = await createSession({ id, username: 'Test', exp: 4102444800, ...extra }, secret);
	return SESSION_COOKIE + '=' + session;
}
