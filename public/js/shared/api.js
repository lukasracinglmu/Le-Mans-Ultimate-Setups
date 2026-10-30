// Login state and permissions of the visitor.
export async function fetchMe() {
	const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
	return response.json();
}
