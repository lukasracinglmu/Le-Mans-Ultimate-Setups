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

## Learnings

Nach jedem abgeschlossenen Issue ergänzen. Kurz halten.

### Deploy und Laufzeit

- Ein Merge auf `main` deployt den Worker automatisch (Cloudflare Workers Builds). Jeder PR bekommt eine Vorschau-URL im Check „Workers Builds“. Dort Änderungen vor dem Merge live prüfen.
- HTML-Seiten sind mit dem Merge sofort live, weil der Worker sie aus `main` liest.
- Der Bot läuft getrennt auf eigenem Host mit eigener `.env`, die hier nicht einsehbar ist. Änderungen am Bot dürfen keine neuen Variablen voraussetzen.

### Konfiguration

- IDs und Einstellungen nur über `src/config.js` aus `env` lesen, ohne Ersatzwerte im Code. Fehlt ein Wert, ist die Funktion aus (z. B. niemand ist Owner).
- Neue Pflichtvariablen in `REQUIRED_VARS` eintragen, dann prüft sie `npm run check:deploy`.
- Feste IDs, die Worker und Bot teilen (Whitelist, Rollen-Ersatzwert des Bots), stehen nur in `discord-presence/request-manufacturers.js`.
- Werte in `CLOUDFLARE-VARIABLEN.md` aus `wrangler.jsonc` übernehmen, nicht umgekehrt.

### Gemeinsame Hilfen (`src/lib/`)

- JSON-Antworten nur über `json()` aus `src/lib/http.js`. Es setzt Security-Header und `no-store`. Abweichendes `Cache-Control` oder `Retry-After` als dritten Parameter übergeben.
- GitHub-Anfragen über `githubRequest()` aus `src/lib/github.js`. `Accept`, Timeout und Redirect-Verhalten gibt der Aufrufer mit, weil sie sich bewusst unterscheiden. ZIP-Uploads haben z. B. kein Timeout.
- Die CSPs der HTML-Seiten (Wartungsseite, geschützte Seiten, Rest) unterscheiden sich bewusst. Nicht vereinheitlichen.
- Verhaltensgleichheit bei Refactorings per Routen-Schnappschuss prüfen: dieselben Anfragen durch die Worker-Kette auf `main` und auf dem Branch schicken, Status und Body vergleichen.

### `public/index.html`

- Die Datei ist die komplette Startseite. Kein Worker verändert HTML zur Laufzeit, `GET /` liefert sie unverändert aus. Lokal geöffnet sieht sie aus wie in Produktion. Ohne erreichbare API zeigt sie daher die Zugangsprüfung.
- Die Markierung `<meta name="lmu-runtime-patches" content="inline">` hat keine Funktion mehr und kann mit #16 entfallen.
- Änderungen über den Worker **und** direkt im Browser ohne Worker prüfen. Beides muss funktionieren.
- `tests/home-scripts.test.mjs` prüft, dass jedes Inline-Script parsebar ist. Ein Syntaxfehler legt sonst unbemerkt das ganze Script still.

### Übergänge

- Betrifft eine Änderung HTML und Worker-Code zugleich, in zwei PRs ausrollen. Die HTML ist mit dem Merge sofort live, der Worker erst nach dem Deploy. Zuerst den Worker so ändern, dass er beide Stände verträgt, erst nach dessen Deploy die HTML.
- Prüfscripte, die den Worker lokal ausführen, brauchen die Variablen aus `wrangler.jsonc`. Sonst liefern sie die 503-Fehlerseite. Immer Status 200 und echten Inhalt prüfen, bevor Ausgaben verglichen werden.

### Tests

- `npm test` führt Node- und Python-Tests aus. Node ≥ 22.13, wegen `node:sqlite`.
- Schlägt ein Test fehl, zuerst per `git log` klären, ob Code oder Test veraltet ist. Erwartungen nicht einfach anpassen.
- Mocks für D1, Discord und GitHub reagieren auf SQL-Text bzw. URLs. Neue Anweisungen oder Pfade brauchen passende Mocks. Anweisungen im Mock unterscheiden, nicht pauschal zählen.
- Tests, die Quelltext per Textsuche lesen, formatierungsunabhängig halten: `\s*` statt fester Leerzeichen, Funktionen per Klammerzählung herauslösen.
- Angepasste Tests per Gegenprobe absichern: Fehler im Code einbauen, der Test muss rot werden.
- Test-Umgebungen setzen benötigte Variablen wie `DISCORD_OWNER_USER_ID` ausdrücklich. Es gibt keine Ersatzwerte mehr, auf die sich ein Test verlassen könnte.
- Repo-Einstellungen in Tests per `...repositoryEnv` aus `tests/helpers/repository-env.mjs`. Die Werte kommen aus `wrangler.jsonc`.

### Repo-Pflege

- Dateien über die GitHub API dekodiert schreiben. `41f8878` hat mehrere Dateien Base64-kodiert eingecheckt, `CHANGELOG.md` ist es noch.
- Beim Verschieben von Dateien `area()` in `.github/changelog/update_changelog.py` mitziehen. Die Funktion ordnet Bereiche über Pfade zu.
- Formatierungs-Commits rein mechanisch halten (AST-identisch) und in `.git-blame-ignore-revs` eintragen. Solche PRs als Merge-Commit mergen, nicht squashen.
- CodeQL und Dependency Review brauchen in privaten Repos GitHub Code Security und laufen deshalb nur bei öffentlichem Repo.
- Automatische Ersetzungen (Regex, `sed`, `perl`) danach per `git diff` prüfen. Ein `|` als Trennzeichen bei Mustern mit `||` macht daraus eine leere Alternative, und der Text landet am Dateianfang.
