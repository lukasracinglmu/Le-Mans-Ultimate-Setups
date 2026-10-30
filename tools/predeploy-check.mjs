/* @file-notes: Prüft vor einem Deployment Syntax, Assets und zentrale Konfigurationsfehler. */
import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REQUIRED_VARS } from '../src/config.js';

const wrangler = await readFile('wrangler.jsonc', 'utf8');
const main = wrangler.match(/"main"\s*:\s*"([^"]+)"/)?.[1];
if (!main) throw new Error('wrangler.jsonc enthält keinen Worker-Einstieg (main).');
const missingVars = REQUIRED_VARS.filter(
	(name) => !wrangler.match(new RegExp(`"${name}"\\s*:\\s*"\\s*[^"\\s][^"]*"`))
);
if (missingVars.length)
	throw new Error(`Pflichtvariablen fehlen in wrangler.jsonc: ${missingVars.join(', ')}`);
const pages = ['index.html', 'admin.html', 'request.html', 'bug-report.html', 'bug-tickets.html'];
for (const file of [main, ...pages.map((page) => 'public/' + page)]) await access(file);

const workerFiles = (await readdir('src', { recursive: true }))
	.filter((file) => file.endsWith('.js'))
	.map((file) => 'src/' + file);
const botFiles = (await readdir('discord-presence'))
	.filter((file) => file.endsWith('.js'))
	.map((file) => 'discord-presence/' + file);
const pageFiles = (await readdir('public/js', { recursive: true }))
	.filter((file) => file.endsWith('.js'))
	.map((file) => 'public/js/' + file);
const jsFiles = [...workerFiles, ...botFiles, ...pageFiles];
for (const file of jsFiles) {
	const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
	if (result.status !== 0)
		throw new Error(`Syntaxfehler in ${file}: ${result.stderr || result.stdout}`);
}
const assets = await readdir('public/assets');
if (!assets.includes('bp-logo.webp')) throw new Error('public/assets/bp-logo.webp fehlt.');
// Worker code must never be served. A copy of a src/ module in public/ has the same
// content; same file names are fine, e.g. a feature and the page script it serves.
const fingerprint = async (file) =>
	createHash('sha256')
		.update(await readFile(file))
		.digest('hex');
const workerFingerprints = new Set(await Promise.all(workerFiles.map(fingerprint)));
const publicFiles = (await readdir('public', { recursive: true, withFileTypes: true }))
	.filter((entry) => entry.isFile())
	.map((entry) => join(entry.parentPath, entry.name));
const exposed = [];
for (const file of publicFiles) {
	if (workerFingerprints.has(await fingerprint(file))) exposed.push(file);
}
if (exposed.length) throw new Error(`Worker-Module in public/ gefunden: ${exposed.join(', ')}`);
console.log(
	`Pre-deploy check erfolgreich: ${jsFiles.length} JavaScript-Dateien und ${assets.length} Asset-Einträge geprüft.`
);
