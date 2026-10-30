/* @file-notes: Prüft Upload, Versionsänderung und Löschen von Setups und schreibt das Audit-Log. */
import { writeSetupAuditEvent } from '../audit-log.js';
import { githubBranch } from '../config.js';
import legacyWorker from '../legacy.js';
import { githubRequest } from '../lib/github.js';
import { catchErrors, json, safeJson } from '../lib/http.js';
import {
	readDisplayName,
	displayNameStatement,
	readStoredDisplayName,
} from '../setup-display-name.js';
import { storeSetupVersion } from '../setup-version.js';
import { readProfile } from './auth.js';
import { storeUploadedSetups } from './setup-upload.js';

const storeUpload = catchErrors(storeUploadedSetups);

async function requireUploadDeleteAccess(request, env, ctx) {
	const me = await readProfile(request, env, ctx, true);
	if (!me?.loggedIn || !me.user?.id)
		return { error: json({ success: false, error: 'Nicht angemeldet.' }, 401) };
	if (!me.user.canUpload)
		return {
			error: json(
				{
					success: false,
					error:
						me.rolesAvailable === false
							? 'Discord-Rollenprüfung nicht verfügbar.'
							: 'Keine Upload/Delete-Berechtigung.',
					retryable: me.rolesAvailable === false,
				},
				me.rolesAvailable === false ? 503 : 403
			),
		};
	return { user: me.user };
}

// Checks the permission first and records every stored and replaced setup afterwards.
export async function uploadSetups(request, env, ctx) {
	const permission = await requireUploadDeleteAccess(request, env, ctx);
	if (permission.error) return permission.error;
	const response = await storeUpload(request, env, ctx);
	if (response.ok) {
		const data = await safeJson(response.clone());
		if (data?.success) {
			const vehicle = cleanPath(data.vehicle),
				version = String(data.version || '');
			for (const item of Array.isArray(data.uploaded) ? data.uploaded : []) {
				if (!item?.name || (data.duplicate && item.alreadyExists)) continue;
				// Finish this audit before the browser writes the next ZIP to the same branch.
				await new Promise((resolve) => setTimeout(resolve, 1100));
				await safeAudit(
					{
						action: 'SETUP_UPLOAD',
						discordAccount: permission.user.username,
						discordUserId: permission.user.id,
						setup: item.name,
						vehicle,
						manufacturer: classifyManufacturer(item.name),
						track: inferTrack(item.name),
						version,
						result: 'SUCCESS',
					},
					env
				);
			}
			for (const old of data.retired || []) {
				await new Promise((resolve) => setTimeout(resolve, 1100));
				await safeAudit(
					{
						action: old.action === 'delete' ? 'SETUP_DELETE' : 'SETUP_OUTDATED',
						discordAccount: permission.user.username,
						discordUserId: permission.user.id,
						setup: old.name,
						vehicle,
						manufacturer: classifyManufacturer(old.name),
						track: inferTrack(old.name),
						newValue: old.action === 'delete' ? 'Ersetzt' : 'Veraltet',
						result: 'SUCCESS',
					},
					env
				);
			}
		}
	}
	return response;
}

