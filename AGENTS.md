# AGENTS.md

Hinweise für KI-Agenten und Automatisierungen, die in diesem Repository arbeiten.

## Sprache

- Pull Requests: Titel und Beschreibung auf Deutsch.
- Fachbegriffe, Datei- und Funktionsnamen bleiben unverändert, z. B. `worker.js`, Branch, Commit.
- GitHub-Schlüsselwörter zum Schließen von Issues bleiben englisch (`Closes #4`), sonst erkennt GitHub sie nicht.

## Struktur

| Ordner | Inhalt |
|---|---|
| `src/` | Worker-Code. Läuft nur auf dem Server und wird nie ausgeliefert. |
| `public/` | Alles, was der Worker ausliefern darf: HTML-Seiten, Bilder, `setups.json`. Ist das Asset-Verzeichnis in `wrangler.jsonc`. |
| `discord-presence/` | Discord-Bot, läuft getrennt vom Worker |
| `tests/` | Tests, `npm test` |
| `tools/` | Hilfsskripte, z. B. `npm run check:deploy` |
| `setups/`, `audit-logs/` | Daten, nicht von Hand ändern |

- Worker-Code gehört nie nach `public/`. `npm run check:deploy` bricht ab, wenn dort ein Modul aus `src/` liegt.
- Geschützte Seiten liegen trotzdem in `public/`. Die Zugriffsprüfung passiert in den Routen des Workers.
- Der Worker liest Seiten aus `public/` zur Laufzeit über die GitHub API (`readSiteFile`) und fällt bei einem Fehler auf die deployten Assets zurück.
