/* @file-notes: Liefert die HTML-Seiten mit Zugriffsprüfung und Sicherheits-Headern aus. */
import { isTicketOwner } from '../bug-tickets.js';
import { readPage } from '../repo-read.js';
import { hasSiteAccess, readMe } from './auth.js';

// CSP of the home page and the protected pages. Their scripts and styles all
// come from public/js and public/css, so the policy allows nothing inline.
const PAGE_CSP =
	"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: https://cdn.discordapp.com https://media.discordapp.net; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'";

// Visitors without access learn nothing about protected pages.
const notFound = () =>
	new Response('Nicht gefunden.', {
		status: 404,
		headers: { 'Cache-Control': 'private, no-store' },
	});

async function sitePage(request, env, file, privatePage) {
	const source = await readPage(request, env, file);
	const headers = new Headers(source.headers);
	headers.set('Content-Type', source.ok ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
	headers.set('Cache-Control', privatePage ? 'private, no-store' : 'no-store');
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('X-Frame-Options', 'DENY');
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	headers.set('Content-Security-Policy', PAGE_CSP);
	return new Response(source.body, { status: source.status, headers });
}

export async function bugReportPage(request, env) {
	const me = await readMe(request, env);
	if (!hasSiteAccess(me)) return notFound();
	return sitePage(request, env, 'bug-report.html', true);
}

export async function requestPage(request, env) {
	const me = await readMe(request, env);
	if (!hasSiteAccess(me)) return notFound();
	return sitePage(request, env, 'request.html', true);
}

export async function ticketsPage(request, env) {
	if (!(await isTicketOwner(request, env))) return notFound();
	return sitePage(request, env, 'bug-tickets.html', true);
}

export async function adminPage(request, env) {
	const me = await readMe(request, env);
	if (!me?.loggedIn || !me.user?.canViewAdminPanel) return notFound();
	return sitePage(request, env, 'admin.html', true);
}

// The former strategy pages are gone for good; the answer also clears cached copies.
export function retiredStrategyPage() {
	return new Response('Nicht gefunden.', {
		status: 410,
		headers: {
			'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
			Pragma: 'no-cache',
			Expires: '0',
			'Clear-Site-Data': '"cache"',
			'X-Content-Type-Options': 'nosniff',
			'X-Frame-Options': 'DENY',
		},
	});
}

// Unlike the other pages, the home page drops the headers of the asset and keeps the
// plain answer when the site is unavailable.
export async function homePage(request, env) {
	const response = await readPage(request, env, 'index.html');
	if (!response.ok) return response;
	return new Response(response.body, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			'X-Frame-Options': 'DENY',
			'Referrer-Policy': 'strict-origin-when-cross-origin',
			'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
			'Content-Security-Policy': PAGE_CSP,
		},
	});
}
