/* @file-notes: Beantwortet Discord-Interaktionen: Setup-Anfragen, Vorschläge und Bestätigungen. */
import {
	resolveRequestManufacturer,
	canConfirmSetupRequest,
} from '../../discord-presence/request-manufacturers.js';
import { searchRequestTracks } from '../../discord-presence/request-tracks.js';
import { setupSupplyRoleId } from '../config.js';
import { DISCORD_API } from '../lib/discord.js';
import { json } from '../lib/http.js';
import { readSiteFile } from '../repo-read.js';
import {
	clean,
	existingRequestResult,
	existingRequestSetups,
	normalizeSetupRequest,
	sendSetupRequest,
} from './requests.js';

const REQUEST_MODAL_ID = 'lmu_setup_request';

let discordVerifyKeyCache = { key: null, expiresAt: 0 };

async function finishDiscordRequest(interaction, data, request, env) {
	let reply;
	try {
		const normalized = await normalizeSetupRequest(data, request, env);
		if (normalized.error) {
			reply = { content: (await normalized.error.json()).error };
		} else {
			const ready = normalized.data;
			const existing = existingRequestResult(ready, await existingRequestSetups(ready, env), env);
			if (existing)
				reply = {
					content: existing.message,
					components: [
						{
							type: 1,
							components: [
								{
									type: 2,
									style: 5,
									label: 'Setup auf der Website öffnen',
									url: existing.setupUrl,
								},
							],
						},
					],
				};
			else {
				const sent = await sendSetupRequest(ready, env);
				reply = { content: sent.ok ? 'Die Setup-Anfrage wurde erfolgreich gesendet.' : sent.error };
			}
		}
	} catch {
		reply = { content: 'Die Setup-Anfrage konnte nicht gesendet werden.' };
	}
	await fetch(
		DISCORD_API +
			'/webhooks/' +
			encodeURIComponent(interaction.application_id) +
			'/' +
			encodeURIComponent(interaction.token) +
			'/messages/@original',
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...reply, allowed_mentions: { parse: [] } }),
			signal: AbortSignal.timeout(15000),
		}
	);
}

async function confirmDiscordRequest(interaction, env, ctx) {
	const user = interaction.member?.user || interaction.user || {};
	const roleId = setupSupplyRoleId(env);
	if (!canConfirmSetupRequest(user.id, interaction.member?.roles || [], roleId))
		return json({
			type: 4,
			data: {
				content:
					'Nur Mitglieder mit der Setup-Supply-Rolle oder der Bestätigungsfreigabe dürfen das Setup bestätigen.',
				flags: 64,
			},
		});
	const requesterId = String(interaction.data.custom_id).slice('setup_ready:'.length);
	const embed = interaction.message?.embeds?.[0];
	const fields = Object.fromEntries(
		(embed?.fields || []).map((field) => [String(field.name).toLowerCase(), String(field.value)])
	);
	if (
		!/^\d{16,22}$/.test(requesterId) ||
		!embed ||
		fields['angefragt von'] !== '<@' + requesterId + '>'
	)
		return json({ type: 4, data: { content: 'Ungültige Setup-Anfrage.', flags: 64 } });
	if (!interaction.message?.components?.length)
		return json({
			type: 4,
			data: { content: 'Dieses Setup wurde bereits bestätigt.', flags: 64 },
		});
	const manufacturer = resolveRequestManufacturer(fields['setup-hersteller']);
	const date = new Intl.DateTimeFormat('de-DE', {
		timeZone: 'Europe/Berlin',
		dateStyle: 'short',
		timeStyle: 'short',
	}).format(new Date());
	const updated = {
		...embed,
		color: 0x2b9b68,
		footer: { text: 'Setup als hochgeladen bestätigt · ' + date },
	};
	const params = new URLSearchParams({
		category: fields.klasse || '',
		vehicle: fields.fahrzeug || '',
	});
	const link = new URL(
		'/?' + params,
		env.SITE_URL || 'https://le-mans-ultimate-setups.3peaks-database.workers.dev'
	).toString();
	const notify = fetch(
		DISCORD_API + '/channels/' + encodeURIComponent(interaction.channel_id) + '/messages',
		{
			method: 'POST',
			headers: {
				Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				content:
					'<@' +
					requesterId +
					'> Das ' +
					(manufacturer ? manufacturer.name + '-' : '') +
					'Setup für **' +
					(fields.fahrzeug || 'deine Anfrage') +
					'** auf **' +
					(fields.strecke || 'der angefragten Strecke') +
					'** wurde hochgeladen und kann jetzt genutzt werden: ' +
					link,
				allowed_mentions: { parse: [], users: [requesterId], roles: [] },
				nonce: String(interaction.message.id),
				enforce_nonce: true,
			}),
			signal: AbortSignal.timeout(15000),
		}
	)
		.then((response) => {
			if (!response.ok) throw Error('Discord confirmation HTTP ' + response.status);
		})
		.catch((error) => console.warn('Setup confirmation notification failed', error.message));
	if (ctx?.waitUntil) ctx.waitUntil(notify);
	else await notify;
	return json({
		type: 7,
		data: { embeds: [updated], components: [], allowed_mentions: { parse: [] } },
	});
}

