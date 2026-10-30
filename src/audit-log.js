import { githubBranch } from './config.js';
import { DISCORD_API } from './lib/discord.js';
import { githubRequest } from './lib/github.js';

function clean(value) {
	const v = String(value ?? '').trim();
	return v || null;
}
function classifyManufacturer(name) {
	const n = String(name || '').toUpperCase();
	if (n.includes('HYMO')) return 'HYMO';
	if (
		n.includes('BEALIEN') ||
		n.includes('BE_ALIEN') ||
		/(?:^|[^A-Z0-9])BA[12]?(?=$|[^A-Z0-9])/.test(n)
	)
		return 'beAlien';
	if (n.includes(' GO') || n.includes('_GO') || /\bGO\b/.test(n)) return 'GO';
	return null;
}
function inferTrack(name) {
	const base = String(name || '')
		.replace(/\.zip$/i, '')
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return base || null;
}
function normalizeEvent(event) {
	const setupActions = new Set([
		'SETUP_UPLOAD',
		'SETUP_OUTDATED',
		'SETUP_OUTDATED_REVERT',
		'SETUP_DELETE',
		'SETUP_DISPLAY_NAME_UPDATE',
		'SETUP_VERSION_UPDATE',
	]);
	const category = setupActions.has(String(event.action || ''))
		? 'SETUPS'
		: 'RECHTE_UND_ADMINISTRATION';
	const out = {
		timestamp: new Date().toISOString(),
		action: clean(event.action),
		discordAccount: clean(event.discordAccount),
		discordUserId: clean(event.discordUserId),
		targetDiscordAccount: clean(event.targetDiscordAccount),
		targetDiscordUserId: clean(event.targetDiscordUserId),
		permission: clean(event.permission),
		setup: clean(event.setup),
		vehicle: clean(event.vehicle),
		track: clean(event.track),
		manufacturer: clean(event.manufacturer),
		version: clean(event.version),
		oldValue: clean(event.oldValue),
		newValue: clean(event.newValue),
		result: 'SUCCESS',
	};
	out.category = category;
	for (const key of Object.keys(out)) if (out[key] == null) delete out[key];
	return out;
}
function auditColor(category) {
	return category === 'SETUPS' ? 0x3498db : 0x8e44ad;
}
function discordTitle(action) {
	if (action === 'SETUP_UPLOAD') return 'SETUP HOCHGELADEN';
	if (action === 'SETUP_OUTDATED') return 'SETUP ALS VERALTET MARKIERT';
	if (action === 'SETUP_OUTDATED_REVERT') return 'SETUP WIEDER AKTUELL MARKIERT';
	if (action === 'SETUP_DELETE') return 'SETUP GELÖSCHT';
	if (action === 'SETUP_DISPLAY_NAME_UPDATE') return 'SETUP-ANZEIGENAME GEÄNDERT';
	if (action === 'SETUP_VERSION_UPDATE') return 'SETUP-VERSION GEÄNDERT';
	if (action === 'PERMISSION_GRANT') return 'BERECHTIGUNG HINZUGEFÜGT';
	if (action === 'PERMISSION_REVOKE') return 'BERECHTIGUNG ENTFERNT';
	return action || 'AUDIT EVENT';
}
function addField(fields, name, value, inline = false) {
	const v = clean(value);
	if (v) fields.push({ name, value: v.slice(0, 1024), inline });
}
function discordFields(event) {
	const fields = [];
	addField(
		fields,
		'Ausgeführt von',
		event.discordUserId ? `<@${event.discordUserId}>` : event.discordAccount || 'Unbekannt'
	);
	if (event.targetDiscordAccount || event.targetDiscordUserId)
		addField(
			fields,
			'Betroffener User',
			event.targetDiscordUserId
				? `<@${event.targetDiscordUserId}>`
				: event.targetDiscordAccount || 'Unbekannt'
		);
	addField(fields, 'Berechtigung', event.permission, true);
	addField(fields, 'Setup', event.setup);
	addField(fields, 'Fahrzeug', event.vehicle, true);
	addField(fields, 'Strecke', event.track, true);
	addField(fields, 'Hersteller', event.manufacturer, true);
	addField(fields, 'Version', event.version, true);
	addField(fields, 'Alter Wert', event.oldValue, true);
	addField(fields, 'Neuer Wert', event.newValue, true);
	addField(fields, 'Ergebnis', event.result || 'SUCCESS', true);
	return fields;
}
async function writeDiscordAuditEvent(event, env) {
	if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_AUDIT_CHANNEL_ID) return;
	const actorId = /^\d{16,22}$/.test(String(event.discordUserId || ''))
		? String(event.discordUserId)
		: null;
	const targetId = /^\d{16,22}$/.test(String(event.targetDiscordUserId || ''))
		? String(event.targetDiscordUserId)
		: null;
	const mentionUsers = [...new Set([actorId, targetId].filter(Boolean))];
	const response = await fetch(`${DISCORD_API}/channels/${env.DISCORD_AUDIT_CHANNEL_ID}/messages`, {
		method: 'POST',
		signal: AbortSignal.timeout(10000),
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			embeds: [
				{
					title: discordTitle(event.action),
					color: auditColor(event.category),
					fields: discordFields(event),
					timestamp: event.timestamp,
				},
			],
			allowed_mentions: { parse: [], users: mentionUsers },
		}),
	});
	if (!response.ok) throw new Error(`Discord audit write failed (${response.status})`);
}

export async function writeSetupAuditEvent(event, env) {
	const safe = normalizeEvent({
		...event,
		manufacturer: event.manufacturer || classifyManufacturer(event.setup),
		track: event.track || inferTrack(event.setup),
	});
	const id = crypto.randomUUID();
	const path = `audit-logs/${safe.timestamp.slice(0, 7)}/${safe.timestamp.replace(/[:.]/g, '-')}-${id}.json`;
	const subject = safe.setup || safe.targetDiscordUserId || safe.vehicle || id;
	const body = {
		message: `Audit ${safe.action}: ${subject}`,
		content: btoa(unescape(encodeURIComponent(JSON.stringify(safe, null, 2) + '\n'))),
		branch: githubBranch(env),
	};

	// Independent sinks: a GitHub conflict must not suppress the Discord audit.
	const saveGithub = async () => {
		if (!env.GITHUB_TOKEN) throw Error('GitHub audit token unavailable');
		for (let attempt = 0; attempt < 3; attempt++) {
			const response = await githubRequest(
				env,
				'/contents/' + path.split('/').map(encodeURIComponent).join('/'),
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(20000),
				}
			);
			if (response.ok) return;
			await response.body?.cancel();
			if (![409, 422].includes(response.status) || attempt === 2)
				throw Error('GitHub audit write failed (' + response.status + ')');
			await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
		}
	};
	const results = await Promise.allSettled([saveGithub(), writeDiscordAuditEvent(safe, env)]);
	results.forEach((result, index) => {
		if (result.status === 'rejected')
			console.error(
				(index ? 'Discord' : 'GitHub') + ' audit failed',
				String(result.reason?.message || 'unavailable')
			);
	});
	if (results.every((result) => result.status === 'rejected'))
		throw Error('Audit destinations unavailable');
	return safe;
}
