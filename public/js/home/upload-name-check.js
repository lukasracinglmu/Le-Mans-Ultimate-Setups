import { getUploadCatalog } from './catalog.js';
import { parseUploadFilename } from '../shared/upload-filename.js';

// Load the existing shared track catalog only when preparing an upload.
// Failed requests are not cached, so the next attempt can recover.
let tracksPending = null;
function uploadTracks() {
	if (!tracksPending) {
		tracksPending = fetch('/api/request/tracks', {
			credentials: 'same-origin',
			cache: 'no-store',
			signal: AbortSignal.timeout(15000),
		})
			.then(async (response) => {
				const data = await response.json();
				if (!response.ok || !data.success || !Array.isArray(data.tracks))
					throw Error('Streckenliste konnte nicht geprüft werden. Bitte erneut versuchen.');
				return data.tracks;
			})
			.catch((error) => {
				tracksPending = null;
				throw error;
			});
	}
	return tracksPending;
}

export async function checkUploadNames(files, targets) {
	const catalog = getUploadCatalog();
	if (!catalog.length) throw Error('Fahrzeugliste konnte nicht geprüft werden. Bitte neu laden.');
	const tracks = await uploadTracks();
	for (let index = 0; index < files.length; index++) {
		const result = parseUploadFilename(files[index].name, catalog, tracks, targets?.[index]);
		if (result.error) throw Error('„' + files[index].name + '“: ' + result.error);
	}
}
