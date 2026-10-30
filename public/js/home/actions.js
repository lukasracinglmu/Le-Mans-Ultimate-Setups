// Click handlers of the buttons with data-action, formerly onclick attributes.
export function initActions(actions) {
	for (const element of document.querySelectorAll('[data-action]')) {
		element.addEventListener('click', actions[element.dataset.action]);
	}
}
