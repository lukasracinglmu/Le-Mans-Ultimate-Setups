// Classic script in <head>: it runs before the page renders, so the page never
// shows the wrong theme first. A module would run too late.
try {
	document.documentElement.dataset.theme =
		localStorage.getItem('tpr-theme') === 'light' ? 'light' : 'dark';
} catch {}
