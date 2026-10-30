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
| `public/` | Alles, was der Worker ausliefern darf: HTML-Seiten, ihre Scripts in `public/js/`, Bilder, `setups.json`. Ist das Asset-Verzeichnis in `wrangler.jsonc`. |
| `discord-presence/` | Discord-Bot, läuft getrennt vom Worker |
| `tests/` | Tests, `npm test` |
| `tools/` | Hilfsskripte, z. B. `npm run check:deploy` |
| `setups/`, `audit-logs/` | Daten, nicht von Hand ändern |

- Worker-Code gehört nie nach `public/`. `npm run check:deploy` bricht ab, wenn dort ein Modul aus `src/` liegt.
- Geschützte Seiten liegen trotzdem in `public/`. Die Zugriffsprüfung passiert in den Routen des Workers.
- Seiten liefert der Worker aus den deployten Assets (`readPage`). Daten wie `setups.json` und die Herstellerbilder liest er live über die GitHub API (`readSiteFile`) und fällt bei einem Fehler auf die Assets zurück.

## Code-Stil

- JS, HTML und CSS: Tabs mit Breite 2, einfache Quotes, Semikolons, Trailing Commas nach ES5, 100 Zeichen pro Zeile.
- Die Einrückung steht in `.editorconfig`, der Rest in `.prettierrc.json`. Andere Dateitypen behalten Leerzeichen, Python 4.
- `npm run format` formatiert, `npm run format:check` prüft. Beides deckt `js`, `mjs`, `html` und `css` ab.

## Learnings

Nach jedem abgeschlossenen Issue ergänzen. Kurz halten.

### Deploy und Laufzeit

- Header in Produktion mit GET prüfen (`curl -s -D - -o /dev/null`), nicht mit `curl -I`. HEAD fällt bei `/` auf die Assets durch und bekommt andere Header.
- Ein Merge auf `main` deployt den Worker automatisch (Cloudflare Workers Builds). Jeder PR bekommt eine Vorschau-URL im Check „Workers Builds“. Dort Änderungen vor dem Merge live prüfen.
- Seiten, ihre Scripts und der Worker gehen mit demselben Deploy live. Nur Daten aus `readSiteFile` sind schon mit dem Merge live, weil der Worker sie aus `main` liest. Die PR-Vorschau zeigt deshalb die Seiten des PRs, aber die Daten aus `main`.
- Der Bot läuft getrennt auf eigenem Host mit eigener `.env`, die hier nicht einsehbar ist. Änderungen am Bot dürfen keine neuen Variablen voraussetzen.

### Konfiguration

- IDs und Einstellungen nur über `src/config.js` aus `env` lesen, ohne Ersatzwerte im Code. Fehlt ein Wert, ist die Funktion aus (z. B. niemand ist Owner).
- Neue Pflichtvariablen in `REQUIRED_VARS` eintragen, dann prüft sie `npm run check:deploy`.
- Feste IDs, die Worker und Bot teilen (Whitelist, Rollen-Ersatzwert des Bots), stehen nur in `discord-presence/request-manufacturers.js`.
- Werte in `CLOUDFLARE-VARIABLEN.md` aus `wrangler.jsonc` übernehmen, nicht umgekehrt.

### Gemeinsame Hilfen (`src/lib/`)

- JSON-Antworten nur über `json()` aus `src/lib/http.js`. Es setzt Security-Header und `no-store`. Abweichendes `Cache-Control` oder `Retry-After` als dritten Parameter übergeben.
- GitHub-Anfragen über `githubRequest()` aus `src/lib/github.js`. `Accept`, Timeout und Redirect-Verhalten gibt der Aufrufer mit, weil sie sich bewusst unterscheiden. ZIP-Uploads haben z. B. kein Timeout.
- Die CSPs unterscheiden sich bewusst: Wartungsseite, Seiten (`PAGE_CSP` in `src/runtime-worker.js`) und der Rest (`securityHeaders()`). Nicht vereinheitlichen.
- Verhaltensgleichheit bei Refactorings per Routen-Schnappschuss prüfen: dieselben Anfragen durch die Worker-Kette auf `main` und auf dem Branch schicken, Status und Body vergleichen.

