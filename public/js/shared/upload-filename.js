// Public, side-effect-free filename grammar shared by the browser and server.
// Catalogs are supplied by the caller; this module contains no credentials or I/O.
import { resolveRequestTrack } from '../request/tracks.js';
import { resolveUploadVehicleLabel } from '../home/upload-targets.js';

export const UPLOAD_FILENAME_HINT = [
	'Erwartet: Auto Strecke Hersteller.zip, z. B. BMW V8 Spa GO.zip.',
	'GTE-Fahrzeuge brauchen GTE im Namen, z. B. Porsche 911 RSR-19 GTE Spa GO.zip.',
	'Hersteller: GO, HYMO oder beAlien (auch bA/bA1/bA2).',
].join(' ');

export function parseUploadFilename(name, catalog, tracks, target) {
	const fail = (reason) => ({ error: reason + ' ' + UPLOAD_FILENAME_HINT });
	if (
		typeof name !== 'string' ||
		name.length > 180 ||
		name !== name.trim() ||
		/[\u0000-\u001f\u007f/\\:*?"<>|]/.test(name) ||
		name.includes('..')
	)
		return fail('Ungültiger Dateiname.');
	const match = /^(.+)\s+(GO|HYMO|beAlien|BE_ALIEN|bA[12]?)\.zip$/i.exec(name);
	if (!match) return fail('Dateiname hat nicht das erlaubte Format.');
	const parts = match[1].trim().split(/\s+/);
	const matches = [];
	for (let split = 1; split < parts.length; split++) {
		const vehicle = resolveUploadVehicleLabel(parts.slice(0, split).join(' '), catalog);
		const track = resolveRequestTrack(tracks, parts.slice(split).join(' '));
		if (vehicle && track) {
			const vehicleLabel = parts.slice(0, split).join(' ');
			matches.push({ ...vehicle, track: track.name, vehicleLabel });
		}
	}
	if (matches.length !== 1)
		return fail('Auto und Strecke müssen vollständig und in dieser Reihenfolge erkennbar sein.');
	const found = matches[0];
	if (found.category === 'GTE' && !/\b(?:gte|rgte)\b/i.test(found.vehicleLabel))
		return fail('GTE muss ausdrücklich im Fahrzeugnamen stehen.');
	const { vehicleLabel, ...resolved } = found;
	if (target && (target.category !== resolved.category || target.vehicle !== resolved.vehicle))
		return fail('Das Auto im Dateinamen passt nicht zum ausgewählten Fahrzeug.');
	const vendor = match[2].toLowerCase();
	return {
		...resolved,
		manufacturer: vendor === 'go' ? 'GO' : vendor === 'hymo' ? 'HYMO' : 'beAlien',
	};
}
