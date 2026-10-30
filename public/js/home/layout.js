// Logo, manufacturer carousel and the resizable panel of upcoming events.
const manufacturers = [
	{ src: '/assets/manufacturers/go-setups.webp', alt: 'GO Setups' },
	{ src: '/assets/manufacturers/hymo-setups.webp', alt: 'HYMO Setups' },
	{ src: '/assets/manufacturers/bealien.webp', alt: 'beAlien Setups' },
];

const widthKey = 'tpr-upcoming-width';

const clampWidth = (value) => {
	const min = 220;
	const viewport = document.documentElement.clientWidth || window.innerWidth;
	const max = Math.max(
		min,
		Math.min(460, Math.floor(viewport * 0.34), Math.max(min, viewport - 520))
	);
	return Math.max(min, Math.min(max, Math.round(value || 260)));
};

export function initResize() {
	const panel = document.getElementById('upcoming');
	if (!panel || window.matchMedia('(max-width:800px)').matches) return;
	panel.classList.add('upcoming-dock');
	const apply = (w) => {
		const width = clampWidth(w);
		panel.style.setProperty('--upcoming-width', width + 'px');
		return width;
	};
	const saved = Number(localStorage.getItem(widthKey));
	apply(Number.isFinite(saved) && saved ? saved : panel.getBoundingClientRect().width || 260);
	let handle = panel.querySelector('.upcoming-resize-handle');
	if (!handle) {
		handle = document.createElement('div');
		handle.className = 'upcoming-resize-handle';
		handle.setAttribute('aria-hidden', 'true');
		panel.prepend(handle);
	}
	let startX = 0,
		startWidth = 0;
	const move = (e) => {
		const next = apply(startWidth + (startX - e.clientX));
		localStorage.setItem(widthKey, String(next));
	};
	const up = (e) => {
		handle.classList.remove('active');
		handle.releasePointerCapture?.(e.pointerId);
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
	};
	handle.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		startX = e.clientX;
		startWidth = panel.getBoundingClientRect().width;
		handle.classList.add('active');
		handle.setPointerCapture?.(e.pointerId);
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	});
	window.addEventListener('resize', () =>
		apply(Number(localStorage.getItem(widthKey)) || panel.getBoundingClientRect().width)
	);
}

export function initLogo() {
	const logo = document.querySelector('.brand-logo');
	if (!logo) return;
	logo.src = '/assets/bp-logo.webp?v=maintenance-gray-2';
	logo.alt = 'Three Peaks Racing';
	logo.width = 96;
	logo.height = 48;
	logo.removeAttribute('hidden');
	logo.style.display = 'block';
	logo.style.visibility = 'visible';
	logo.style.opacity = '1';
	logo.onerror = null;
}

export function initManufacturerCarousel() {
	const img = document.getElementById('manufacturerImage');
	if (!img) return;
	let index = 0,
		timer = 0,
		swapTimer = 0;
	const show = (next) => {
		index = (next + manufacturers.length) % manufacturers.length;
		const item = manufacturers[index];
		img.style.opacity = '0';
		clearTimeout(swapTimer);
		swapTimer = setTimeout(() => {
			img.src = item.src;
			img.alt = item.alt;
			img.style.opacity = '1';
		}, 140);
	};
	show(0);
	timer = setInterval(() => show(index + 1), 5000);
	window.addEventListener(
		'pagehide',
		() => {
			clearInterval(timer);
			clearTimeout(swapTimer);
		},
		{ once: true }
	);
}

// The panel of upcoming events sits next to the main column.
export function moveUpcomingPanel() {
	const layout = document.querySelector('.layout');
	const upcoming = document.getElementById('upcoming');
	const main = layout?.querySelector('main');
	if (layout && upcoming && main && upcoming.previousElementSibling !== main) {
		layout.appendChild(upcoming);
	}
}
