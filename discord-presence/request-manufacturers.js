/* @file-notes: Gemeinsame Herstellerwahl, Dateizuordnung und Discord-Nachricht für beide Request-Wege. */
export const REQUEST_MANUFACTURERS = Object.freeze([
	Object.freeze({ id: 'GO', name: 'GO' }),
	Object.freeze({ id: 'HYMO', name: 'HYMO' }),
	Object.freeze({ id: 'beAlien', name: 'beAlien' }),
]);
// Discord users and role used by the worker and the bot. The worker reads the
// role from wrangler.jsonc. The bot falls back to this ID when its .env does not
// set DISCORD_UPLOAD_ROLE_ID.
export const DEFAULT_SETUP_SUPPLY_ROLE_ID = '1538601074074849330';
export const SETUP_CONFIRMATION_WHITELIST = Object.freeze([
	'771358435416473600',
	'640948738445279261',
	'198399938739175424',
	'711862720567312455',
	'646758275714514955',
	'999265474078593164',
]);
const normalized = (value) =>
	String(value || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
// Der sichtbare Discord-Wert egal hat dieselbe Bedeutung wie eine leere Auswahl.
export const isAnyRequestManufacturer = (value) =>
	value == null || !String(value).trim() || normalized(value) === 'egal';
export function resolveRequestManufacturer(value) {
	const aliases = {
		go: 'GO',
		gosetups: 'GO',
		hymo: 'HYMO',
		heimo: 'HYMO',
		highmoss: 'HYMO',
		bealien: 'beAlien',
		ba: 'beAlien',
		ba1: 'beAlien',
		ba2: 'beAlien',
	};
	const id = aliases[normalized(value)];
	return REQUEST_MANUFACTURERS.find((item) => item.id === id) || null;
}
export function setupManufacturerFromFilename(value) {
	const name = String(value || '').toUpperCase();
	if (name.includes('HYMO')) return 'HYMO';
	if (
		name.includes('BEALIEN') ||
		name.includes('BE_ALIEN') ||
		/(?:^|[^A-Z0-9])BA[12]?(?=$|[^A-Z0-9])/.test(name)
	)
		return 'beAlien';
	return /(?:^|[^A-Z0-9])GO(?=$|[^A-Z0-9])/.test(name) ? 'GO' : null;
}
export function canConfirmSetupRequest(userId, roles, roleId) {
	return (
		SETUP_CONFIRMATION_WHITELIST.includes(String(userId || '')) ||
		Boolean(roleId && roles.includes(String(roleId)))
	);
}
export function setupRequestPayload(data, roleId, now = new Date()) {
	const manufacturer = resolveRequestManufacturer(data.manufacturer);
	const userId = String(data.userId || '');
	if (
		(!isAnyRequestManufacturer(data.manufacturer) && !manufacturer) ||
		!/^\d{16,22}$/.test(userId)
	)
		throw Error('Ungültige Setup-Anfrage.');
	const clean = (value, max) =>
		String(value || '')
			.replace(/[\u0000-\u001f\u007f]/g, ' ')
			.trim()
			.slice(0, max);
	return {
		content: /^\d{16,22}$/.test(String(roleId || '')) ? '<@&' + roleId + '>' : '',
		embeds: [
			{
				title: 'Neue Setup-Anfrage',
				color: 0x5865f2,
				fields: [
					{ name: 'Fahrzeug', value: clean(data.vehicle, 100), inline: true },
					{ name: 'Klasse', value: clean(data.carClass, 80) || 'Nicht angegeben', inline: true },
					{ name: 'Strecke', value: clean(data.track, 100), inline: false },
					{ name: 'Setup-Hersteller', value: manufacturer?.name || 'Egal', inline: false },
					{
						name: 'Weitere Informationen',
						value: clean(data.message, 1000) || 'Keine weiteren Informationen angegeben.',
						inline: false,
					},
					{ name: 'Angefragt von', value: '<@' + userId + '>', inline: false },
				],
				timestamp: now.toISOString(),
			},
		],
		components: [
			{
				type: 1,
				components: [
					{
						type: 2,
						style: 3,
						custom_id: 'setup_ready:' + userId,
						label: 'Setup wurde hochgeladen',
					},
				],
			},
		],
		allowed_mentions: {
			parse: [],
			roles: /^\d{16,22}$/.test(String(roleId || '')) ? [String(roleId)] : [],
			users: [],
		},
	};
}
