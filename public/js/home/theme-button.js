import { $ } from '../shared/dom.js';

function updateThemeButton(t) {
	const button = $('themeButton');
	if (!button) return;
	const light = t === 'dark';
	button.textContent = (light ? '☀ ' : '☾ ') + (light ? 'Light Mode' : 'Dark Mode');
	button.setAttribute(
		'aria-label',
		light ? 'In den Light Mode wechseln' : 'In den Dark Mode wechseln'
	);
	button.title = button.getAttribute('aria-label');
}

export function loadTheme() {
	const saved = localStorage.getItem('tpr-theme');
	const t = saved === 'light' ? 'light' : 'dark';
	document.documentElement.dataset.theme = t;
	updateThemeButton(t);
}

export function toggleTheme() {
	const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
	document.documentElement.dataset.theme = t;
	localStorage.setItem('tpr-theme', t);
	updateThemeButton(t);
}
