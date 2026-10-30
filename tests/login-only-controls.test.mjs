import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
// The access check of the home page toggles the login-only controls.
const access = await readFile(new URL('../public/js/home/access.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/css/home.css', import.meta.url), 'utf8');

// True when the element itself or one of its ancestors starts hidden as a login-only control.
function hiddenUntilLogin(html, id) {
	const position = html.indexOf(`id="${id}"`);
	assert.ok(position >= 0, `#${id} is missing`);
	const head = html.slice(0, html.indexOf('>', position) + 1);
	return [...head.matchAll(/<(\w+)\b[^>]*\bclass="([^"]*)"[^>]*>/g)].some((match) => {
		const [opening, tag, classes] = match;
		if (!/\blogin-only-control\b/.test(classes) || !/\bhidden\b/.test(classes)) return false;
		const inside = head.slice(match.index + opening.length);
		const opened = (inside.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
		const closed = (inside.match(new RegExp(`</${tag}>`, 'g')) || []).length;
		return opened >= closed;
	});
}

test('login-only controls are hidden in the initial HTML', () => {
	for (const id of ['mfrFilter', 'classFilter'])
		assert.ok(hiddenUntilLogin(index, id), `#${id} must start hidden until login`);
});

test('authentication controls all login-only elements', () => {
	assert.match(
		access,
		/const setLoginControls\s*=\s*\(visible\)\s*=>\s*document\s*\.querySelectorAll\('\.login-only-control'\)/
	);
	assert.match(access, /currentUser\s*=\s*d\.user\s*\|\|\s*null;\s*setLoginControls\(true\);/);
	assert.match(
		access,
		/if\s*\(!d\??\.loggedIn\)\s*\{\s*state\.currentUser\s*=\s*null;\s*setLoginControls\(false\);/
	);
	assert.doesNotMatch(css, /html:not\(\[data-db-access=['"]authorized['"]\]\)\s+#mfrFilter/);
});
