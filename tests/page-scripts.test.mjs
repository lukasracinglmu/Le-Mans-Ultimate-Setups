import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

// Pages whose scripts live in public/js.
const PAGES = ['bug-report.html', 'request.html', 'bug-tickets.html'];

const publicUrl = (path) => new URL('../public/' + path, import.meta.url);

for (const page of PAGES) {
	test(page + ' loads its scripts from public/js only', () => {
		const html = readFileSync(publicUrl(page), 'utf8');
		const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
		assert.ok(scripts.length > 0);
		for (const [, attributes, code] of scripts) {
			assert.equal(code.trim(), '', 'inline script in ' + page);
			const src = attributes.match(/\bsrc="([^"]+)"/)?.[1];
			assert.match(src, /^\/js\/.+\.js$/);
			assert.ok(existsSync(publicUrl(src.slice(1))), src + ' does not exist');
		}
		assert.doesNotMatch(html, /<[^>]*\son[a-z]+\s*=/i, 'inline event handler in ' + page);
	});
}

// A missing module fails the whole page in the browser, so check every relative import.
test('every relative import in public/js resolves to a file', () => {
	const files = readdirSync(publicUrl('js'), { recursive: true }).filter((file) =>
		file.endsWith('.js')
	);
	assert.ok(files.length > 0);
	for (const file of files) {
		const url = publicUrl('js/' + file);
		const code = readFileSync(url, 'utf8');
		for (const [, specifier] of code.matchAll(/\bfrom\s+'(\.[^']+)'/g)) {
			assert.ok(existsSync(new URL(specifier, url)), file + ' imports missing ' + specifier);
		}
	}
});
