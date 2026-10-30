/* @file-notes: Discord-Anmeldung, Abmeldung und das Profil des Besuchers mit seinen Rechten. */
import { ownerUserId } from '../config.js';
import { resolvePermissions } from '../discord-permissions.js';
import { DISCORD_API } from '../lib/discord.js';
import { json, securityHeaders } from '../lib/http.js';
import {
	SESSION_COOKIE,
	SESSION_TTL,
	STATE_COOKIE,
	cookie,
	createSession,
	parseCookies,
	readSession,
} from '../lib/session.js';
import { isHttpsRequest } from '../middleware/https.js';

const DISCORD_OAUTH = 'https://discord.com/oauth2';

function redirectUri(env) {
	return `${env.SITE_URL}/auth/discord/callback`;
}
export function discordLogin(request, env) {
	if (!env.DISCORD_CLIENT_ID || !env.SITE_URL)
		return json({ success: false, error: 'Discord Login nicht verfügbar.' }, 500);
	const state = crypto.randomUUID();
	const p = new URLSearchParams({
		client_id: env.DISCORD_CLIENT_ID,
		response_type: 'code',
		redirect_uri: redirectUri(env),
		scope: 'identify guilds.members.read',
		state,
	});
	const h = securityHeaders(new Headers({ Location: `${DISCORD_OAUTH}/authorize?${p}` }));
	h.append('Set-Cookie', cookie(STATE_COOKIE, state, 600));
	return new Response(null, { status: 302, headers: h });
}

export async function discordCallback(request, env) {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const retState = url.searchParams.get('state');
	if (url.searchParams.get('error'))
		return new Response('Discord-Anmeldung abgebrochen.', {
			status: 400,
			headers: securityHeaders(),
		});
	const cookies = parseCookies(request.headers.get('Cookie') || '');
	if (!code || !retState || cookies[STATE_COOKIE] !== retState)
		return new Response('Ungültige Anmeldung.', { status: 400, headers: securityHeaders() });
	if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET)
		return new Response('Nicht konfiguriert.', { status: 500, headers: securityHeaders() });
	const tr = await fetch(`${DISCORD_API}/oauth2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.DISCORD_CLIENT_ID,
			client_secret: env.DISCORD_CLIENT_SECRET,
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri(env),
		}),
	});
	if (!tr.ok)
		return new Response('Discord-Anmeldung fehlgeschlagen.', {
			status: 502,
			headers: securityHeaders(),
		});
	const td = await tr.json();
	const ur = await fetch(`${DISCORD_API}/users/@me`, {
		headers: { Authorization: `Bearer ${td.access_token}` },
	});
	if (!ur.ok)
		return new Response('Discord-Anmeldung fehlgeschlagen.', {
			status: 502,
			headers: securityHeaders(),
		});
	const user = await ur.json();
	const sess = await createSession(
		{
			id: user.id,
			username: user.global_name || user.username,
			avatar: user.avatar || null,
			accessToken: td.access_token,
			exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
		},
		env.SESSION_SECRET
	);
	const appUrl = new URL('/', env.SITE_URL).toString();
	const h = securityHeaders(
		new Headers({ 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' })
	);
	h.append('Set-Cookie', cookie(SESSION_COOKIE, sess, SESSION_TTL));
	h.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
	const target = JSON.stringify(appUrl);
	const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Anmeldung abgeschlossen</title></head><body><script>window.location.replace(${target});</script><noscript><meta http-equiv="refresh" content="0;url=${appUrl}"></noscript></body></html>`;
	return new Response(html, { status: 200, headers: h });
}

export function logout() {
	const h = securityHeaders(new Headers({ Location: '/' }));
	h.append('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
	return new Response(null, { status: 302, headers: h });
}

// The profile together with the session and the Discord role snapshot it was built from.
// `refresh` asks Discord again instead of trusting the snapshot in the session.
async function readProfile(request, env, refresh) {
	const session = await readSession(request, env.SESSION_SECRET);
	if (!session) return { me: { loggedIn: false, databaseAccess: false } };
	const permission = await resolvePermissions(
		session.id,
		env,
		session.accessToken,
		refresh ? null : session.memberSnapshot
	);
	const avatar = session.avatar
		? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=64`
		: `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(session.id) % 6n)}.png`;
	const {
		databaseAccess,
		rolesAvailable,
		memberSnapshot,
		roleSource,
		roleCheckError,
		reauthorize,
		retryAfterMs,
		...userPermissions
	} = permission;
	return {
		session,
		memberSnapshot,
		me: {
			loggedIn: true,
			databaseAccess,
			rolesAvailable,
			roleSource,
			roleCheckError,
			reauthorize,
			retryAfterMs,
			user: { id: session.id, username: session.username, avatar, ...userPermissions },
		},
	};
}

// GET /api/me. A changed role snapshot goes back into the session cookie.
export async function currentUser(request, env) {
	const refresh = new URL(request.url).searchParams.get('refresh') === '1';
	const { session, memberSnapshot, me } = await readProfile(request, env, refresh);
	const response = json(me);
	if (memberSnapshot && memberSnapshot !== session.memberSnapshot) {
		const signed = await createSession({ ...session, memberSnapshot }, env.SESSION_SECRET);
		response.headers.append(
			'Set-Cookie',
			cookie(SESSION_COOKIE, signed, Math.max(1, session.exp - Math.floor(Date.now() / 1000)))
		);
	}
	return response;
}

// The profile of /api/me for the other routes, without the refreshed session cookie.
// Plain HTTP counts as logged out, as it did when this was an internal request (#10).
export async function readMe(request, env, { refresh = false } = {}) {
	if (!isHttpsRequest(request)) return null;
	return (await readProfile(request, env, refresh)).me;
}

// Only the owner from DISCORD_OWNER_USER_ID, judged by the session alone.
export async function requireOwnerSession(request, env) {
	const session = await readSession(request, env.SESSION_SECRET);
	if (!session) return { error: json({ success: false, error: 'Nicht angemeldet.' }, 401) };
	if (session.id !== ownerUserId(env))
		return { error: json({ success: false, error: 'Keine Admin-Berechtigung.' }, 403) };
	return { session };
}

export function hasSiteAccess(me) {
	return Boolean(me?.loggedIn && me?.databaseAccess && me?.user?.id);
}
