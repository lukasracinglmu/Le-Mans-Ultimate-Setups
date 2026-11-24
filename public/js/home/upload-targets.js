// Filename recognition is deliberately conservative. Only vehicles in the live catalog
// are selectable; ambiguous brands and unknown names require a manual choice.
const ALIASES = {
	'Alpine A424': ['alpine', 'a424'],
	'Aston Martin Valkyrie AMR LMH': ['valkyrie'],
	'BMW M Hybrid V8': ['bmw v8', 'bmw hybrid', 'm hybrid v8'],
	'Cadillac V-Series.R': ['cadillac', 'v series r', 'vsr'],
	'Ferrari 499P': ['499p'],
	'Genesis GMR-001': ['genesis', 'gmr001', 'gmr 001'],
	'Glickenhaus SCG 007': ['glickenhaus', 'glick', 'scg007', 'scg 007'],
	'Isotta Fraschini Tipo6-C': ['isotta', 'tipo6c', 'tipo6 c'],
	'Lamborghini SC63': ['sc63', 'sc 63'],
	'Peugeot 9X8': ['9x8', '9 x 8'],
	'Peugeot 9X8 Evo': ['9x8 evo', '9x8evo', '9 x 8 evo'],
	'Porsche 963': ['963'],
	'Toyota GR010': ['toyota', 'gr010', 'gr 010'],
	'Vanwall Vandervell 680': ['vanwall', 'vandervell'],
	'Oreca 07 Gibson': ['oreca', 'oreca07', 'oreca 07'],
	'Adess AD25': ['adess', 'ad25'],
	'Duqueine D09': ['duqueine', 'd09'],
	'Ginetta G61-LT-P325': ['ginetta', 'g61'],
	'Ligier JS P325': ['ligier', 'js p325', 'jsp325'],
	'Aston Martin Vantage AMR LMGT3': ['vantage'],
	'BMW M4 LMGT3': ['bmw m4', 'm4 gt3', 'm4 lmgt3'],
	'Chevrolet Corvette Z06 LMGT3.R': ['corvette', 'z06'],
	'Ferrari 296 LMGT3': ['296'],
	'Ford Mustang LMGT3': ['mustang'],
	'Lamborghini Huracán LMGT3': ['huracan'],
	'Lexus RC F LMGT3': ['lexus', 'rc f', 'rcf'],
	'McLaren 720S LMGT3': ['mclaren', '720s'],
	'Mercedes-AMG LMGT3': ['mercedes', 'benz', 'amg gt3', 'amg lmgt3'],
	'Porsche 911 GT3 R': ['911', '992'],
	'Aston Martin Vantage AMR': ['vantage amr gte', 'vantage gte'],
	'Corvette RGTE': ['corvette rgte', 'corvette r gte', 'rgte'],
	'Ferrari 488 GTE Evo': ['488 gte evo', '488 gte', '488 evo', '488'],
	'Porsche 911 RSR-19': ['911 rsr 19', '911 rsr', 'rsr 19', 'rsr'],
};

function words(value) {
	return String(value || '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

// Exact component match for the required Auto Strecke Hersteller filename.
// ELMS/WEC belongs to the LMP2 car label and remains meaningful.
export function resolveUploadVehicleLabel(value, catalog) {
	const query = words(value);
	return (
		catalog.find((target) => {
			const label = target.category === 'LMP2' ? query.replace(/ (?:elms|wec)$/, '') : query;
			return [target.vehicle, ...(ALIASES[target.vehicle] || [])].some(
				(alias) => words(alias) === label
			);
		}) || null
	);
}

export function uploadTargetKey(target) {
	return JSON.stringify([target.category, target.vehicle]);
}

export function uploadJobKey(job) {
	return JSON.stringify([job.category, job.vehicle, job.file.name]);
}

export function flattenUploadCatalog(catalog) {
	return Object.entries(catalog).flatMap(([category, vehicles]) =>
		vehicles.map(({ name }) => ({ category, vehicle: name }))
	);
}

export function detectUploadTarget(filename, catalog) {
	// Ignore our own storage suffix and versions: neither identifies a vehicle.
	const stem = String(filename || '')
		.replace(/\.zip$/i, '')
		.replace(/\s*\(Version [^)]*\)$/i, '');
	const text = ' ' + words(stem) + ' ';
	const contains = (alias) => text.includes(' ' + words(alias) + ' ');
	let candidates = catalog.filter((target) =>
		[target.vehicle, ...(ALIASES[target.vehicle] || [])].some(contains)
	);
	// Explicit GTE model markers take priority over shared brand aliases such as Vantage, Corvette and 911.
	if (/\b(?:gte|rgte|rsr)\b/i.test(stem)) {
		candidates = candidates.filter((target) => target.category === 'GTE');
	}
	// EVO explicitly identifies the separate 9X8 Evo entry, even with separators.
	if (candidates.some((target) => target.vehicle === 'Peugeot 9X8') && contains('evo')) {
		candidates = candidates.filter((target) => target.vehicle !== 'Peugeot 9X8');
		const evo = catalog.find((target) => target.vehicle === 'Peugeot 9X8 Evo');
		if (evo && !candidates.includes(evo)) candidates.push(evo);
	}
	// A brand on its own can refer to more than one car. Show suggestions, never guess.
	if (!candidates.length) {
		const brands = [
			['bmw', /^BMW /],
			['ferrari', /^Ferrari /],
			['porsche', /^Porsche /],
			['lamborghini', /^Lamborghini /],
			['peugeot', /^Peugeot /],
			['aston martin', /^Aston Martin /],
		];
		candidates = catalog.filter((target) =>
			brands.some(([alias, names]) => contains(alias) && names.test(target.vehicle))
		);
		return { target: null, candidates };
	}
	return { target: candidates.length === 1 ? candidates[0] : null, candidates };
}

export function validateUploadTargets(files, targets) {
	if (
		files.length !== targets.length ||
		targets.some((target) => !target?.category || !target?.vehicle)
	)
		return 'Bitte für jede ZIP ein Fahrzeug auswählen oder die Datei überspringen.';
	const keys = files.map((file, index) => uploadJobKey({ file, ...targets[index] }));
	if (new Set(keys).size !== keys.length)
		return 'Dieselbe Datei wurde mehrfach für dasselbe Fahrzeug ausgewählt. Bitte die Doppelung überspringen.';
	return '';
}