### Seiten-Scripts (`public/js/`)

- Jede Seite hat `public/js/<seite>/main.js` als Einstieg, der nur die Teile startet. Die Teile daneben tun beim Import nichts, deshalb können Tests sie direkt importieren.
- `shared/theme.js` ist ein klassisches Script im `<head>`, damit kein falsches Theme aufblitzt. Alle anderen Scripts sind `type="module"`, außer vorerst die der Startseite.
- Keine Inline-Scripts und keine `on*`-Attribute. `tests/page-scripts.test.mjs` prüft das für jede umgestellte Seite, neue Seiten dort eintragen. Alle Seiten laufen mit `PAGE_CSP`, also `script-src 'self'`.
- Dateien in `public/` dürfen nicht wie Module in `src/` heißen. `npm run check:deploy` vergleicht nur Dateinamen und hält z. B. `public/js/bug-tickets.js` für Worker-Code.
- Umbauten im Browser gegen `main` vergleichen: derselbe Ablauf mit Mock-API auf beiden Ständen, der Branch mit der echten CSP. Dazu die String-Literale von altem und neuem Code vergleichen.
- agent-browser klickt auf Koordinaten. Liegt das Ziel außerhalb des Sichtbereichs, geht der Klick ohne Fehlermeldung ins Leere. Vorher per `scrollIntoView()` ins Bild holen.
- Unicode-Escapes wie `\u0300` in Regexen nach dem Schreiben per `grep` prüfen. Manche Werkzeuge schreiben stattdessen das Zeichen selbst.

### CSS (`public/css/`)

- Jede Seite hat `public/css/<seite>.css`, die Startseite `home.css`. Gemeinsames liegt in `public/css/shared/`, aber nur, wenn es wirklich gleich ist.
- Keine `<style>`-Blöcke und keine `style`-Attribute, auch nicht in HTML, das JS erzeugt. `PAGE_CSP` erlaubt nur `style-src 'self'`, Inline-Styles würden nicht greifen. `tests/page-styles.test.mjs` prüft das.
- Styles per `element.style` setzen bleibt erlaubt, das erfasst die CSP nicht.
- Inline-Styles schlagen jede Regel, eine Klasse nicht. Beim Umzug prüfen, welche Regeln dieselben Eigenschaften setzen, und dann ID-Selektoren nehmen.
- Fenster aus `window.open` erben die CSP der Seite. Was darin angezeigt wird, lädt seine Styles als Datei.
- Umzüge per Vergleich der berechneten Styles prüfen: `getComputedStyle` für jedes Element samt `::before` und `::after`, auf beiden Ständen und in mehreren Zuständen der Seite. Animationen vorher anhalten. Die Eigenschaften vor dem Vergleich sortieren, denn die Reihenfolge der CSS-Variablen folgt der Reihenfolge der Stylesheets. Die Origin aus aufgelösten URLs herausrechnen, falls beide Stände auf verschiedenen Ports laufen.

### `public/index.html`

- Die Datei ist die komplette Startseite. Kein Worker verändert HTML zur Laufzeit, `GET /` liefert sie unverändert aus.
- Die Scripts haben absolute Pfade wie `/js/home/app.js` und laden deshalb nicht per `file://`. Lokal über einen Server mit `public/` als Wurzel öffnen, z. B. `python3 -m http.server -d public`. Ohne erreichbare API zeigt die Seite die Zugangsprüfung.
- Die Scripts in `public/js/home/` sind noch klassische Scripts mit gemeinsamen Globals. `enhancements.js` ersetzt Funktionen aus `app.js` zur Laufzeit. Die Reihenfolge der `<script>`-Tags nicht ändern. Welche Globals eine Datei von anderen nutzt, steht in `/* global */` und `/* exported */` am Dateianfang.
- Buttons haben `data-action` statt `onclick`. `public/js/home/actions.js` bindet sie.
- Admin-Panel und Request-Formular gibt es nur noch als eigene Seiten (`/admin`, `/request`). Die Startseite hatte beide früher eingebaut, aber immer versteckt.
- `tests/home-scripts.test.mjs` prüft, dass die Startseite keine Inline-Scripts hat, dass jedes geladene Script parsebar ist und dass jeder Button seinen früheren Aufruf macht. Ein Syntaxfehler legt sonst unbemerkt das ganze Script still.

