/* @file-notes: Vergleicht zwei Läufe von route-matrix.mjs Fall für Fall. */
// Usage: node tools/compare-route-matrix.mjs <before.json> <after.json>
import { readFileSync } from 'node:fs';

// Random OAuth states and the time of the last role check differ on every run.
const normalize = (value) =>
	typeof value !== 'string'
		? value
		: value
				.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
				.replace(/lmu_session=([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g, (match, payload) => {
					const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
					if (session.memberSnapshot) delete session.memberSnapshot.checkedAt;
					return 'lmu_session=' + JSON.stringify(session);
				})
				.replace(/Max-Age=\d{6,}/g, 'Max-Age=<long>');
const clean = (entry) => ({
	...entry,
	body: normalize(entry.body),
	headers: Object.fromEntries(
		Object.entries(entry.headers || {}).map(([k, v]) => [k, normalize(v)])
	),
});
const [before, after] = process.argv
	.slice(2)
	.map((file) => JSON.parse(readFileSync(file, 'utf8')).map(clean));
const byCase = new Map(after.map((entry) => [entry.case, entry]));
let problems = 0;
for (const a of before) {
	const b = byCase.get(a.case);
	if (!b) {
		problems++;
		console.log('MISSING', a.case);
		continue;
	}
	const diffs = [];
	if (a.error !== b.error) diffs.push(`error: ${a.error} -> ${b.error}`);
	if (a.status !== b.status) diffs.push(`status ${a.status} -> ${b.status}`);
	if (a.body !== b.body)
		diffs.push(
			`body ${JSON.stringify(a.body).slice(0, 120)} -> ${JSON.stringify(b.body).slice(0, 120)}`
		);
	const names = new Set([...Object.keys(a.headers || {}), ...Object.keys(b.headers || {})]);
	for (const name of names) {
		if ((a.headers || {})[name] !== (b.headers || {})[name]) {
			diffs.push(`header ${name}: ${(a.headers || {})[name]} -> ${(b.headers || {})[name]}`);
		}
	}
	if (diffs.length) {
		problems++;
		if (problems <= 25) console.log(a.case + '\n  ' + diffs.join('\n  '));
	}
}
console.log(`${before.length} cases, ${problems} differ`);
process.exit(problems ? 1 : 0);
