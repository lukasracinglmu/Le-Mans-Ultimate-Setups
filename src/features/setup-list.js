/* @file-notes: Ergänzt die Setup-Liste um Versionen, Lifecycle-Status und Anzeigenamen. */
import legacyWorker from '../legacy.js';
import { json, safeJson } from '../lib/http.js';
import { enrichDisplayNames } from '../setup-display-name.js';
import { enrichSetupLifecycle } from '../setup-lifecycle.js';
import { enrichSetupVersions } from '../setup-version.js';

// The list itself comes from the older worker (#11 rebuilds it).
export async function listSetups(request, env, ctx) {
	const url = new URL(request.url);
	const response = await legacyWorker.fetch(request, env, ctx);
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
