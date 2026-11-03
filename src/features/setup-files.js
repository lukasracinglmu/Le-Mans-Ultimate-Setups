/* @file-notes: Setup-ZIPs im Repo: Zahlen, Liste, Download, Upload und Löschen über die GitHub API. */
import { githubBranch } from '../config.js';
import { resolvePermissions } from '../discord-permissions.js';
import { githubRequest } from '../lib/github.js';
import { json, securityHeaders } from '../lib/http.js';
import { readSession } from '../lib/session.js';
import { readRepoFile } from '../repo-read.js';
import { readPreviousSetups, deleteGithubSetup } from '../setup-lifecycle.js';
import { buildSetupSummary } from '../setup-summary.js';
import { cleanSetupFileName } from '../setup-version.js';
import { persistSetupFile } from '../upload-storage.js';
import vehicleCatalog from '../../public/setups.json' with { type: 'json' };
import { REQUEST_TRACKS } from '../../discord-presence/request-tracks.js';
import { flattenUploadCatalog } from '../../public/js/home/upload-targets.js';
import { parseUploadFilename } from '../../public/js/shared/upload-filename.js';

const MAX_FILES = 50;
const MAX_SETUP_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BODY_BYTES = 26 * 1024 * 1024;

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
function validateRequestSize(request, max = MAX_REQUEST_BODY_BYTES) {
	const len = Number(request.headers.get('Content-Length') || 0);
	return Number.isFinite(len) && len > max
		? json({ success: false, error: 'Request zu groß.' }, 413)
		: null;
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

export async function setupSummary(request, env) {
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

// The ZIP files of one vehicle, as GitHub lists them (#11 moves them to R2).
export async function listSetupFiles(request, env) {
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

export async function downloadSetup(request, env) {
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

// Writes the ZIP files of an upload. The form comes from storeUploadedSetups(), which reads
// the request body once.
export async function storeSetupFiles(request, env, form) {
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
	const category = safe(form.get('category')),
		vehicle = safe(form.get('vehicle')),
		files = form.getAll('files');
	if (!category || !vehicle || !files.length || files.length > MAX_FILES)
		return json({ success: false, error: 'Ungültiger Upload.', retryable: false }, 400);
	// Check every original client filename before any GitHub/D1 write, hashing,
	// normalization or duplicate substitution. Never trust the browser's preview.
	const uploadCatalog = flattenUploadCatalog(vehicleCatalog);
	const filenameErrors = files
		.map((file) => ({
			file,
			result: parseUploadFilename(file?.name, uploadCatalog, REQUEST_TRACKS, { category, vehicle }),
		}))
		.filter(({ result }) => result.error);
	if (filenameErrors.length) {
		return json(
			{
				success: false,
				error: 'Dateiname nicht erlaubt. ' + filenameErrors[0].result.error,
				code: 'INVALID_SETUP_FILENAME',
				retryable: false,
				uploaded: [],
				errors: filenameErrors.map(({ file, result }) => ({
					name: String(file?.name || ''),
					originalName: String(file?.name || ''),
					error: result.error,
					code: 'INVALID_SETUP_FILENAME',
					retryable: false,
				})),
			},
			400
		);
	}
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

export async function deleteSetupFile(request, env) {
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
