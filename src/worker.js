import { REQUEST_MANUFACTURERS } from '../discord-presence/request-manufacturers.js';
import { buildSetupSummary } from './setup-summary.js';
/* @file-notes: Basis-Worker für Authentifizierung, Discord-Login, Setup-APIs und grundlegende Website-Funktionen. */
import { cleanSetupFileName } from './setup-version.js';
import { githubBranch, ownerUserId } from './config.js';
import { githubRequest } from './lib/github.js';
import { json, securityHeaders, withSecurityHeaders } from './lib/http.js';
import { resolvePermissions, rolePermissions } from './discord-permissions.js';
import { readPreviousSetups, deleteGithubSetup } from './setup-lifecycle.js';
import { readRepoFile } from './repo-read.js';
import { persistSetupFile, readUploadForm } from './upload-storage.js';

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_OAUTH = 'https://discord.com/oauth2';
const SESSION_COOKIE = 'lmu_session';
const STATE_COOKIE = 'lmu_oauth_state';
const SESSION_TTL = 604800;
const MAX_FILES = 50;
const MAX_SETUP_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BODY_BYTES = 26 * 1024 * 1024;
const DISCORD_TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);
const DISCORD_DISPLAY_CHANNEL_TYPES = new Set([0, 2, 4, 5, 10, 11, 12, 13, 15]);
const PERM_VIEW_CHANNEL = 1024n;
const PERM_SEND_MESSAGES = 2048n;
const PERM_ADMINISTRATOR = 8n;

export default {
	async fetch(request, env, ctx, uploadForm) {
		try {
			if (!isHttpsRequest(request))
				return json({ success: false, error: 'HTTPS erforderlich.' }, 400);
			const originError = enforceSameOriginForStateChange(request, env);
			if (originError) return originError;

			const url = new URL(request.url);
			const p = url.pathname;
			const m = request.method;
			if (m !== 'GET' && m !== 'HEAD' && m !== 'POST' && m !== 'DELETE')
				return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);

			if (p === '/auth/discord') return discordLogin(env);
			if (p === '/auth/discord/callback') return discordCallback(request, env);
			if (p === '/auth/logout') return logout();

			if (p === '/api/me' && m === 'GET') return currentUser(request, env);
			if (p === '/api/admin/discord/role-status' && m === 'GET')
				return discordRoleStatus(request, env);
			if (p === '/api/setups/summary' && m === 'GET') return setupSummary(request, env);
			if (p === '/api/setups' && m === 'GET') return listSetups(request, env);
			if (p === '/api/setups/download' && m === 'GET') return downloadSetup(request, env);
			if (p === '/api/setups/upload' && m === 'POST') return uploadSetups(request, env, uploadForm);
			if (p === '/api/setups/delete' && m === 'POST') return deleteSetup(request, env);

			if (p === '/api/admin/upload-access' && m === 'GET') return listUploadAccess(request, env);
			if (p === '/api/admin/discord/register-request' && m === 'POST')
				return registerRequestCommand(request, env);
			if (p === '/api/discord/channels' && m === 'GET') return discordChannels(request, env);
			if (p === '/api/discord/messages' && m === 'GET') return discordMessages(request, env);
			if (p === '/api/discord/messages' && m === 'POST') return discordSendMessage(request, env);

			return withSecurityHeaders(await env.ASSETS.fetch(request));
		} catch (e) {
			console.error('Worker error', safeError(e));
			return json({ success: false, error: 'Interner Serverfehler.' }, 500);
		}
	},
};

function isHttpsRequest(request) {
	const url = new URL(request.url);
	if (url.protocol === 'https:') return true;
	return request.headers.get('X-Forwarded-Proto') === 'https';
}

export function enforceSameOriginForStateChange(request, env) {
	const method = request.method.toUpperCase();
	if (!new Set(['POST', 'PUT', 'PATCH', 'DELETE']).has(method)) return null;
	const url = new URL(request.url);
	if (url.pathname === '/interactions/discord') return null;
	const allowedOrigins = new Set([url.origin]);
	try {
		if (env.SITE_URL) allowedOrigins.add(new URL(env.SITE_URL).origin);
	} catch {}
	const origin = request.headers.get('Origin');
	if (origin && !allowedOrigins.has(origin))
		return json({ success: false, error: 'Origin nicht erlaubt.' }, 403);
	const referer = request.headers.get('Referer');
	if (!origin && referer) {
		try {
			if (!allowedOrigins.has(new URL(referer).origin))
				return json({ success: false, error: 'Origin nicht erlaubt.' }, 403);
		} catch {
			return json({ success: false, error: 'Origin nicht erlaubt.' }, 403);
		}
	}
	return null;
}

