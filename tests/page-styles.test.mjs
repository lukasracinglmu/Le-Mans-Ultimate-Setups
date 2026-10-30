import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const PAGES = ['index.html', 'admin.html', 'request.html', 'bug-report.html', 'bug-tickets.html'];

const publicUrl = (path) => new URL('../public/' + path, import.meta.url);

// The page CSP allows styles only from files, so inline styles would not apply.
for (const page of PAGES) {
	test(page + ' loads its styles from public/css only', () => {
		const html = readFileSync(publicUrl(page), 'utf8');
		assert.doesNotMatch(html, /<style\b/, 'style element in ' + page);
		assert.doesNotMatch(html, /<[^>]*\sstyle\s*=/i, 'style attribute in ' + page);
		const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
		assert.ok(sheets.length > 0);
		for (const href of sheets) {
			assert.match(href, /^\/css\/.+\.css$/);
			assert.ok(existsSync(publicUrl(href.slice(1))), href + ' does not exist');
		}
	});
}

test('the scripts build HTML without style attributes or style elements', () => {
	const files = readdirSync(publicUrl('js'), { recursive: true }).filter((file) =>
		file.endsWith('.js')
	);
	for (const file of files) {
		const code = readFileSync(publicUrl('js/' + file), 'utf8');
		assert.doesNotMatch(code, /\sstyle=\\?["']/, 'style attribute in ' + file);
		assert.doesNotMatch(code, /<style\b/, 'style element in ' + file);
	}
});
