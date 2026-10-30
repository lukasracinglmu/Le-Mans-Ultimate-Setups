const TOPICS = {
	access: { title: 'Zugriffsproblem', priority: 'High' },
	download: { title: 'Setup-Download fehlerhaft', priority: 'High' },
	delete: { title: 'Setup kann nicht gelöscht werden', priority: 'Medium' },
	edit: { title: 'Setup-Bearbeitung fehlerhaft', priority: 'Medium' },
	search: { title: 'Suche funktioniert nicht', priority: 'Medium' },
	filter: { title: 'Filter funktioniert nicht', priority: 'Medium' },
	vehicle: { title: 'Fehlerhafte Fahrzeugdaten', priority: 'Medium' },
	request: { title: 'Setup Request fehlerhaft', priority: 'Medium' },
	admin: { title: 'Admin-Panel fehlerhaft', priority: 'High' },
	permissions: { title: 'Fehlerhafte Berechtigungen', priority: 'High' },
	display: { title: 'Darstellungsfehler', priority: 'Low' },
	performance: { title: 'Performance-Problem', priority: 'High' },
	error: { title: 'Fehlermeldung aufgetreten', priority: 'Medium' },
};

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export function createReportId() {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

export function isAllowedImage(file) {
	return file.size <= MAX_IMAGE_SIZE && IMAGE_TYPES.includes(file.type);
}

export function initBugReportForm() {
	const form = document.getElementById('bugReportForm');
	const login = document.getElementById('loginState');
	const button = document.getElementById('sendReport');
	const result = document.getElementById('result');
	const image = document.getElementById('image');
	const preview = document.getElementById('preview');
	const problemType = document.getElementById('problemType');
	const titleInput = document.getElementById('title');
	const priorityInput = document.getElementById('priority');
	const titleHint = document.getElementById('titleHint');
	const priorityHint = document.getElementById('priorityHint');
	const adminOption = problemType.querySelector('option[value="admin"]');
	let busy = false;
	let previewUrl = null;
	let reportId = createReportId();

	const showResult = (message, state) => {
		result.textContent = message;
		result.dataset.state = state;
	};

	// The server answers a resent report ID with the existing ticket. Every
	// change to the form therefore starts a new report.
	const newReportId = () => {
		if (!busy) {
			reportId = createReportId();
		}
	};

	const revokePreview = () => {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
		previewUrl = null;
	};

	const resetForm = () => {
		form.reset();
		priorityInput.value = 'Medium';
		titleInput.placeholder = 'Wird nach der Problemauswahl vorgeschlagen';
		titleHint.textContent = 'Der Titel wird automatisch vorgeschlagen.';
		priorityHint.textContent = 'Die Priorität wird passend zum Problem vorgeschlagen.';
		revokePreview();
		preview.classList.add('hidden');
		reportId = createReportId();
	};

	const suggestTopic = () => {
		const topic = TOPICS[problemType.value];
		if (topic) {
			titleInput.value = topic.title;
			priorityInput.value = topic.priority;
			titleHint.textContent = 'Titel wurde passend zum Problem vorgeschlagen.';
			priorityHint.textContent =
				'Vorgeschlagene Priorität: ' + topic.priority + '. Du kannst sie bei Bedarf ändern.';
		} else if (problemType.value === 'other') {
			titleInput.value = '';
			priorityInput.value = 'Medium';
			titleInput.placeholder = 'Eigenen Titel eingeben';
			titleHint.textContent = 'Bei Sonstiges gibst du den Titel selbst ein.';
			priorityHint.textContent = 'Wähle die passende Priorität selbst aus.';
		}
		newReportId();
	};

	const showPreview = () => {
		revokePreview();
		preview.classList.add('hidden');
		const file = image.files[0];
		if (!file) {
			return;
		}
		if (!isAllowedImage(file)) {
			showResult('Bitte PNG, JPG oder WebP mit maximal 5 MiB auswählen.', 'error');
			image.value = '';
			return;
		}
		previewUrl = URL.createObjectURL(file);
		preview.src = previewUrl;
		preview.classList.remove('hidden');
	};

	const sendReport = async (event) => {
		event.preventDefault();
		if (busy) {
			return;
		}
		const selectedProblem = problemType.value;
		const title = titleInput.value.trim();
		const description = document.getElementById('description').value.trim();
		const priority = priorityInput.value;
		if (!selectedProblem) {
			showResult('Bitte zuerst ein Problem auswählen.', 'error');
			return;
		}
		if (title.length < 3 || description.length < 3) {
			return;
		}
		busy = true;
		button.disabled = true;
		button.textContent = 'Wird gesendet…';
		result.textContent = '';
		try {
			const data = new FormData();
			data.set('problemType', selectedProblem);
			data.set('title', title);
			data.set('description', description);
			data.set('priority', priority);
			data.set('reportId', reportId);
			if (image.files[0]) {
				data.set('image', image.files[0]);
			}
			const response = await fetch('/api/bug-reports', {
				method: 'POST',
				credentials: 'same-origin',
				body: data,
				signal: AbortSignal.timeout(60000),
			});
			const body = await response.json();
			if (!response.ok || !body.success) {
				throw Error(body.error || 'Meldung konnte nicht gesendet werden.');
			}
			showResult('Bugmeldung wurde als Ticket ' + body.ticket + ' erstellt.', 'success');
			resetForm();
		} catch (error) {
			showResult(error.message || 'Verbindung unterbrochen.', 'error');
		} finally {
			busy = false;
			button.disabled = false;
			button.textContent = 'Bugmeldung senden';
		}
	};

	const showFormToMembers = async () => {
		try {
			const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
			const data = await response.json();
			if (!data.loggedIn) {
				login.innerHTML =
					'<p>Bitte melde dich mit Discord an, um eine Bugmeldung zu senden.</p><a href="/auth/discord">Mit Discord anmelden</a>';
				return;
			}
			if (data.user?.canManageDatabaseAccess || data.user?.canManageUploadAccess) {
				adminOption.classList.remove('hidden');
			}
			login.classList.add('hidden');
			form.classList.remove('hidden');
		} catch {
			login.textContent = 'Die Anmeldung konnte nicht geprüft werden.';
		}
	};

	form.addEventListener('input', newReportId);
	problemType.addEventListener('change', suggestTopic);
	image.addEventListener('change', showPreview);
	form.addEventListener('submit', sendReport);
	window.addEventListener('pagehide', revokePreview);
	showFormToMembers();
}
