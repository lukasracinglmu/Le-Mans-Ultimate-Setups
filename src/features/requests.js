/* @file-notes: Nimmt Setup-Anfragen von der Website an und schickt sie in den Discord-Kanal. */
import {
	resolveRequestManufacturer,
	setupRequestPayload,
	isAnyRequestManufacturer,
} from '../../discord-presence/request-manufacturers.js';
import {
	REQUEST_TRACKS,
	resolveRequestTrack,
	matchingRequestSetups,
} from '../../discord-presence/request-tracks.js';
import { githubBranch, setupRequestRoleId } from '../config.js';
import legacyWorker from '../legacy.js';
import { DISCORD_API } from '../lib/discord.js';
import { githubRequest } from '../lib/github.js';
import { json, safeJson } from '../lib/http.js';
import { readSiteFile } from '../repo-read.js';

// The tracks the request form suggests.
export function requestTracks() {
	return json({ success: true, tracks: REQUEST_TRACKS });
}

export async function normalizeSetupRequest(data, request, env) {
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

export async function existingRequestSetups(data, env) {
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

export function existingRequestResult(data, matches, env) {
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

export async function createWebsiteRequest(request, env) {
	const origin = request.headers.get('Origin');
	if (origin && origin !== new URL(request.url).origin)
		return json({ success: false, error: 'Origin nicht erlaubt.' }, 403);
	const meResponse = await legacyWorker.fetch(
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

export async function sendSetupRequest(data, env) {
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

export function clean(value, max) {
	return String(value || '')
		.replace(/[\u0000-\u001F\u007F]/g, ' ')
		.trim()
		.slice(0, max);
}
