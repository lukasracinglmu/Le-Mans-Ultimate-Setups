/* @file-notes: Owner-Werkzeuge für Discord: Diagnose der Rollenprüfung und Registrierung von /request. */
import { REQUEST_MANUFACTURERS } from '../../discord-presence/request-manufacturers.js';
import { rolePermissions } from '../discord-permissions.js';
import { DISCORD_API } from '../lib/discord.js';
import { json } from '../lib/http.js';
import { requireOwnerSession } from './auth.js';

// Owner-only diagnostics: inspect Discord responses without returning credentials.
export async function discordRoleStatus(request, env) {
	const auth = await requireOwnerSession(request, env);
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

export async function registerRequestCommand(request, env) {
	const auth = await requireOwnerSession(request, env);
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
	const r = await fetch(
		`${DISCORD_API}/applications/${env.DISCORD_CLIENT_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
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