### Übergänge

- Seiten und Worker-Code brauchen keinen Übergang, sie gehen gemeinsam live. Ändern sich Daten aus `readSiteFile` (z. B. das Format von `setups.json`) und Worker zugleich, in zwei PRs ausrollen: zuerst den Worker so ändern, dass er beide Stände verträgt, erst nach dessen Deploy die Daten.
- Prüfscripte, die den Worker lokal ausführen, brauchen die Variablen aus `wrangler.jsonc`. Sonst liefern sie die 503-Fehlerseite. Immer Status 200 und echten Inhalt prüfen, bevor Ausgaben verglichen werden.

### Tests

- `npm test` führt Node- und Python-Tests aus. Node ≥ 22.13, wegen `node:sqlite`.
- Schlägt ein Test fehl, zuerst per `git log` klären, ob Code oder Test veraltet ist. Erwartungen nicht einfach anpassen.
- Mocks für D1, Discord und GitHub reagieren auf SQL-Text bzw. URLs. Neue Anweisungen oder Pfade brauchen passende Mocks. Anweisungen im Mock unterscheiden, nicht pauschal zählen.
- Tests, die Quelltext per Textsuche lesen, formatierungsunabhängig halten: `\s*` statt fester Leerzeichen, Funktionen per Klammerzählung herauslösen.
- Angepasste Tests per Gegenprobe absichern: Fehler im Code einbauen, der Test muss rot werden.
- `doesNotMatch`-Prüfungen werden still wirkungslos, wenn sich die Schreibweise ändert, z. B. Quotes durch Prettier. Auch sie per Gegenprobe absichern.
- Test-Umgebungen setzen benötigte Variablen wie `DISCORD_OWNER_USER_ID` ausdrücklich. Es gibt keine Ersatzwerte mehr, auf die sich ein Test verlassen könnte.
- Repo-Einstellungen in Tests per `...repositoryEnv` aus `tests/helpers/repository-env.mjs`. Die Werte kommen aus `wrangler.jsonc`.
- Ohne `...repositoryEnv` stellt der Worker gar keine GitHub-Anfrage. Ein Test, der „GitHub wird nicht gefragt“ prüft, wäre dann immer grün.

### Repo-Pflege

- Dateien über die GitHub API dekodiert schreiben. `41f8878` hat mehrere Dateien Base64-kodiert eingecheckt, `CHANGELOG.md` ist es noch.
- Beim Verschieben von Dateien `area()` in `.github/changelog/update_changelog.py` mitziehen. Die Funktion ordnet Bereiche über Pfade zu.
- Formatierungs-Commits rein mechanisch halten (AST-identisch) und in `.git-blame-ignore-revs` eintragen. Solche PRs als Merge-Commit mergen, nicht squashen.
- Beim AST-Vergleich `"a": 1` und `a: 1` als gleichen Schlüssel behandeln. `quoteProps: "as-needed"` entfernt unnötige Quotes.
- CodeQL und Dependency Review brauchen in privaten Repos GitHub Code Security und laufen deshalb nur bei öffentlichem Repo.
- Automatische Ersetzungen (Regex, `sed`, `perl`) danach per `git diff` prüfen. Ein `|` als Trennzeichen bei Mustern mit `||` macht daraus eine leere Alternative, und der Text landet am Dateianfang.