export async function discordInteraction(request, env, ctx) {
	const rawBody = await request.text();
	if (!(await verifyDiscordInteraction(request, rawBody, env)))
		return new Response('invalid request signature', { status: 401 });
	let interaction;
	try {
		interaction = JSON.parse(rawBody);
	} catch {
		return new Response('bad request', { status: 400 });
	}
	if (interaction.type === 1) return json({ type: 1 });
	if (
		interaction.type === 3 &&
		String(interaction.data?.custom_id || '').startsWith('setup_ready:')
	)
		return confirmDiscordRequest(interaction, env, ctx);
	if (interaction.type === 4 && interaction.data?.name === 'request') {
		const focused = (interaction.data.options || []).find((option) => option.focused);
		let choices = [];
		if (focused?.name === 'strecke')
			choices = searchRequestTracks(focused.value, 25).map((track) => ({
				name: track.name,
				value: track.name,
			}));
		if (focused?.name === 'fahrzeug') {
			const source = await readSiteFile(request, env, 'setups.json');
			const catalog = source.ok ? await source.json().catch(() => ({})) : {};
			const query = String(focused.value || '').toLowerCase();
			choices = Object.entries(catalog)
				.flatMap(([category, cars]) =>
					Array.isArray(cars)
						? cars.map((car) => ({ name: car.name + ' (' + category + ')', value: car.name }))
						: []
				)
				.filter((car) => car.value.toLowerCase().includes(query))
				.slice(0, 25);
		}
		return json({ type: 8, data: { choices } });
	}
	let values = null;
	if (interaction.type === 2 && interaction.data?.name === 'request') {
		const options = Object.fromEntries(
			(interaction.data.options || []).map((option) => [option.name, option.value])
		);
		if (!options.fahrzeug) return json(requestModalResponse());
		values = {
			vehicle: options.fahrzeug,
			track: options.strecke,
			manufacturer: options.hersteller,
			message: options.weitere_infos,
		};
	}
	if (interaction.type === 5 && interaction.data?.custom_id === REQUEST_MODAL_ID)
		values = modalValues(interaction.data.components);
	if (values) {
		const user = interaction.member?.user || interaction.user || {};
		const data = {
			userId: String(user.id || ''),
			username: user.global_name || user.username || 'Discord User',
			vehicle: clean(values.vehicle, 100),
			track: clean(values.track, 100),
			manufacturer: values.manufacturer,
			message: clean(values.message, 1000),
		};
		const task = finishDiscordRequest(interaction, data, request, env);
		if (ctx?.waitUntil) ctx.waitUntil(task);
		else await task;
		return json({ type: 5, data: { flags: 64 } });
	}
	// Discord reports a failed interaction unless every interaction gets an answer.
	return json({ type: 4, data: { content: 'Nicht unterstützt.', flags: 64 } });
}

function requestModalResponse() {
	const input = (customId, label, options = {}) => ({
		type: 1,
		components: [
			{
				type: 4,
				custom_id: customId,
				label,
				style: options.paragraph ? 2 : 1,
				required: options.required !== false,
				min_length: options.required === false ? undefined : 1,
				max_length: options.maxLength || 100,
				placeholder: options.placeholder,
			},
		],
	});
	return {
		type: 9,
		data: {
			custom_id: REQUEST_MODAL_ID,
			title: 'Setup Request',
			components: [
				input('vehicle', 'Fahrzeug', { maxLength: 100, placeholder: 'z. B. Porsche 963' }),
				input('class', 'Klasse', { maxLength: 80, placeholder: 'z. B. Hypercar' }),
				input('track', 'Strecke', { maxLength: 100, placeholder: 'z. B. Le Mans' }),
				input('manufacturer', 'Setup-Hersteller (optional)', {
					required: false,
					maxLength: 20,
					placeholder: 'GO, HYMO, beAlien oder Egal',
				}),
				input('message', 'Weitere Informationen', {
					required: false,
					paragraph: true,
					maxLength: 500,
					placeholder: 'Optional',
				}),
			],
		},
	};
}

function modalValues(rows) {
	const result = {};
	for (const row of Array.isArray(rows) ? rows : []) {
		for (const component of Array.isArray(row?.components) ? row.components : []) {
			if (component?.custom_id) result[component.custom_id] = component.value || '';
		}
	}
	return result;
}

async function getDiscordVerifyKey(env) {
	if (discordVerifyKeyCache.key && discordVerifyKeyCache.expiresAt > Date.now())
		return discordVerifyKeyCache.key;
	if (!env.DISCORD_BOT_TOKEN) return null;
	const response = await fetch(`${DISCORD_API}/oauth2/applications/@me`, {
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
	});
	if (!response.ok) return null;
	const app = await response.json();
	const key = app.verify_key || null;
	if (key) discordVerifyKeyCache = { key, expiresAt: Date.now() + 60 * 60 * 1000 };
	return key;
}

async function verifyDiscordInteraction(request, rawBody, env) {
	const signature = request.headers.get('X-Signature-Ed25519');
	const timestamp = request.headers.get('X-Signature-Timestamp');
	if (!signature || !timestamp) return false;
	const publicKeyHex = await getDiscordVerifyKey(env);
	const publicKey = hexToBytes(publicKeyHex);
	const signatureBytes = hexToBytes(signature);
	if (!publicKey || !signatureBytes) return false;
	try {
		const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, [
			'verify',
		]);
		const message = new TextEncoder().encode(timestamp + rawBody);
		return await crypto.subtle.verify('Ed25519', key, signatureBytes, message);
	} catch {
		return false;
	}
}

function hexToBytes(hex) {
	if (!hex || hex.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(hex)) return null;
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	return out;
}