export async function updateSetupVersion(request, env, ctx) {
	const permission = await requireUploadDeleteAccess(request, env, ctx);
	if (permission.error) return permission.error;
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Ungültige Anfrage.' }, 400);
	}
	const category = cleanPath(body?.category),
		vehicle = cleanPath(body?.vehicle),
		name = cleanPath(body?.name);
	const hasVersion = Object.hasOwn(body, 'version'),
		hasName = Object.hasOwn(body, 'displayName'),
		hasOutdated = Object.hasOwn(body, 'outdated');
	if (!hasVersion && !hasName && !hasOutdated)
		return json({ success: false, error: 'Keine Änderung angegeben.' }, 400);
	if (hasVersion && typeof body.version !== 'string')
		return json({ success: false, error: 'Ungültige Version.' }, 400);
	if (hasOutdated && typeof body.outdated !== 'boolean')
		return json({ success: false, error: 'Ungültiger Status.' }, 400);
	const version = hasVersion ? body.version.trim() : null;
	if (!category || !vehicle || !name || !/\.zip$/i.test(name))
		return json({ success: false, error: 'Ungültiges Setup.' }, 400);
	if (hasVersion && (version.length > 40 || /[\u0000-\u001F\u007F]/.test(version)))
		return json({ success: false, error: 'Ungültige Version (maximal 40 Zeichen).' }, 400);
	const parsedName = hasName ? readDisplayName(body.displayName) : null;
	if (parsedName?.error) return json({ success: false, error: parsedName.error }, 400);
	if (!env.ACCESS_DB)
		return json({ success: false, error: 'Metadaten-Datenbank nicht verfügbar.' }, 503);
	const filePath = `/contents/setups/${enc(category)}/${enc(vehicle)}/${enc(name)}?ref=${enc(githubBranch(env))}`;
	let existing;
	try {
		existing = await githubRequest(env, filePath, { signal: AbortSignal.timeout(15000) });
	} catch {
		return json({ success: false, error: 'Setup konnte nicht geprüft werden.' }, 502);
	}
	if (existing.status === 404)
		return json({ success: false, error: 'Setup wurde nicht gefunden.' }, 404);
	if (!existing.ok)
		return json({ success: false, error: 'Setup konnte nicht geprüft werden.' }, 502);
	const file = await safeJson(existing);
	if ((hasName || hasOutdated) && !/^[a-f0-9]{40}$/.test(file?.sha || ''))
		return json({ success: false, error: 'Dateistand konnte nicht bestätigt werden.' }, 502);
	const oldVersion = await readStoredVersion(category, vehicle, name, env);
	let oldName = null;
	try {
		if (hasName) oldName = await readStoredDisplayName(category, vehicle, name, file.sha, env);
		if (hasVersion && hasName) {
			await env.ACCESS_DB.batch([
				env.ACCESS_DB.prepare(
					'INSERT INTO setup_versions (category, vehicle, file_name, version, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(category, vehicle, file_name) DO UPDATE SET version = excluded.version, updated_at = CURRENT_TIMESTAMP'
				).bind(category, vehicle, name, version),
				displayNameStatement(env, category, vehicle, name, file.sha, parsedName.displayName),
			]);
		} else if (hasName)
			await displayNameStatement(
				env,
				category,
				vehicle,
				name,
				file.sha,
				parsedName.displayName
			).run();
		else if (hasVersion) await storeSetupVersion(category, vehicle, name, version, env);
		if (hasOutdated)
			await env.ACCESS_DB.prepare(
				'INSERT INTO setup_lifecycle (category, vehicle, file_name, file_sha, outdated, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(category, vehicle, file_name) DO UPDATE SET file_sha = excluded.file_sha, outdated = excluded.outdated, updated_at = CURRENT_TIMESTAMP'
			)
				.bind(category, vehicle, name, file.sha, body.outdated ? 1 : 0)
				.run();
	} catch {
		return json(
			{
				success: false,
				error: 'Änderungen konnten nicht gespeichert werden. Bitte erneut versuchen.',
			},
			503
		);
	}
	runAuditTasks(
		[
			(async () => {
				const common = {
					discordAccount: permission.user.username,
					discordUserId: permission.user.id,
					setup: name,
					vehicle,
					manufacturer: classifyManufacturer(name),
					track: inferTrack(name),
					result: 'SUCCESS',
				};
				if (hasVersion && version !== (oldVersion || ''))
					await safeAudit(
						{
							...common,
							action: 'SETUP_VERSION_UPDATE',
							oldValue: oldVersion,
							newValue: version,
						},
						env
					);
				if (hasName && parsedName.displayName !== (oldName || ''))
					await safeAudit(
						{
							...common,
							action: 'SETUP_DISPLAY_NAME_UPDATE',
							oldValue: oldName,
							newValue: parsedName.displayName,
						},
						env
					);
				if (hasOutdated)
					await safeAudit(
						{
							...common,
							action: body.outdated ? 'SETUP_OUTDATED' : 'SETUP_OUTDATED_REVERT',
							oldValue: body.outdated ? 'AKTUELL' : 'VERALTET',
							newValue: body.outdated ? 'VERALTET' : 'AKTUELL',
						},
						env
					);
			})(),
		],
		ctx
	);
	return json({
		success: true,
		category,
		vehicle,
		name,
		version: hasVersion ? version : oldVersion,
		...(hasName ? { displayName: parsedName.displayName || null } : {}),
		...(hasOutdated ? { outdated: body.outdated } : {}),
	});
}

// The deletion itself happens in the older worker; this checks the permission first and
// records the deleted setup afterwards.
export async function deleteSetup(request, env, ctx) {
	const permission = await requireUploadDeleteAccess(request, env, ctx);
	if (permission.error) return permission.error;
	const clone = request.clone();
	let meta = { category: '', vehicle: '', name: '', version: null };
	try {
		const body = await clone.json();
		meta.category = cleanPath(body?.category);
		meta.vehicle = cleanPath(body?.vehicle);
		meta.name = cleanPath(body?.name);
		if (meta.category && meta.vehicle && meta.name)
			meta.version = await readStoredVersion(meta.category, meta.vehicle, meta.name, env);
	} catch {}
	const response = await legacyWorker.fetch(request, env, ctx);
	if (response.ok) {
		const data = await safeJson(response.clone());
		if (data?.success && data.deleted !== false && meta.name)
			runAuditTasks(
				[
					safeAudit(
						{
							action: 'SETUP_DELETE',
							discordAccount: permission.user.username,
							discordUserId: permission.user.id,
							setup: meta.name,
							vehicle: meta.vehicle,
							manufacturer: classifyManufacturer(meta.name),
							track: inferTrack(meta.name),
							version: meta.version,
							result: 'SUCCESS',
						},
						env
					),
				],
				ctx
			);
	}
	return response;
}

function enc(value) {
	return encodeURIComponent(String(value));
}

function cleanPath(value) {
	return String(value || '')
		.trim()
		.replace(/[/\\]+/g, '')
		.replace(/\.\./g, '')
		.replace(/[\u0000-\u001F\u007F]/g, '');
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
	return (
		String(name || '')
			.replace(/\.zip$/i, '')
			.replace(/[_-]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim() || null
	);
}

async function readStoredVersion(category, vehicle, name, env) {
	if (!env.ACCESS_DB) return null;
	try {
		const row = await env.ACCESS_DB.prepare(
			'SELECT version FROM setup_versions WHERE category = ? AND vehicle = ? AND file_name = ? LIMIT 1'
		)
			.bind(String(category), String(vehicle), String(name))
			.first();
		return row?.version ?? null;
	} catch {
		return null;
	}
}

async function safeAudit(event, env) {
	try {
		return await writeSetupAuditEvent(event, env);
	} catch (e) {
		console.error('Audit log failed', e instanceof Error ? e.message : 'unknown');
		return null;
	}
}

function runAuditTasks(tasks, ctx) {
	const work = Promise.allSettled(tasks);
	if (ctx?.waitUntil) ctx.waitUntil(work);
	else work.catch(() => {});
}
