// Brand of a vehicle from its name. No DOM access, so tests can import it.
// Logos in /assets/brands/, single-color so CSS can tint them:
// - Simple Icons (CC0)
// - Wikimedia Commons, public domain or CC0: Alpine, Isotta Fraschini, Lexus, Ligier, Oreca
// - Makers' websites, no free license: Adess, Duqueine, Genesis, Ginetta, Vanwall
// - English Wikipedia, non-free: Glickenhaus
// Unknown brands get their first letter as a text mark.
export const BRANDS = [
	{ name: 'Adess', file: 'adess.png' },
	{ name: 'Alpine', file: 'alpine.svg' },
	{ name: 'Aston Martin', file: 'aston-martin.svg' },
	{ name: 'BMW', file: 'bmw.svg' },
	{ name: 'Cadillac', file: 'cadillac.svg' },
	{ name: 'Chevrolet', file: 'chevrolet.svg' },
	{ name: 'Duqueine', file: 'duqueine.svg' },
	{ name: 'Ferrari', file: 'ferrari.svg' },
	{ name: 'Ford', file: 'ford.svg' },
	{ name: 'Genesis', file: 'genesis.svg' },
	{ name: 'Ginetta', file: 'ginetta.svg' },
	{ name: 'Glickenhaus', file: 'glickenhaus.png' },
	{ name: 'Isotta Fraschini', file: 'isotta-fraschini.svg' },
	{ name: 'Lamborghini', file: 'lamborghini.svg' },
	{ name: 'Lexus', file: 'lexus.svg' },
	{ name: 'Ligier', file: 'ligier.svg' },
	{ name: 'McLaren', file: 'mclaren.svg' },
	{ name: 'Mercedes-AMG', file: 'mercedes-amg.svg' },
	{ name: 'Oreca', file: 'oreca.svg' },
	{ name: 'Peugeot', file: 'peugeot.svg' },
	{ name: 'Porsche', file: 'porsche.svg' },
	{ name: 'Toyota', file: 'toyota.svg' },
	{ name: 'Vanwall', file: 'vanwall.svg' },
];

export function vehicleBrand(vehicleName) {
	const name = String(vehicleName || '').trim();
	const lower = name.toLowerCase();
	const brand = BRANDS.find((b) => {
		const prefix = b.name.toLowerCase();
		return lower === prefix || lower.startsWith(prefix + ' ');
	});
	if (!brand) {
		const word = name.split(/\s+/)[0];
		return { name: word, logo: null, mark: word.charAt(0).toUpperCase() };
	}
	return { name: brand.name, logo: '/assets/brands/' + brand.file, mark: '' };
}
