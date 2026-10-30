/* @file-notes: Speichert die Version hochgeladener Setups und ersetzt oder markiert ältere Setups. */
import legacyWorker from '../legacy.js';
import { json, safeJson } from '../lib/http.js';
import { readPreviousSetups, applyPreviousSetups } from '../setup-lifecycle.js';
import { readSetupVersion, storeSetupVersion } from '../setup-version.js';
import { readUploadForm } from '../upload-storage.js';

// The older worker writes the ZIP files; this reads the form once, stores the version of
// every uploaded setup and retires the setups it replaces.
export async function storeUploadedSetups(request, env, ctx) {
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
	if (previous.error) return json({ success: false, error: previous.error, retryable: false }, 400);
	const parsed = readSetupVersion(form);
	if (parsed.error) return json({ success: false, error: parsed.error }, 400);
	const category = String(form.get('category') || '').trim();
	const vehicle = String(form.get('vehicle') || '').trim();
	const response = await legacyWorker.fetch(request, env, ctx, form);
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