function validateRequestSize(request, max = MAX_REQUEST_BODY_BYTES) {
	const len = Number(request.headers.get('Content-Length') || 0);
	return Number.isFinite(len) && len > max
		? json({ success: false, error: 'Request zu groß.' }, 413)
		: null;
}
function safeError(error) {
	if (!error) return 'unknown';
	return error instanceof Error ? error.name || 'Error' : 'unknown';
}
function redirectUri(env) {
	return `${env.SITE_URL}/auth/discord/callback`;
}
function discordLogin(env) {
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

async function discordCallback(request, env) {
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
	const tr = await df('/oauth2/token', {
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
	const ur = await df('/users/@me', { headers: { Authorization: `Bearer ${td.access_token}` } });
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

async function fetchGuildMember(userId, env) {
	if (!userId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
		return { ok: false, status: 503, member: null };
	const r = await df(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, {
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
	});
	if (r.status === 404) return { ok: true, status: 404, member: null };
	if (!r.ok) return { ok: false, status: r.status, member: null };
	return { ok: true, status: 200, member: await r.json() };
}
async function requireDatabaseAccess(request, env) {
	const session = await readSession(request, env.SESSION_SECRET);
	if (!session) return { error: json({ success: false, error: 'Nicht angemeldet.' }, 401) };
	const permission = await resolvePermissions(
		session.id,
		env,
		session.accessToken,
		session.memberSnapshot
	);
	if (!permission.databaseAccess)
		return {
			error: json(
				{
					success: false,
					error: permission.rolesAvailable
						? 'Erforderliche Discord-Rolle fehlt.'
						: 'Discord-Rollenprüfung nicht verfügbar.',
				},
				permission.rolesAvailable ? 403 : 503
			),
		};
	return { session };
}

async function currentUser(request, env) {
	const session = await readSession(request, env.SESSION_SECRET);
	if (!session) return json({ loggedIn: false, databaseAccess: false });
	const forceRefresh = new URL(request.url).searchParams.get('refresh') === '1';
	const permission = await resolvePermissions(
		session.id,
		env,
		session.accessToken,
		forceRefresh ? null : session.memberSnapshot
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
	const response = json({
		loggedIn: true,
		databaseAccess,
		rolesAvailable,
		roleSource,
		roleCheckError,
		reauthorize,
		retryAfterMs,
		user: { id: session.id, username: session.username, avatar, ...userPermissions },
	});
	if (memberSnapshot && memberSnapshot !== session.memberSnapshot) {
		const signed = await createSession({ ...session, memberSnapshot }, env.SESSION_SECRET);
		response.headers.append(
			'Set-Cookie',
			cookie(SESSION_COOKIE, signed, Math.max(1, session.exp - Math.floor(Date.now() / 1000)))
		);
	}
	return response;
}

async function requireOwner(request, env) {
	const session = await readSession(request, env.SESSION_SECRET);
	if (!session) return { error: json({ success: false, error: 'Nicht angemeldet.' }, 401) };
	if (session.id !== ownerUserId(env))
		return { error: json({ success: false, error: 'Keine Admin-Berechtigung.' }, 403) };
	return { session };
}

// Owner-only diagnostics: inspect Discord responses without returning credentials.
async function discordRoleStatus(request, env) {
	const auth = await requireOwner(request, env);
	if (auth.error) return auth.error;
	const targetId = new URL(request.url).searchParams.get('userId') || auth.session.id;
	if (!/^\d{16,22}$/.test(targetId))
		return json({ success: false, error: 'Ungültige Discord User ID.' }, 400);
	const probe = async (path) => {
		if (!env.DISCORD_BOT_TOKEN) return { status: 0, code: 'BOT_TOKEN_MISSING', data: null };
		try {
			const r = await fetch(DISCORD_API + path, {
				headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
				signal: AbortSignal.timeout(8000),
			});
			const data = await r.json().catch(() => null);
			return {
				status: r.status,
				code: r.ok ? null : data?.code || 'DISCORD_ERROR',
				data: r.ok ? data : null,
			};
		} catch {
			return { status: 0, code: 'DISCORD_UNAVAILABLE', data: null };
		}
	};
	const [identity, guildRoles, member] = await Promise.all([
		probe('/users/@me'),
		probe('/guilds/' + encodeURIComponent(env.DISCORD_GUILD_ID || '') + '/roles'),
		probe(
			'/guilds/' +
				encodeURIComponent(env.DISCORD_GUILD_ID || '') +
				'/members/' +
				encodeURIComponent(targetId)
		),
	]);
	const configured = {
		team: env.DISCORD_DATABASE_ROLE_ID,
		setupSupply: env.DISCORD_UPLOAD_ROLE_ID || env.DISCORD_ROLE_ID,
		owner: env.DISCORD_OWNER_ROLE_ID,
	};
	const roles = Array.isArray(guildRoles.data) ? guildRoles.data : [];
	const memberRoles = Array.isArray(member.data?.roles) ? member.data.roles : [];
	return json({
		success: true,
		bot: {
			status: identity.status,
			code: identity.code,
			applicationMatches: identity.data
				? String(identity.data.id) === String(env.DISCORD_CLIENT_ID)
				: null,
		},
		guild: { status: guildRoles.status, code: guildRoles.code, id: env.DISCORD_GUILD_ID },
		configuredRoles: Object.fromEntries(
			Object.entries(configured).map(([key, id]) => [
				key,
				{
					id,
					exists: roles.some((role) => role.id === id),
					name: roles.find((role) => role.id === id)?.name || null,
				},
			])
		),
		member: { userId: targetId, status: member.status, code: member.code, roles: memberRoles },
		withoutManualGrants: member.status === 200 ? rolePermissions(targetId, memberRoles, env) : null,
		session: {
			memberScopeRequested: 'guilds.members.read',
			hasMemberToken: Boolean(auth.session.accessToken),
		},
	});
}

async function listUploadAccess(request, env) {
	const auth = await requireOwner(request, env);
	if (auth.error) return auth.error;
	if (!env.ACCESS_DB)
		return json({ success: false, error: 'Rechte-Datenbank nicht konfiguriert.' }, 503);
	const result = await env.ACCESS_DB.prepare(
		'SELECT user_id, granted_by, created_at FROM upload_access ORDER BY created_at DESC'
	).all();
	return json({ success: true, grants: result.results || [] });
}
function safe(v) {
	return String(v || '')
		.trim()
		.replace(/[/\\]+/g, '')
		.replace(/\.\./g, '')
		.replace(/[\u0000-\u001F\u007F]/g, '');
}
function zipOk(file) {
	return (
		file instanceof File &&
		/\.zip$/i.test(file.name) &&
		file.size > 0 &&
		file.size <= MAX_SETUP_BYTES
	);
}
function normalizeName(name) {
	return safe(String(name || '').slice(0, 180));
}
function clean(v, max = 1000) {
	return String(v || '')
		.replace(/[\u0000-\u001F\u007F]/g, ' ')
		.trim()
		.slice(0, max);
}
function classifySetup(name, vehicle) {
	const file = String(name || ''),
		v = String(vehicle || '');
	const variant = /(^|[^a-z0-9])evo([^a-z0-9]|$)/i.test(file) ? 'EVO' : 'Standard';
	let series = null;
	if (/oreca\s*0?7/i.test(v)) {
		if (/(^|[^a-z0-9])elms([^a-z0-9]|$)/i.test(file)) series = 'ELMS';
		else if (/(^|[^a-z0-9])wec([^a-z0-9]|$)/i.test(file)) series = 'WEC';
		else series = 'Other';
	}
	return { variant, series };
}
async function setupSummary(request, env) {
	const auth = await requireDatabaseAccess(request, env);
	if (auth.error) return auth.error;
	try {
		const response = await githubRequest(
			env,
			'/git/trees/' + encodeURIComponent(githubBranch(env)) + '?recursive=1',
			{ redirect: 'manual', signal: AbortSignal.timeout(15000) }
		);
		if (!response.ok)
			return json({ success: false, error: 'Setup-Zahlen konnten nicht geladen werden.' }, 502);
		const vehicles = buildSetupSummary(await response.json());
		return json({ success: true, complete: true, vehicles });
	} catch {
		return json({ success: false, error: 'Setup-Zahlen momentan nicht verfügbar.' }, 502);
	}
}
async function listSetups(request, env) {
	const a = await requireDatabaseAccess(request, env);
	if (a.error) return a.error;
	const u = new URL(request.url),
		cat = safe(u.searchParams.get('category')),
		veh = safe(u.searchParams.get('vehicle'));
	if (!cat || !veh) return json({ success: false, error: 'Fahrzeug fehlt.' }, 400);
	const path = `/contents/setups/${encodeURIComponent(cat)}/${encodeURIComponent(veh)}?ref=${encodeURIComponent(githubBranch(env))}`;
	const r = await githubRequest(env, path, {});
	if (r.status === 404) return json({ success: true, setups: [] });
	if (!r.ok) return json({ success: false, error: 'Setups konnten nicht geladen werden.' }, 502);
	const items = await r.json();
	const setups = (Array.isArray(items) ? items : [])
		.filter((i) => i.type === 'file' && /\.zip$/i.test(i.name))
		.map((i) => ({
			name: i.name,
			sha: i.sha,
			download: `/api/setups/download?category=${encodeURIComponent(cat)}&vehicle=${encodeURIComponent(veh)}&name=${encodeURIComponent(i.name)}`,
			...classifySetup(i.name, veh),
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' }));
	return json({ success: true, setups });
}
async function downloadSetup(request, env) {
	const auth = await requireDatabaseAccess(request, env);
	if (auth.error) return auth.error;
	const u = new URL(request.url),
		cat = safe(u.searchParams.get('category')),
		veh = safe(u.searchParams.get('vehicle')),
		name = safe(u.searchParams.get('name'));
	if (!cat || !veh || !name || !/\.zip$/i.test(name))
		return json({ success: false, error: 'Ungültiger Download.' }, 400);
	const raw = await readRepoFile(env, `setups/${cat}/${veh}/${name}`);
	if (raw.status === 404) return json({ success: false, error: 'Setup nicht gefunden.' }, 404);
	if (!raw.ok) return json({ success: false, error: 'Download fehlgeschlagen.' }, 502);
	const h = securityHeaders(new Headers(raw.headers));
	h.set('Content-Type', 'application/zip');
	h.set(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(cleanSetupFileName(name))}`
	);
	h.set('Cache-Control', 'private, no-store');
	return new Response(raw.body, { status: 200, headers: h });
}
async function uploadSetups(request, env, suppliedForm) {
	const sizeError = validateRequestSize(request);
	if (sizeError) return sizeError;
	const session = await readSession(request, env.SESSION_SECRET);
	if (!session) return json({ success: false, error: 'Nicht angemeldet.' }, 401);
	const permission = await resolvePermissions(session.id, env, session.accessToken);
	if (!permission.canUpload)
		return json(
			{
				success: false,
				error: permission.rolesAvailable
					? 'Keine Upload-Berechtigung.'
					: 'Discord-Rollenprüfung nicht verfügbar.',
				retryable: !permission.rolesAvailable,
			},
			permission.rolesAvailable ? 403 : 503
		);
	let form;
	try {
		form = suppliedForm || (await readUploadForm(request));
	} catch (error) {
		return json(
			{
				success: false,
				error: error.status === 413 ? 'Request zu groß.' : 'Ungültiger Upload.',
				retryable: false,
			},
			error.status === 413 ? 413 : 400
		);
	}
	const category = safe(form.get('category')),
		vehicle = safe(form.get('vehicle')),
		files = form.getAll('files');
	if (!category || !vehicle || !files.length || files.length > MAX_FILES)
		return json({ success: false, error: 'Ungültiger Upload.', retryable: false }, 400);
	const previous = readPreviousSetups(
		form,
		files.map((file) => normalizeName(file?.name))
	);
	if (previous.error) return json({ success: false, error: previous.error, retryable: false }, 400);
	const uploaded = [],
		errors = [];
	for (const file of files) {
		const name = previous.duplicateOf?.name || normalizeName(file?.name),
			originalName = String(file?.name || 'Unbekannt');
		if (!zipOk(file) || !name) {
			errors.push({
				name: name || originalName,
				originalName,
				error: 'Ungültige ZIP-Datei.',
				retryable: false,
			});
			continue;
		}
		const result = await persistSetupFile({
			file,
			name,
			category,
			vehicle,
			branch: githubBranch(env),
			replaceSha:
				previous.action === 'replace'
					? previous.targets.find((target) => target.name === name)?.sha
					: undefined,
			expectedFileSha: previous.duplicateOf?.sha,
			forcePreserve: previous.action === 'outdate' || previous.action === 'delete',
			preserveSha:
				previous.action !== 'replace'
					? previous.targets.find((target) => target.name === name)?.sha
					: undefined,
			version: String(form.get('version') || ''),
			githubRequest: (path, options) => githubRequest(env, path, options),
		});
		if (result.uploaded)
			uploaded.push({
				name: result.name || name,
				originalName,
				sha: result.sha,
				alreadyExists: result.alreadyExists,
			});
		else errors.push({ name, originalName, ...result });
	}
	const retryable = errors.some((error) => error.retryable),
		retryAfterMs = Math.max(0, ...errors.map((error) => error.retryAfterMs || 0));
	const response = json(
		{ success: uploaded.length > 0, uploaded, errors, retryable, retryAfterMs },
		uploaded.length
			? 200
			: retryable
				? 503
				: errors.some((error) => error.code === 'FILE_CONFLICT')
					? 409
					: 400
	);
	if (retryAfterMs) response.headers.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
	return response;
}

async function deleteSetup(request, env) {
	const s = await readSession(request, env.SESSION_SECRET);
	if (!s) return json({ success: false, error: 'Nicht angemeldet.' }, 401);
	const permission = await resolvePermissions(s.id, env, s.accessToken);
	if (!permission.canUpload)
		return json(
			{
				success: false,
				error: permission.rolesAvailable
					? 'Keine Löschberechtigung.'
					: 'Discord-Rollenprüfung nicht verfügbar.',
			},
			permission.rolesAvailable ? 403 : 503
		);
	let b;
	try {
		b = await request.json();
	} catch {
		return json({ success: false, error: 'Ungültige Anfrage.' }, 400);
	}
	const cat = safe(b.category),
		veh = safe(b.vehicle),
		name = safe(b.name);
	if (!cat || !veh || !name || !/\.zip$/i.test(name))
		return json({ success: false, error: 'Ungültige Datei.' }, 400);
	if (b.sha !== undefined && !/^[a-f0-9]{40}$/.test(b.sha))
		return json({ success: false, error: 'Ungültiger Dateistand.', retryable: false }, 400);
	const result = await deleteGithubSetup({
		category: cat,
		vehicle: veh,
		name,
		expectedSha: b.sha,
		branch: githubBranch(env),
		githubRequest: (path, options) => githubRequest(env, path, options),
	});
	return json(result, result.success ? 200 : result.status || 502);
}

async function discordChannels(request, env) {
	const s = await readSession(request, env.SESSION_SECRET);
	if (!s) return json({ success: false, error: 'Nicht angemeldet.' }, 401);
	const channels = await df(`/guilds/${env.DISCORD_GUILD_ID}/channels`, {
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
	});
	if (!channels.ok)
		return json({ success: false, error: 'Channels konnten nicht geladen werden.' }, 502);
	const member = await fetchGuildMember(s.id, env);
	if (!member.ok || !member.member) return json({ success: true, channels: [] });
	const roles = await df(`/guilds/${env.DISCORD_GUILD_ID}/roles`, {
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
	});
	if (!roles.ok)
		return json({ success: false, error: 'Rollen konnten nicht geladen werden.' }, 502);
	const rs = await roles.json();
	const roleMap = new Map(rs.map((r) => [r.id, BigInt(r.permissions || '0')]));
	const guildPerm = computeGuildPermissions(member.member, roleMap, env.DISCORD_GUILD_ID);
	const all = await channels.json();
	const visible = all.filter(
		(c) =>
			DISCORD_DISPLAY_CHANNEL_TYPES.has(c.type) &&
			canViewChannel(c, member.member, guildPerm, roleMap, env.DISCORD_GUILD_ID)
	);
	return json({
		success: true,
		channels: visible.map((c) => ({
			id: c.id,
			name: c.name,
			type: c.type,
			parentId: c.parent_id || null,
			position: c.position || 0,
		})),
	});
}
async function discordMessages(request, env) {
	const s = await readSession(request, env.SESSION_SECRET);
	if (!s) return json({ success: false, error: 'Nicht angemeldet.' }, 401);
	const url = new URL(request.url);
	const id = url.searchParams.get('channelId');
	const c = await getAuthorizedChannel(id, s, env, false);
	if (c.error) return c.error;
	const r = await df(`/channels/${id}/messages?limit=20`, {
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
	});
	if (!r.ok)
		return json({ success: false, error: 'Nachrichten konnten nicht geladen werden.' }, 502);
	const msgs = await r.json();
	return json({
		success: true,
		messages: msgs.reverse().map((x) => ({
			id: x.id,
			content: x.content || '',
			author: x.author?.global_name || x.author?.username || 'Unbekannt',
			authorId: x.author?.id || null,
			timestamp: x.timestamp || null,
		})),
	});
}
async function discordSendMessage(request, env) {
	const s = await readSession(request, env.SESSION_SECRET);
	if (!s) return json({ success: false, error: 'Nicht angemeldet.' }, 401);
	let b;
	try {
		b = await request.json();
	} catch {
		return json({ success: false, error: 'Ungültige Anfrage.' }, 400);
	}
	const id = String(b.channelId || '');
	const content = clean(b.content, 2000);
	if (!content) return json({ success: false, error: 'Nachricht fehlt.' }, 400);
	const c = await getAuthorizedChannel(id, s, env, true);
	if (c.error) return c.error;
	const r = await df(`/channels/${id}/messages`, {
		method: 'POST',
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
	});
	if (!r.ok) return json({ success: false, error: 'Nachricht konnte nicht gesendet werden.' }, 502);
	return json({ success: true });
}
async function getAuthorizedChannel(id, s, env, send) {
	if (!/^\d{16,22}$/.test(id))
		return { error: json({ success: false, error: 'Ungültiger Channel.' }, 400) };
	const cr = await df(`/channels/${id}`, {
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
	});
	if (!cr.ok) return { error: json({ success: false, error: 'Channel nicht gefunden.' }, 404) };
	const c = await cr.json();
	if (c.guild_id !== env.DISCORD_GUILD_ID || !DISCORD_DISPLAY_CHANNEL_TYPES.has(c.type))
		return { error: json({ success: false, error: 'Channel nicht erlaubt.' }, 403) };
	const member = await fetchGuildMember(s.id, env);
	if (!member.ok || !member.member)
		return { error: json({ success: false, error: 'Kein Channel-Zugriff.' }, 403) };
	const rr = await df(`/guilds/${env.DISCORD_GUILD_ID}/roles`, {
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
	});
	if (!rr.ok)
		return { error: json({ success: false, error: 'Rollen konnten nicht geprüft werden.' }, 502) };
	const rs = await rr.json();
	const roleMap = new Map(rs.map((r) => [r.id, BigInt(r.permissions || '0')]));
	const gp = computeGuildPermissions(member.member, roleMap, env.DISCORD_GUILD_ID);
	if (!canViewChannel(c, member.member, gp, roleMap, env.DISCORD_GUILD_ID))
		return { error: json({ success: false, error: 'Kein Channel-Zugriff.' }, 403) };
	if (send && !canSendChannel(c, member.member, gp, roleMap, env.DISCORD_GUILD_ID))
		return { error: json({ success: false, error: 'Keine Schreibberechtigung.' }, 403) };
	return { channel: c };
}
function computeGuildPermissions(member, roleMap, guildId) {
	let p = roleMap.get(guildId) || 0n;
	for (const rid of member.roles || []) p |= roleMap.get(rid) || 0n;
	if ((p & PERM_ADMINISTRATOR) !== 0n) return (1n << 53n) - 1n;
	return p;
}
function applyOverwrite(p, allow, deny) {
	p &= ~deny;
	p |= allow;
	return p;
}
function channelPermissions(c, member, gp, roleMap, guildId) {
	if ((gp & PERM_ADMINISTRATOR) !== 0n) return gp;
	let p = gp;
	const ow = c.permission_overwrites || [];
	const everyone = ow.find((x) => x.type === 0 && x.id === guildId);
	if (everyone) p = applyOverwrite(p, BigInt(everyone.allow || '0'), BigInt(everyone.deny || '0'));
	let allow = 0n,
		deny = 0n;
	for (const x of ow) {
		if (x.type === 0 && (member.roles || []).includes(x.id)) {
			allow |= BigInt(x.allow || '0');
			deny |= BigInt(x.deny || '0');
		}
	}
	p = applyOverwrite(p, allow, deny);
	const user = ow.find((x) => x.type === 1 && x.id === member.user.id);
	if (user) p = applyOverwrite(p, BigInt(user.allow || '0'), BigInt(user.deny || '0'));
	return p;
}
function canViewChannel(c, m, gp, rm, gid) {
	return (channelPermissions(c, m, gp, rm, gid) & PERM_VIEW_CHANNEL) !== 0n;
}
function canSendChannel(c, m, gp, rm, gid) {
	const p = channelPermissions(c, m, gp, rm, gid);
	return (
		(p & PERM_VIEW_CHANNEL) !== 0n &&
		(p & PERM_SEND_MESSAGES) !== 0n &&
		DISCORD_TEXT_CHANNEL_TYPES.has(c.type)
	);
}

async function registerRequestCommand(request, env) {
	const auth = await requireOwner(request, env);
	if (auth.error) return auth.error;
	if (!env.DISCORD_CLIENT_ID || !env.DISCORD_GUILD_ID || !env.DISCORD_BOT_TOKEN)
		return json({ success: false, error: 'Discord Bot nicht vollständig konfiguriert.' }, 503);
	const cmd = {
		name: 'request',
		description: 'Erstellt eine Setup-Anfrage',
		type: 1,
		options: [
			{
				type: 3,
				name: 'fahrzeug',
				description: 'Fahrzeug auswählen',
				required: true,
				autocomplete: true,
			},
			{
				type: 3,
				name: 'strecke',
				description: 'Strecke auswählen',
				required: true,
				autocomplete: true,
			},
			{
				type: 3,
				name: 'hersteller',
				description: 'Gewünschter Setup-Hersteller (optional)',
				required: false,
				choices: [
					{ name: 'Egal', value: 'egal' },
					...REQUEST_MANUFACTURERS.map((item) => ({ name: item.name, value: item.id })),
				],
			},
			{
				type: 3,
				name: 'weitere_infos',
				description: 'Weitere Informationen zur Anfrage',
				required: false,
				max_length: 1000,
			},
		],
	};
	const r = await df(
		`/applications/${env.DISCORD_CLIENT_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(cmd),
		}
	);
	if (!r.ok)
		return json({ success: false, error: '/request konnte nicht registriert werden.' }, 502);
	return json({ success: true });
}
async function df(path, opts = {}) {
	return fetch(`${DISCORD_API}${path}`, opts);
}
function parseCookies(h) {
	return Object.fromEntries(
		h
			.split(';')
			.map((x) => x.trim())
			.filter(Boolean)
			.map((x) => {
				const i = x.indexOf('=');
				return i < 0 ? [x, ''] : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
			})
	);
}
function cookie(n, v, age) {
	return `${n}=${encodeURIComponent(v)}; Max-Age=${age}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
async function createSession(p, secret) {
	const data = btoa(unescape(encodeURIComponent(JSON.stringify(p))))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
	return `${data}.${bytesToBase64(sig).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}
async function readSession(req, secret) {
	if (!secret) return null;
	const raw = parseCookies(req.headers.get('Cookie') || '')[SESSION_COOKIE];
	if (!raw) return null;
	const [d, s] = raw.split('.');
	if (!d || !s) return null;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);
	const sig = base64ToBytes(
		s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
	);
	if (!(await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(d)))) return null;
	let p;
	try {
		p = JSON.parse(
			decodeURIComponent(
				escape(atob(d.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (d.length % 4)) % 4)))
			)
		);
	} catch {
		return null;
	}
	if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
	return p;
}
function bytesToBase64(bytes) {
	let b = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		b += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(b);
}
function base64ToBytes(b) {
	const s = atob(b),
		a = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
	return a;
}
function logout() {
	const h = securityHeaders(new Headers({ Location: '/' }));
	h.append('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
	return new Response(null, { status: 302, headers: h });
}
