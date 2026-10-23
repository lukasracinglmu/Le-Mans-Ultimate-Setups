# Admin-Werkzeuge

## Berechtigungstest

Angemeldete Nutzer können `/permission-test` öffnen. Die Seite liest ausschließlich die aktuelle `/api/me`-Antwort und zeigt Database-, Upload-, Ticket-, Admin-Panel-, Full-Admin- und Owner-Rechte an.

## Pre-Deploy-Prüfung

Vor einem Deploy lokal ausführen:

    node tools/predeploy-check.mjs
    npx wrangler@4.152.0 deploy --dry-run

Der Check prüft erforderliche Dateien, JavaScript-Syntax, die Wrangler-Konfiguration und das graue Logo.

## Backup und Rollback

Der aktuelle Stand vor dieser Erweiterung wurde in folgendem Branch gesichert:

    backup/pre-admin-tools-2026-10-23

Ein echtes Cloudflare-Rollback benötigt ein serverseitiges Cloudflare-API-Token. Tokens gehören nicht in HTML, JavaScript oder GitHub. Deshalb gibt es keine unsichere Frontend-Schaltfläche, die ein Token offenlegen würde.

## Automatische Backups

Der Worker prüft stündlich die deutsche Ortszeit. Nur montags, mittwochs und samstags um 12:00 Uhr wird ein Backup erstellt. Dabei wird der aktuelle `main`-Stand als GitHub-Tag `backup-YYYY-MM-DD` gespeichert. Die D1-Tabelle `automatic_backups` verhindert doppelte Backups am selben Tag. Dafür muss `GITHUB_TOKEN` als Cloudflare-Secret mit Repository-Schreibzugriff hinterlegt sein.
