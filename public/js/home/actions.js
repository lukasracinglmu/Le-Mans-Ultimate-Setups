// Classic script. Click handlers of the buttons with data-action, formerly
// onclick attributes.
/* global logout, showHome, toggleTheme */
(() => {
	const actions = {
		logout: () => logout(),
		'toggle-theme': () => toggleTheme(),
		'show-home': () => showHome(),
	};
	for (const element of document.querySelectorAll('[data-action]')) {
		element.addEventListener('click', actions[element.dataset.action]);
	}
})();
