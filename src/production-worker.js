/* @file-notes: Erweitert die Basis-Worker-APIs um Setup-Versionen, Anzeigenamen und Setup-Lifecycle-Verarbeitung. */
import { enrichDisplayNames } from './setup-display-name.js';
import baseWorker from './worker.js';
import {
	readPreviousSetups,
	applyPreviousSetups,
	enrichSetupLifecycle,
} from './setup-lifecycle.js';
import { githubBranch, setupRequestRoleId, setupSupplyRoleId } from './config.js';
import { githubRequest } from './lib/github.js';
import { json, safeJson } from './lib/http.js';
import { readPage, readSiteFile } from './repo-read.js';
import { enrichSetupVersions, readSetupVersion, storeSetupVersion } from './setup-version.js';

import { readUploadForm } from './upload-storage.js';
import {
	REQUEST_TRACKS,
	resolveRequestTrack,
	searchRequestTracks,
	matchingRequestSetups,
} from '../discord-presence/request-tracks.js';
import {
	resolveRequestManufacturer,
	setupRequestPayload,
	canConfirmSetupRequest,
	isAnyRequestManufacturer,
} from '../discord-presence/request-manufacturers.js';

const DISCORD_API = 'https://discord.com/api/v10';
const REQUEST_MODAL_ID = 'lmu_setup_request';
const REPO_ASSETS = new Set([
	'/assets/manufacturers/go-setups.webp',
	'/assets/manufacturers/hymo-setups.webp',
	'/assets/manufacturers/bealien.webp',
]);

let discordVerifyKeyCache = { key: null, expiresAt: 0 };

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname;

		try {
			if (request.method === 'GET' && path === '/api/request/tracks')
				return json({ success: true, tracks: REQUEST_TRACKS });
			if (request.method === 'POST' && path === '/api/request')
				return createWebsiteRequest(request, env);
			if (request.method === 'POST' && path === '/interactions/discord')
				return discordInteraction(request, env, ctx);
			if (request.method === 'GET' && REPO_ASSETS.has(path)) return serveRepoAsset(request, env);
			if (request.method === 'GET' && path === '/') return serveEnhancedHome(request, env);

			if (request.method === 'GET' && path === '/api/setups') {
				const response = await baseWorker.fetch(request, env, ctx);
				if (!response.ok) return response;
				const data = await safeJson(response.clone());
				if (!data?.success || !Array.isArray(data.setups)) return response;
				const category = url.searchParams.get('category') || '';
				const vehicle = url.searchParams.get('vehicle') || '';
				const setups = await enrichSetupVersions(data.setups, category, vehicle, env);
				return json(
					{
						...data,
						setups: await enrichDisplayNames(
							await enrichSetupLifecycle(setups, category, vehicle, env),
							category,
							vehicle,
							env
						),
					},
					response.status
				);
			}

			if (request.method === 'POST' && path === '/api/setups/upload') {
				let form;
				try {
					form = await readUploadForm(request);
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
				const previous = readPreviousSetups(
					form,
					form.getAll('files').map((file) => String(file?.name || ''))
				);
				if (previous.error)
					return json({ success: false, error: previous.error, retryable: false }, 400);
				const parsed = readSetupVersion(form);
				if (parsed.error) return json({ success: false, error: parsed.error }, 400);
				const category = String(form.get('category') || '').trim();
				const vehicle = String(form.get('vehicle') || '').trim();
				const response = await baseWorker.fetch(request, env, ctx, form);
				if (!response.ok) return response;
				const data = await safeJson(response.clone());
				if (!data?.success) return response;
				const retired = [];
				for (const item of Array.isArray(data.uploaded) ? data.uploaded : []) {
					if (item?.name) {
						try {
							if (!previous.duplicateOf || !item.alreadyExists)
								await storeSetupVersion(category, vehicle, item.name, parsed.version, env);
							if (!previous.duplicateOf && env.ACCESS_DB)
								await env.ACCESS_DB.prepare(
									'DELETE FROM setup_lifecycle WHERE category=? AND vehicle=? AND file_name=?'
								)
									.bind(category, vehicle, item.name)
									.run();
						} catch {
							return json(
								{
									success: false,
									error:
										'ZIP gespeichert, Versionsdaten konnten noch nicht bestätigt werden. Erneuter Versuch folgt.',
									code: 'VERSION_STORAGE',
									retryable: true,
								},
								503
							);
						}
						const cleanup = await applyPreviousSetups({
							plan: previous,
							category,
							vehicle,
							replacement: item,
							env,
						});
						if (!cleanup.success)
							return json(
								{ ...cleanup, success: false, error: 'Neue ZIP gespeichert. ' + cleanup.error },
								cleanup.status || 503
							);
						retired.push(...cleanup.retired);
					}
				}
				return json(
					{
						...data,
						duplicate: !!previous.duplicateOf,
						retired,
						category,
						vehicle,
						version: parsed.version,
						uploaded: (data.uploaded || []).map((item) => ({ ...item, version: parsed.version })),
					},
					response.status
				);
			}

			return baseWorker.fetch(request, env, ctx);
		} catch (error) {
			console.error(
				'Production worker route failed',
				error instanceof Error ? error.message : 'unknown'
			);
			return json({ success: false, error: 'Interner Serverfehler.' }, 500);
		}
	},
};

