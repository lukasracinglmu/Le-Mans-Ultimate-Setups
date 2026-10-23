import { readFile } from 'node:fs/promises';
import { access, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const required = ['runtime-worker.js','full-admin.js','access-worker.js','admin.html','index.html','permission-test.html','wrangler.jsonc'];
const jsFiles = ['runtime-worker.js','full-admin.js','access-worker.js','discord-permissions.js','bug-reports.js','bug-tickets.js','repo-read.js','audit-log.js'];
for (const file of required) await access(file);
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Syntaxfehler in ${file}: ${result.stderr || result.stdout}`);
}
const assets = await readdir('assets');
if (!assets.includes('bp-logo.webp')) throw new Error('assets/bp-logo.webp fehlt.');
console.log(`Pre-deploy check erfolgreich: ${jsFiles.length} JavaScript-Dateien und ${assets.length} Asset-Einträge geprüft.`);
