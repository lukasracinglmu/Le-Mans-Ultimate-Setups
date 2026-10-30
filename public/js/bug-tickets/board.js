import { escapeHtml } from '../shared/dom.js';
import { formatDate, statusText, ticketMatches, ticketNumber } from './ticket.js';

const TABS = ['open', 'progress', 'closed'];
const TAB_STORAGE_KEY = 'tpr-ticket-tab';

async function api(path, options) {
	const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
	const data = await response.json();
	if (!response.ok) {
		throw Error(data.error || 'Fehler');
	}
	return data;
}

const postJson = (path, body) =>
	api(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body,
	});

export function initTicketBoard() {
	const list = document.getElementById('list');
	const detail = document.getElementById('detail');
	const openTab = document.getElementById('openTab');
	const progressTab = document.getElementById('progressTab');
	const closedTab = document.getElementById('closedTab');
	const search = document.getElementById('ticketSearch');
	const savedTab = sessionStorage.getItem(TAB_STORAGE_KEY);
	let status = TABS.includes(savedTab) ? savedTab : 'open';
	let tickets = [];
	// Without a remembered tab the board starts with the open tickets and
	// switches to "in progress" when nothing is open.
	let initial = !TABS.includes(savedTab);
	let query = '';

	function rememberTab() {
		try {
			sessionStorage.setItem(TAB_STORAGE_KEY, status);
		} catch {}
	}

	function setTabs() {
		openTab.classList.toggle('active', status === 'open');
		progressTab.classList.toggle('active', status === 'progress');
		closedTab.classList.toggle('active', status === 'closed');
	}

	function tab(nextStatus) {
		status = nextStatus;
		initial = false;
		rememberTab();
		setTabs();
		detail.innerHTML = '';
		load();
	}

	function render() {
		const empty =
			status === 'open'
				? 'offenen'
				: status === 'progress'
					? 'Tickets in Bearbeitung'
					: 'geschlossenen';
		const shown = tickets.filter((ticket) => ticketMatches(ticket, query));
		list.innerHTML = shown.length
			? '<table><colgroup><col class="col-number"><col><col class="col-reporter"><col class="col-updated"><col class="col-priority"><col class="col-delete"></colgroup><thead><tr><th>Ticket-Nr.</th><th>Thema</th><th>Von</th><th>Aktualisiert</th><th>Priorität</th><th></th></tr></thead><tbody>' +
				shown
					.map(
						(t) =>
							'<tr class="row ' +
							(t.status === 'progress' ? 'in-progress' : t.status === 'closed' ? 'closed' : '') +
							'" data-id="' +
							t.id +
							'"><td class="nr">#' +
							ticketNumber(t.id) +
							'</td><td><b>' +
							escapeHtml(t.title) +
							'</b></td><td>' +
							escapeHtml(t.reporter_name) +
							'</td><td>' +
							formatDate(t.updated_at || t.created_at) +
							'</td><td class="prio ' +
							escapeHtml(t.priority) +
							'">' +
							escapeHtml(t.priority) +
							'</td><td>' +
							(t.status === 'closed'
								? '<button type="button" class="delete-row" data-id="' +
									t.id +
									'" title="Ticket löschen" aria-label="Ticket löschen">🗑️</button>'
								: '') +
							'</td></tr>'
					)
					.join('') +
				'</tbody></table>'
			: '<div class="empty">' +
				(query
					? 'Keine Tickets für „' + escapeHtml(search.value.trim()) + '“ gefunden.'
					: 'Keine ' + empty + '.') +
				'</div>';
		list.querySelectorAll('.row').forEach((row) => {
			row.addEventListener('click', () => show(row.dataset.id));
		});
		list.querySelectorAll('.delete-row').forEach((button) => {
			button.addEventListener('click', (event) => {
				event.stopPropagation();
				deleteTicket(button.dataset.id);
			});
		});
	}

	async function load() {
		try {
			const data = await api('/api/admin/bug-tickets?status=' + status);
			tickets = data.tickets || [];
			if (initial && status === 'open' && !tickets.length) {
				const progressData = await api('/api/admin/bug-tickets?status=progress');
				const progressTickets = progressData.tickets || [];
				if (progressTickets.length) {
					status = 'progress';
					tickets = progressTickets;
					initial = false;
					rememberTab();
					setTabs();
					render();
					return;
				}
			}
			initial = false;
			rememberTab();
			render();
		} catch (error) {
			initial = false;
			list.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
		}
	}

	async function show(id) {
		try {
			const t = (await api('/api/admin/bug-tickets/' + id)).ticket;
			detail.innerHTML =
				'<div class="detail"><div class="grid"><div class="card ' +
				(t.status === 'progress' ? 'progress-card' : '') +
				'"><h2>Ticket ' +
				ticketNumber(t.id) +
				'</h2><div class="field"><label>Titel</label><input id="editTitle" maxlength="120" value="' +
				escapeHtml(t.title) +
				'"></div><div class="field"><label>Beschreibung</label><textarea id="editDescription" maxlength="3500">' +
				escapeHtml(t.description) +
				'</textarea></div><div class="field"><label>Priorität</label><select id="editPriority"><option' +
				(t.priority === 'Low' ? ' selected' : '') +
				'>Low</option><option' +
				(t.priority === 'Medium' ? ' selected' : '') +
				'>Medium</option><option' +
				(t.priority === 'High' ? ' selected' : '') +
				'>High</option></select></div>' +
				(t.has_image ? '<img src="/api/admin/bug-tickets/' + t.id + '/image">' : '') +
				'<div class="actions"><button id="save" class="action save">Änderungen speichern</button>' +
				(t.status === 'open'
					? '<button id="progress" class="action progress">In Bearbeitung setzen</button><button id="close" class="action close">Ticket schließen</button>'
					: t.status === 'progress'
						? '<button id="reopen" class="action reopen">Auf Offen setzen</button><button id="close" class="action close">Ticket schließen</button>'
						: '<button id="reopen" class="action reopen">Ticket wieder öffnen</button><button id="delete" class="action">Ticket löschen</button>') +
				'</div><div id="extra"></div></div><aside class="card"><b>Ticket Details</b><div class="info"><span>Von</span>' +
				escapeHtml(t.reporter_name) +
				'</div><div class="info"><span>Discord ID</span>' +
				escapeHtml(t.reporter_id) +
				'</div><div class="info"><span>Status</span><b class="' +
				(t.status === 'progress' ? 'status-progress' : '') +
				'">' +
				statusText(t.status) +
				'</b></div><div class="info"><span>Priorität</span><b class="' +
				escapeHtml(t.priority) +
				'">' +
				escapeHtml(t.priority) +
				'</b></div><div class="info"><span>Erstellt</span>' +
				formatDate(t.created_at) +
				'</div>' +
				(t.closed_at
					? '<div class="info"><span>Geschlossen</span>' + formatDate(t.closed_at) + '</div>'
					: '') +
				'</aside></div></div>';
			const actions = {
				save: () => save(id),
				progress: () => progressTicket(id),
				close: () => closeBox(id),
				reopen: () => reopenTicket(id),
				delete: () => deleteTicket(id),
			};
			for (const [buttonId, action] of Object.entries(actions)) {
				document.getElementById(buttonId)?.addEventListener('click', action);
			}
		} catch (error) {
			detail.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
		}
	}

	async function save(id) {
		try {
			await postJson(
				'/api/admin/bug-tickets/' + id + '/edit',
				JSON.stringify({
					title: document.getElementById('editTitle').value,
					description: document.getElementById('editDescription').value,
					priority: document.getElementById('editPriority').value,
				})
			);
			await load();
			await show(id);
		} catch (error) {
			alert(error.message);
		}
	}

	async function progressTicket(id) {
		try {
			await postJson('/api/admin/bug-tickets/' + id + '/progress', '{}');
			tab('progress');
			setTimeout(() => show(id), 100);
		} catch (error) {
			alert(error.message);
		}
	}

	function closeBox(id) {
		document.getElementById('extra').innerHTML =
			'<div class="field"><label>Nachricht (optional)</label><textarea id="msg" maxlength="2000" placeholder="Leer lassen für die Standardnachricht"></textarea><button id="confirmClose" class="action close">Ticket schließen</button></div>';
		document.getElementById('confirmClose').addEventListener('click', () => closeTicket(id));
	}

	async function closeTicket(id) {
		try {
			await postJson(
				'/api/admin/bug-tickets/' + id + '/close',
				JSON.stringify({ resolution: document.getElementById('msg').value })
			);
			tab('closed');
		} catch (error) {
			alert(error.message);
		}
	}

	async function deleteTicket(id) {
		if (
			!confirm(
				'Dieses geschlossene Ticket endgültig löschen? Die Ticketnummer wird nicht wiederverwendet.'
			)
		) {
			return;
		}
		try {
			await api('/api/admin/bug-tickets/' + id + '/delete', { method: 'DELETE' });
			detail.innerHTML = '';
			load();
		} catch (error) {
			alert(error.message);
		}
	}

	async function reopenTicket(id) {
		try {
			await postJson('/api/admin/bug-tickets/' + id + '/reopen', '{}');
			tab('open');
			setTimeout(() => show(id), 100);
		} catch (error) {
			alert(error.message);
		}
	}

	openTab.addEventListener('click', () => tab('open'));
	progressTab.addEventListener('click', () => tab('progress'));
	closedTab.addEventListener('click', () => tab('closed'));
	search.addEventListener('input', () => {
		query = search.value.trim().toLowerCase();
		detail.innerHTML = '';
		render();
	});
	setTabs();
	load();
}