async function normalizeSetupRequest(data, request, env) {
	const requestedManufacturer = String(data.manufacturer ?? '').trim();
	const manufacturer = resolveRequestManufacturer(requestedManufacturer);
	if (!isAnyRequestManufacturer(requestedManufacturer) && !manufacturer)
		return {
			error: json(
				{
					success: false,
					error: 'Bitte GO, HYMO, beAlien oder Egal als Setup-Hersteller auswählen.',
				},
				400
			),
		};
	const selectedTrack = resolveRequestTrack(data.track);
	if (!selectedTrack)
		return {
			error: json(
				{ success: false, error: 'Bitte eine Strecke aus den Vorschlägen auswählen.' },
				400
			),
		};
	const catalogResponse = await readSiteFile(request, env, 'setups.json');
	if (!catalogResponse.ok)
		return {
			error: json({ success: false, error: 'Fahrzeugliste momentan nicht verfügbar.' }, 503),
		};
	const catalog = await catalogResponse.json().catch(() => null);
	const match = Object.entries(catalog || {})
		.flatMap(([carClass, vehicles]) =>
			Array.isArray(vehicles) ? vehicles.map((v) => ({ name: v.name, carClass })) : []
		)
		.find((v) => String(v.name).toLowerCase() === String(data.vehicle).toLowerCase());
	if (!match)
		return {
			error: json(
				{ success: false, error: 'Bitte ein Fahrzeug aus den Vorschlägen auswählen.' },
				400
			),
		};
	return {
		data: {
			...data,
			vehicle: match.name,
			carClass: match.carClass,
			track: selectedTrack.name,
			manufacturer: manufacturer?.id || null,
		},
	};
}

async function existingRequestSetups(data, env) {
	if (!env.GITHUB_TOKEN) return [];
	const path = ['setups', data.carClass, data.vehicle].map(encodeURIComponent).join('/');
	try {
		const response = await githubRequest(
			env,
			'/contents/' + path + '?ref=' + encodeURIComponent(githubBranch(env)),
			{
				headers: { 'User-Agent': 'lmu-setup-requests' },
				redirect: 'manual',
				signal: AbortSignal.timeout(12000),
			}
		);
		if (!response.ok) return [];
		const files = await response.json();
		return matchingRequestSetups(
			(Array.isArray(files) ? files : []).filter(
				(file) => file.type === 'file' && /\.zip$/i.test(file.name || '')
			),
			data.track,
			data.manufacturer
		);
	} catch {
		return [];
	}
}

