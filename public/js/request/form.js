import { fetchMe } from '../shared/api.js';
import { escapeHtml } from '../shared/dom.js';
import { resolveRequestTrack, searchRequestTracks } from './tracks.js';

// Accepts the catalog as a list of groups or as an object keyed by car class.
export function listCars(data) {
	const groups = Array.isArray(data) ? data : data.vehicles || data.cars || data.categories || data;
	if (Array.isArray(groups)) {
		return groups.flatMap((x) => x.vehicles || x.cars || [x]).filter((x) => x && x.name);
	}
	const cars = [];
	for (const [carClass, list] of Object.entries(groups || {})) {
		if (Array.isArray(list)) {
			cars.push(
				...list.map((x) =>
					typeof x === 'string'
						? { name: x, class: carClass }
						: { ...x, class: x.class || carClass }
				)
			);
		}
	}
	return cars;
}

export function initRequestForm() {
	const form = document.getElementById('form');
	const vehicle = document.getElementById('vehicle');
	const carClass = document.getElementById('carClass');
	const track = document.getElementById('track');
	const manufacturer = document.getElementById('manufacturer');
	const message = document.getElementById('message');
	const options = document.getElementById('options');
	const trackOptions = document.getElementById('trackOptions');
	const result = document.getElementById('result');
	let cars = [];
	let selected = null;
	let tracks = [];
	let trackHits = [];
	let activeTrack = -1;

	const loadCars = async () => {
		try {
			const me = await fetchMe();
			if (!me.loggedIn) {
				location.replace('/');
				return;
			}
			const response = await fetch('/setups.json', {
				credentials: 'same-origin',
				cache: 'no-store',
			});
			const data = await response.json();
			if (data) {
				cars = listCars(data);
			}
		} catch {}
	};

	const showVehicleOptions = () => {
		selected = null;
		carClass.value = '';
		const query = vehicle.value.trim().toLowerCase();
		if (query.length < 2) {
			options.classList.add('hidden');
			return;
		}
		const hits = cars.filter((car) => car.name.toLowerCase().includes(query)).slice(0, 8);
		options.innerHTML = hits
			.map(
				(car, i) =>
					`<div class="option" data-i="${i}">${escapeHtml(car.name)}${car.class ? ` · ${escapeHtml(car.class)}` : ''}</div>`
			)
			.join('');
		options.classList.toggle('hidden', !hits.length);
		options.querySelectorAll('.option').forEach((option, i) => {
			option.addEventListener('click', () => {
				selected = hits[i];
				vehicle.value = selected.name;
				carClass.value = selected.class || selected.carClass || '';
				options.classList.add('hidden');
			});
		});
	};

	const closeTrackOptions = () => {
		trackOptions.classList.add('hidden');
		track.setAttribute('aria-expanded', 'false');
		track.removeAttribute('aria-activedescendant');
		activeTrack = -1;
	};

	const selectTrack = (index) => {
		const hit = trackHits[index];
		if (!hit) {
			return;
		}
		track.value = hit.name;
		track.setCustomValidity('');
		closeTrackOptions();
		track.focus();
	};

	const highlightTrack = () => {
		const trackOptionElements = [...trackOptions.querySelectorAll('[role="option"]')];
		trackOptionElements.forEach((option, index) =>
			option.setAttribute('aria-selected', String(index === activeTrack))
		);
		if (activeTrack < 0) {
			track.removeAttribute('aria-activedescendant');
			return;
		}
		const option = trackOptionElements[activeTrack];
		track.setAttribute('aria-activedescendant', option.id);
		option.scrollIntoView({ block: 'nearest' });
	};

	// Suggestions come from the same list as in the Discord bot, searched
	// locally instead of one request per keystroke.
	const showTrackOptions = () => {
		track.setCustomValidity('');
		activeTrack = -1;
		track.removeAttribute('aria-activedescendant');
		if (track.value.trim().length < 2) {
			closeTrackOptions();
			return;
		}
		trackHits = searchRequestTracks(tracks, track.value, 8);
		trackOptions.replaceChildren();
		if (!trackHits.length) {
			closeTrackOptions();
			return;
		}
		trackHits.forEach((hit, index) => {
			const option = document.createElement('button');
			option.type = 'button';
			option.className = 'option track-option';
			option.id = 'track-option-' + index;
			option.setAttribute('role', 'option');
			option.setAttribute('aria-selected', 'false');
			option.tabIndex = -1;
			option.textContent = hit.name;
			option.addEventListener('pointerdown', (event) => event.preventDefault());
			option.addEventListener('click', () => selectTrack(index));
			trackOptions.appendChild(option);
		});
		trackOptions.classList.remove('hidden');
		track.setAttribute('aria-expanded', 'true');
	};

	const handleTrackKey = (event) => {
		if (event.key === 'Escape' || event.key === 'Tab') {
			closeTrackOptions();
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (trackOptions.classList.contains('hidden')) {
				showTrackOptions();
			}
			if (!trackHits.length || trackOptions.classList.contains('hidden')) {
				return;
			}
			activeTrack =
				(activeTrack +
					(event.key === 'ArrowDown' ? 1 : activeTrack < 0 ? 0 : -1) +
					trackHits.length) %
				trackHits.length;
			highlightTrack();
			return;
		}
		if (event.key === 'Enter' && !trackOptions.classList.contains('hidden')) {
			event.preventDefault();
			if (activeTrack >= 0) {
				selectTrack(activeTrack);
			}
		}
	};

	const completeTrack = () => {
		closeTrackOptions();
		const hit = resolveRequestTrack(tracks, track.value);
		if (hit) {
			track.value = hit.name;
		}
	};

	// The small public list is loaded once; the vehicle search works meanwhile.
	const loadTracks = async () => {
		track.setAttribute('aria-busy', 'true');
		try {
			const response = await fetch('/api/request/tracks', {
				credentials: 'same-origin',
				cache: 'no-store',
			});
			if (!response.ok) {
				throw Error();
			}
			const data = await response.json();
			if (!Array.isArray(data.tracks) || !data.tracks.length) {
				throw Error();
			}
			tracks = data.tracks;
			track.setAttribute('aria-busy', 'false');
			if (document.activeElement === track && track.value.trim().length >= 2) {
				showTrackOptions();
			}
		} catch {
			track.setAttribute('aria-busy', 'false');
			result.textContent = 'Streckenliste konnte nicht geladen werden. Bitte lade die Seite neu.';
		}
	};

	const showExistingSetup = (data) => {
		result.replaceChildren(document.createTextNode(data.message + ' '));
		const link = document.createElement('a');
		link.href = data.setupUrl;
		link.textContent = 'Setup auf der Website öffnen';
		link.style.color = 'var(--text)';
		link.style.fontWeight = '700';
		result.appendChild(link);
	};

	const sendRequest = async (event) => {
		event.preventDefault();
		if (!selected || selected.name !== vehicle.value.trim()) {
			result.textContent = 'Bitte ein Fahrzeug aus der Liste auswählen.';
			return;
		}
		if (!tracks.length) {
			result.textContent = 'Streckenliste noch nicht verfügbar. Bitte lade die Seite neu.';
			return;
		}
		const selectedTrack = resolveRequestTrack(tracks, track.value);
		if (!selectedTrack) {
			result.textContent = 'Bitte eine Strecke aus den Vorschlägen auswählen.';
			track.focus();
			return;
		}
		track.value = selectedTrack.name;
		closeTrackOptions();
		result.textContent = 'Wird gesendet…';
		try {
			const response = await fetch('/api/request', {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vehicle: selected.name,
					carClass: carClass.value,
					track: selectedTrack.name,
					manufacturer: manufacturer.value,
					message: message.value.trim(),
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok || data.success === false) {
				throw Error(data.error || 'Request fehlgeschlagen.');
			}
			if (data.alreadyExists) {
				showExistingSetup(data);
			} else {
				result.textContent = 'Setup Request wurde gesendet.';
				track.value = '';
				message.value = '';
			}
		} catch (error) {
			result.textContent = error.message;
		}
	};

	loadCars();
	vehicle.addEventListener('input', showVehicleOptions);
	track.addEventListener('input', showTrackOptions);
	track.addEventListener('focus', showTrackOptions);
	track.addEventListener('keydown', handleTrackKey);
	track.addEventListener('blur', completeTrack);
	document.addEventListener('click', (event) => {
		if (!track.parentElement.contains(event.target)) {
			closeTrackOptions();
		}
	});
	loadTracks();
	form.addEventListener('submit', sendRequest);
}
