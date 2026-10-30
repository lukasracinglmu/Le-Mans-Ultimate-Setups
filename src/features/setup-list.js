/* @file-notes: Ergänzt die Setup-Liste um Versionen, Lifecycle-Status und Anzeigenamen. */
import { json, safeJson } from '../lib/http.js';
import { enrichDisplayNames } from '../setup-display-name.js';
import { enrichSetupLifecycle } from '../setup-lifecycle.js';
import { enrichSetupVersions } from '../setup-version.js';
import { listSetupFiles } from './setup-files.js';

// The ZIP files come from GitHub, the rest from D1 (#11 rebuilds this).
export async function listSetups(request, env) {
	const url = new URL(request.url);
	const response = await listSetupFiles(request, env);
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