function existingRequestResult(data, matches, env) {
	if (!matches.length) return null;
	const params = new URLSearchParams({
		category: data.carClass,
		vehicle: data.vehicle,
		setup: matches[0].name,
	});
	return {
		success: true,
		alreadyExists: true,
		manufacturer: data.manufacturer,
		setupName: matches[0].name,
		setupUrl: new URL(
			'/?' + params,
			env.SITE_URL || 'https://le-mans-ultimate-setups.3peaks-database.workers.dev'
		).toString(),
		message:
			'Für ' +
			data.vehicle +
			' auf ' +
			data.track +
			(data.manufacturer ? ' von ' + data.manufacturer : '') +
			' ist bereits ein Setup vorhanden.',
	};
}

async function createWebsiteRequest(request, env) {
	const origin = request.headers.get('Origin');
	if (origin && origin !== new URL(request.url).origin)
		return json({ success: false, error: 'Origin nicht erlaubt.' }, 403);
	const meResponse = await baseWorker.fetch(
		new Request(new URL('/api/me', request.url), { headers: request.headers }),
		env
	);
	const me = await safeJson(meResponse);
	if (!me?.loggedIn || !me?.databaseAccess || !me?.user?.id)
		return json(
			{ success: false, error: 'Nicht angemeldet oder keine Datenbankberechtigung.' },
			401
		);
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Ungültige Anfrage.' }, 400);
	}
	const normalized = await normalizeSetupRequest(
		{
			userId: String(me.user.id),
			username: me.user.username,
			vehicle: clean(body.vehicle, 100),
			track: clean(body.track, 100),
			manufacturer: body.manufacturer,
			message: clean(body.message, 1000),
		},
		request,
		env
	);
	if (normalized.error) return normalized.error;
	const data = normalized.data;
	const existing = existingRequestResult(data, await existingRequestSetups(data, env), env);
	if (existing) return json(existing);
	const sent = await sendSetupRequest(data, env);
	return sent.ok
		? json({ success: true, alreadyExists: false })
		: json({ success: false, error: sent.error }, sent.status);
}

async function sendSetupRequest(data, env) {
	if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID)
		return { ok: false, status: 503, error: 'Request-Dienst nicht konfiguriert.' };
	const roleId = setupRequestRoleId(env);
	const response = await fetch(DISCORD_API + '/channels/' + env.DISCORD_CHANNEL_ID + '/messages', {
		method: 'POST',
		headers: { Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN, 'Content-Type': 'application/json' },
		body: JSON.stringify(setupRequestPayload(data, roleId)),
		signal: AbortSignal.timeout(15000),
	});
	return response.ok
		? { ok: true }
		: { ok: false, status: 502, error: 'Request konnte nicht gesendet werden.' };
}

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

async function discordInteraction(request, env, ctx) {
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

async function serveEnhancedHome(request, env) {
	const response = await readPage(request, env, 'index.html');
	if (!response.ok) return response;
	return new Response(response.body, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'strict-origin-when-cross-origin',
		},
	});
}

async function serveRepoAsset(request, env) {
	// The images are deployed with the site. Serve the edge asset before GitHub.
	let response;
	try {
		response = await env.ASSETS.fetch(request);
	} catch {}
	if (!response?.ok)
		response = await readSiteFile(request, env, new URL(request.url).pathname.slice(1));
	if (!response.ok) return response;
	const headers = new Headers(response.headers);
	headers.set('Content-Type', 'image/webp');
	headers.set('Cache-Control', 'public, max-age=300');
	headers.set('X-Content-Type-Options', 'nosniff');
	return new Response(response.body, { status: response.status, headers });
}

function clean(value, max) {
	return String(value || '')
		.replace(/[\u0000-\u001F\u007F]/g, ' ')
		.trim()
		.slice(0, max);
}
