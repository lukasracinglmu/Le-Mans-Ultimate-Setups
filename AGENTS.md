# AGENTS.md

Hinweise für KI-Agenten und Automatisierungen, die in diesem Repository arbeiten.

## Sprache

- Pull Requests: Titel und Beschreibung auf Deutsch.
- Fachbegriffe, Datei- und Funktionsnamen bleiben unverändert, z. B. `routes.js`, Branch, Commit.
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

- Worker-Code gehört nie nach `public/`. `npm run check:deploy` bricht ab, wenn dort eine Kopie eines Moduls aus `src/` liegt. Es vergleicht den Inhalt, gleiche Dateinamen sind erlaubt.
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

### Worker-Routing

- Einstieg ist `src/index.js`. Jede Route steht genau einmal in `src/routes.js`, und die erste passende antwortet. Vorher läuft die Middleware: Origin-Prüfung, dann Wartungsmodus.
- Routen ohne Eintrag liefert der Fallback als Datei aus `public/` aus (`staticFile()` in `src/features/assets.js`). Neue Routen nur in `routes.js` anlegen.
- Querschnitt einer Route als Hülle um den Handler: `withAccessSchema()` legt die Rechte-Tabellen an (bis #8), `withPermissionAudit()` protokolliert Rechteänderungen. Die Reihenfolge der Hüllen ist die Reihenfolge der Prüfungen.
- Handler liegen nach Aufgabe in `src/features/`, Querschnittsaufgaben in `src/middleware/`.
- Umbauten am Routing mit der Routen-Matrix prüfen. `node tools/route-matrix.mjs <checkout> <datei>` auf `main` und auf dem Branch laufen lassen, dann `node tools/compare-route-matrix.mjs` mit beiden Dateien. Jede Abweichung ist eine Verhaltensänderung.
- Eine Route in einer inneren Schicht kann toter Code sein, wenn eine äußere Schicht sie zuerst beantwortet. Vor dem Umzug prüfen, welche Variante wirklich greift.
- Auch interne Weiterleitungen zählen: Eine Schicht kann eine Anfrage per `new Request(...)` an eine tiefere Route schicken. Vor dem Löschen einer Route danach suchen.
- Die Routen-Matrix erreicht keine signierten Discord-Interaktionen. Die prüft `tests/discord-interactions.test.mjs` mit eigenem Schlüsselpaar.
- Ein `try` fängt nur, was darin mit `await` läuft. `return handler()` ohne `await` lässt den Fehler durch. Beim Umzug nur die Routen in `catchErrors()` hüllen, deren Fehler die alte Schicht wirklich gefangen hat.
- Tests mocken nur die Grenzen: GitHub und Discord über `globalThis.fetch`, D1 über `ACCESS_DB`. Interne Module rufen sie direkt auf und ersetzen sie nicht.
- Das Profil des Besuchers nur über `readMe()` aus `src/features/auth.js` lesen, nie per internem Request auf `/api/me`. Es ist dieselbe Antwort, nur ohne das erneuerte Session-Cookie.
- HTTPS-Pflicht gibt es nur auf den Routen des früheren Basis-Workers (`requireHttps()`), und `readMe()` wertet HTTP als abgemeldet. Als globale Middleware wäre sie eine Verhaltensänderung für alle anderen Routen.
- Die Routen-Matrix prüft auch Rollen: Ihre Sessions tragen einen gültigen Rollen-Snapshot, der Nutzer `stale` einen abgelaufenen, der Discord neu fragt.
- Die Matrix schickt jede Route zusätzlich per HTTP und ohne Rechte-Datenbank. So fallen fehlende oder vertauschte Hüllen (`requireHttps()`, `withAccessSchema()`) auf.
- `persistSetupFile()` fängt jeden GitHub-Fehler selbst ab. Ein unerwarteter Fehler beim Upload entsteht nur davor, z. B. beim Hashen der ZIP. Tests lösen ihn über `crypto.subtle.digest` aus.

### Gemeinsame Hilfen (`src/lib/`)

- JSON-Antworten nur über `json()` aus `src/lib/http.js`. Es setzt Security-Header und `no-store`. Abweichendes `Cache-Control` oder `Retry-After` als dritten Parameter übergeben.
- GitHub-Anfragen über `githubRequest()` aus `src/lib/github.js`. `Accept`, Timeout und Redirect-Verhalten gibt der Aufrufer mit, weil sie sich bewusst unterscheiden. ZIP-Uploads haben z. B. kein Timeout.
- Die CSPs unterscheiden sich bewusst: Wartungsseite, Seiten (`PAGE_CSP` in `src/features/pages.js`) und der Rest (`securityHeaders()`). Nicht vereinheitlichen.
- Verhaltensgleichheit bei Refactorings per Routen-Schnappschuss prüfen: dieselben Anfragen durch die Worker-Kette auf `main` und auf dem Branch schicken, Status und Body vergleichen.

### Seiten-Scripts (`public/js/`)

- Jede Seite hat `public/js/<seite>/main.js` als Einstieg, der nur die Teile startet. Die Teile daneben tun beim Import nichts, deshalb können Tests sie direkt importieren.
- `shared/theme.js` ist ein klassisches Script im `<head>`, damit kein falsches Theme aufblitzt. Alle anderen Scripts sind `type="module"`.
- Keine Inline-Scripts und keine `on*`-Attribute. `tests/page-scripts.test.mjs` prüft das für jede umgestellte Seite, neue Seiten dort eintragen. Alle Seiten laufen mit `PAGE_CSP`, also `script-src 'self'`.
- Umbauten im Browser gegen `main` vergleichen: derselbe Ablauf mit Mock-API auf beiden Ständen, der Branch mit der echten CSP. Dazu die String-Literale von altem und neuem Code vergleichen.
- agent-browser klickt auf Koordinaten. Liegt das Ziel außerhalb des Sichtbereichs, geht der Klick ohne Fehlermeldung ins Leere. Vorher per `scrollIntoView()` ins Bild holen.
- Beim Aufteilen großer Scripts Globals per `eslint-scope` umbenennen, nicht per Suchen und Ersetzen. Nur so bleiben gleichnamige lokale Variablen und Objekt-Schlüssel unberührt.
- Lokale Variablen verdecken gleichnamige Modulwerte. Meldet ESLint einen Modulwert als ungenutzt, obwohl er verwendet wird, ist das meist die Ursache.
- Unicode-Escapes wie `\u0300` in Regexen nach dem Schreiben per `grep` prüfen. Manche Werkzeuge schreiben stattdessen das Zeichen selbst.

### CSS (`public/css/`)

- Jede Seite hat `public/css/<seite>.css`, die Startseite `home.css`. Gemeinsames liegt in `public/css/shared/`, aber nur, wenn es wirklich gleich ist.
- Keine `<style>`-Blöcke und keine `style`-Attribute, auch nicht in HTML, das JS erzeugt. `PAGE_CSP` erlaubt nur `style-src 'self'`, Inline-Styles würden nicht greifen. `tests/page-styles.test.mjs` prüft das.
- Styles per `element.style` setzen bleibt erlaubt, das erfasst die CSP nicht.
- Inline-Styles schlagen jede Regel, eine Klasse nicht. Beim Umzug prüfen, welche Regeln dieselben Eigenschaften setzen, und dann ID-Selektoren nehmen.
- Fenster aus `window.open` erben die CSP der Seite. Was darin angezeigt wird, lädt seine Styles als Datei.
- In `home.css` stehen manche Grundregeln hinter den Media Queries, z. B. `.mfr-btn` und `.favorite-toggle`. Eine Regel für schmale Bildschirme gehört hinter ihre Grundregel, sonst greift sie nicht.
- Die Startseite mobil mit Mock-API prüfen, angemeldet mit allen Rechten und langem Namen. Erst dann sind alle Schnellzugriffe im Header, und Überlappungen fallen auf. Breiten: 360, 390 und 844 px (Querformat).
- Labels von Icon-Buttons nur visuell verstecken, nicht per `display: none`. Sonst hat der Link keinen zugänglichen Namen mehr.
- Umzüge per Vergleich der berechneten Styles prüfen: `getComputedStyle` für jedes Element samt `::before` und `::after`, auf beiden Ständen und in mehreren Zuständen der Seite. Animationen vorher anhalten. Die Eigenschaften vor dem Vergleich sortieren, denn die Reihenfolge der CSS-Variablen folgt der Reihenfolge der Stylesheets. Die Origin aus aufgelösten URLs herausrechnen, falls beide Stände auf verschiedenen Ports laufen.

### `public/index.html`

- Die Datei ist die komplette Startseite. Kein Worker verändert HTML zur Laufzeit, `GET /` liefert sie unverändert aus.
- Die Scripts haben absolute Pfade wie `/js/home/app.js` und laden deshalb nicht per `file://`. Lokal über einen Server mit `public/` als Wurzel öffnen, z. B. `python3 -m http.server -d public`. Ohne erreichbare API zeigt die Seite die Zugangsprüfung.
- Die Seite lädt nur `public/js/home/main.js`. Es startet die Module in fester Reihenfolge und verbindet sie. Zustand, den mehrere Module teilen, liegt in `state.js`, nicht in Globals.
- Die Module importieren sich nicht im Kreis. Wo ein Modul ein anderes aufrufen müsste, das es selbst importiert, übergibt `main.js` die Funktion: Bearbeiten und Löschen per `setSetupActions()`, die Fahrzeugauswahl per `initCatalog({ onSelectVehicle })`, die Schritte nach der Zugangsprüfung per `onAuthorized`.
- Buttons haben `data-action` statt `onclick`. `main.js` übergibt die Handler an `initActions()`.
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
- Angemeldete Nutzer in Tests per signiertem Cookie aus `tests/helpers/session.mjs`, nicht per gemocktem Profil. Der Owner aus `DISCORD_OWNER_USER_ID` braucht keine Discord-Abfrage. Für Rollen einen `memberSnapshot` mit `checkedAt: Date.now()` mitgeben, er gilt eine Minute.
- Session-IDs in Tests numerisch halten. Ohne Avatar rechnet `/api/me` mit `BigInt(id)` und wirft sonst.

### Repo-Pflege

- Dateien über die GitHub API dekodiert schreiben. `41f8878` hat mehrere Dateien Base64-kodiert eingecheckt, `CHANGELOG.md` ist es noch.
- Beim Verschieben von Dateien `area()` in `.github/changelog/update_changelog.py` mitziehen. Die Funktion ordnet Bereiche über Pfade zu.
- Formatierungs-Commits rein mechanisch halten (AST-identisch) und in `.git-blame-ignore-revs` eintragen. Solche PRs als Merge-Commit mergen, nicht squashen.
- Beim AST-Vergleich `"a": 1` und `a: 1` als gleichen Schlüssel behandeln. `quoteProps: "as-needed"` entfernt unnötige Quotes.
- CodeQL und Dependency Review brauchen in privaten Repos GitHub Code Security und laufen deshalb nur bei öffentlichem Repo.
- Automatische Ersetzungen (Regex, `sed`, `perl`) danach per `git diff` prüfen. Ein `|` als Trennzeichen bei Mustern mit `||` macht daraus eine leere Alternative, und der Text landet am Dateianfang.
