/* @file-notes: Signierte Session- und OAuth-Cookies der Discord-Anmeldung. */

export const SESSION_COOKIE = 'lmu_session';
export const STATE_COOKIE = 'lmu_oauth_state';
export const SESSION_TTL = 604800;

export function parseCookies(h) {
	return Object.fromEntries(
		h
			.split(';')
			.map((x) => x.trim())
			.filter(Boolean)
			.map((x) => {
				const i = x.indexOf('=');
				return i < 0 ? [x, ''] : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
			})
	);
}
export function cookie(n, v, age) {
	return `${n}=${encodeURIComponent(v)}; Max-Age=${age}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
export async function createSession(p, secret) {
	const data = btoa(unescape(encodeURIComponent(JSON.stringify(p))))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
	return `${data}.${bytesToBase64(sig).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}
export async function readSession(req, secret) {
	if (!secret) return null;
	const raw = parseCookies(req.headers.get('Cookie') || '')[SESSION_COOKIE];
	if (!raw) return null;
	const [d, s] = raw.split('.');
	if (!d || !s) return null;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);
	const sig = base64ToBytes(
		s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
	);
	if (!(await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(d)))) return null;
	let p;
	try {
		p = JSON.parse(
			decodeURIComponent(
				escape(atob(d.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (d.length % 4)) % 4)))
			)
		);
	} catch {
		return null;
	}
	if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
	return p;
}
function bytesToBase64(bytes) {
	let b = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		b += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(b);
}
function base64ToBytes(b) {
	const s = atob(b),
		a = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
	return a;
}
