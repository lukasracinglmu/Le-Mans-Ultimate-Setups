/* @file-notes: Prüft vor einem Deployment Syntax, Assets und zentrale Konfigurationsfehler. */
import { access, readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const wrangler = await readFile("wrangler.jsonc", "utf8");
const main = wrangler.match(/"main"\s*:\s*"([^"]+)"/)?.[1];
if (!main) throw new Error("wrangler.jsonc enthält keinen Worker-Einstieg (main).");
const pages = ["index.html", "admin.html", "request.html", "bug-report.html", "bug-tickets.html"];
for (const file of [main, ...pages]) await access(file);

const workerFiles = (await readdir(".")).filter((file) => file.endsWith(".js"));
const botFiles = (await readdir("discord-presence"))
  .filter((file) => file.endsWith(".js"))
  .map((file) => "discord-presence/" + file);
const jsFiles = [...workerFiles, ...botFiles];
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`Syntaxfehler in ${file}: ${result.stderr || result.stdout}`);
}
const assets = await readdir("assets");
if (!assets.includes("bp-logo.webp")) throw new Error("assets/bp-logo.webp fehlt.");
console.log(
  `Pre-deploy check erfolgreich: ${jsFiles.length} JavaScript-Dateien und ${assets.length} Asset-Einträge geprüft.`,
);
