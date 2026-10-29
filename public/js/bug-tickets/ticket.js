export function ticketNumber(id) {
	return String(id).padStart(4, '0');
}

// The database stores UTC timestamps without a zone, e.g. "2026-10-27 12:00:00".
export function formatDate(value) {
	return value ? new Date(String(value).replace(' ', 'T') + 'Z').toLocaleString('de-DE') : '—';
}

export function statusText(status) {
	if (status === 'progress') {
		return 'In Bearbeitung';
	}
	return status === 'closed' ? 'Geschlossen' : 'Offen';
}

// The search covers the ticket number with and without "#" and every visible field.
export function ticketMatches(ticket, query) {
	if (!query) {
		return true;
	}
	const number = ticketNumber(ticket.id);
	return [
		number,
		'#' + number,
		ticket.title,
		ticket.reporter_name,
		ticket.reporter_id,
		ticket.description,
		ticket.priority,
		statusText(ticket.status),
		ticket.resolution,
	].some((value) =>
		String(value ?? '')
			.toLowerCase()
			.includes(query)
	);
}
