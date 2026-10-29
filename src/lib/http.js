/* @file-notes: Gemeinsame JSON-Antworten und Security-Header für alle Worker-Module. */

export function securityHeaders(headers = new Headers()) {
	const h = new Headers(headers);
	h.set('X-Content-Type-Options', 'nosniff');
	h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	h.set('X-Frame-Options', 'DENY');
	h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	h.set('X-Permitted-Cross-Domain-Policies', 'none');
	h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
	h.set('Cross-Origin-Opener-Policy', 'same-origin');
	h.set('Cross-Origin-Resource-Policy', 'same-origin');
	h.set(
		'Content-Security-Policy',
		"default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; upgrade-insecure-requests"
	);
	return h;
}

export function withSecurityHeaders(response) {
	const headers = securityHeaders(response.headers);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

// Every JSON response of the worker. `headers` can override Cache-Control or
// add headers such as Retry-After.
export function json(data, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: securityHeaders(
			new Headers({
				'Content-Type': 'application/json; charset=UTF-8',
				'Cache-Control': 'no-store',
				...headers,
			})
		),
	});
}

export async function safeJson(response) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}
