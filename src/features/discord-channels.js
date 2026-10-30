/* @file-notes: Discord-Channels und -Nachrichten für die Website, nach den Channel-Rechten des Besuchers. */
import { DISCORD_API } from '../lib/discord.js';
import { json } from '../lib/http.js';
import { readSession } from '../lib/session.js';

const DISCORD_TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);
const DISCORD_DISPLAY_CHANNEL_TYPES = new Set([0, 2, 4, 5, 10, 11, 12, 13, 15]);
const PERM_VIEW_CHANNEL = 1024n;
const PERM_SEND_MESSAGES = 2048n;
const PERM_ADMINISTRATOR = 8n;

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
export async function discordChannels(request, env) {
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
export async function discordMessages(request, env) {
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
export async function discordSendMessage(request, env) {
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
function clean(v, max = 1000) {
	return String(v || '')
		.replace(/[\u0000-\u001F\u007F]/g, ' ')
		.trim()
		.slice(0, max);
}
async function df(path, opts = {}) {
	return fetch(`${DISCORD_API}${path}`, opts);
}
