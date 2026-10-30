// JSON request with a 15 s timeout. Failed requests and { success: false } throw.
export async function adminApi(path, method = 'GET', body) {
	const response = await fetch(path, {
		signal: AbortSignal.timeout(15000),
		method,
		credentials: 'same-origin',
		cache: 'no-store',
		headers: body ? { 'Content-Type': 'application/json' } : {},
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok || data.success === false) {
		throw Error(data.error || 'Anfrage fehlgeschlagen.');
	}
	return data;
}
