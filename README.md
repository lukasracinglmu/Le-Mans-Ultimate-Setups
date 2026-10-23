<p align="center">
  <a href="https://le-mans-ultimate-setups.3peaks-database.workers.dev/">
    <picture>
      <source media="(max-width: 600px)" srcset=".github/readme/hero-mobile.svg">
      <img src=".github/readme/hero.svg" alt="LMU Setup Database von Three Peaks Racing" width="1200">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://le-mans-ultimate-setups.3peaks-database.workers.dev/"><img src=".github/readme/open-database.svg" alt="Datenbank öffnen" width="232" height="56"></a>
  <a href="CHANGELOG.md"><img src=".github/readme/changelog.svg" alt="Changelog lesen" width="204" height="56"></a>
</p>

<h1 align="center">LMU Setup Database</h1>

<p align="center">
  Die Setup-Datenbank von <strong>Three Peaks Racing</strong> für Le Mans Ultimate.
</p>

<p align="center">
  <img src=".github/readme/specs.svg" alt="4 Fahrzeugklassen · maximal 50 ZIPs pro Auswahl · maximal 25 MiB pro Datei · maximal 40 Zeichen pro Version" width="1200">
</p>

## Was die Website kann

| Bereich | Funktionen |
| :--- | :--- |
| Setups | Suchen, filtern, herunterladen, hochladen und löschen |
| Upload | Bis zu 50 ZIPs, Fortschritt pro Datei und Wiederholung bei Fehlern |
| Versionen | Gemeinsame oder einzelne Versionen beim Upload, später über den Stift änderbar |
| Anzeigenamen | Eigener Name für Übersicht und Suche, ohne die ZIP umzubenennen |
| Alte Setups | Behalten, ersetzen, löschen oder deutlich als veraltet markieren |
| Discord | Anmeldung, Setup Requests, Rollenprüfung und Audit-Meldungen |
| Bugmeldungen | Beschreibung ab 3 Zeichen und optional ein Bild bis 5 MiB |

Der Bug-Button sowie die Filter für Klasse und Hersteller werden erst nach erfolgreicher Discord-Anmeldung angezeigt.

Unterstützt werden Hypercar, LMP2, LMP3 und LMGT3. Der aktuelle Fahrzeugkatalog steht in [`setups.json`](setups.json).

## Upload

1. Fahrzeug öffnen und „Setups hochladen“ wählen.
2. Eine oder mehrere ZIP-Dateien auswählen.
3. Version eintragen oder leer lassen.
4. Bei vorhandenen Setups auswählen, was mit der alten Datei passieren soll.
5. Upload starten und den Fortschritt verfolgen.

Bei mehreren Dateien fragt die Website, ob alle dieselbe Version haben. Bei „Ja“ gibt es ein gemeinsames Feld. Bei „Nein“ bekommt jede Datei ihr eigenes Feld.

| Grenze | Wert |
| :--- | :--- |
| Dateien pro Auswahl | 50 |
| Größe pro ZIP | 25 MiB |
| Version | Maximal 40 Zeichen, optional |
| Anzeigename | Maximal 160 Zeichen, optional |

Die Dateien werden nacheinander hochgeladen. Vorübergehende Fehler werden automatisch erneut versucht. Danach können nur die fehlgeschlagenen Dateien noch einmal gestartet werden.

## Vorhandene Setups

| Auswahl | Ergebnis |
| :--- | :--- |
| Behalten | Alte Datei bleibt bestehen. Die neue Datei wird separat gespeichert. |
| Als veraltet markieren | Alte Datei bleibt verfügbar und wird orange markiert. |
| Ersetzen | Die ausgewählte alte Datei wird durch den neuen Upload ersetzt. |
| Alte Datei löschen | Die neue Datei wird zuerst gespeichert, danach wird die alte gelöscht. |

Es werden nur passende Setups desselben Herstellers vorgeschlagen. GO, HYMO und beAlien werden über den Dateinamen erkannt.

## Version und Anzeigename bearbeiten

Über das Stift-Symbol können Version und Anzeigename später geändert werden. Beide Felder sind optional.

Der Anzeigename erscheint nur auf der Website und wird bei der Suche berücksichtigt. Dateiname, Downloadname und Speicherpfad der ZIP bleiben unverändert. Ein leeres Feld setzt den Anzeigenamen zurück.

## Rechte

Die Rollen werden auf dem Discord-Server `1464926567401652418` geprüft.

| Rolle | ID | Zugriff |
| :--- | :--- | :--- |
| Team | `1464926567401652420` | Datenbank ansehen und Setups herunterladen |
| Setup Supply | `1538601074074849330` | Hochladen, löschen und bearbeiten |
| Owner | `1464926567401652423` | Admin-Panel und persönliche Freigaben verwalten |
| Persönlicher Owner | `1033453785416208564` | Vollständiger Zugriff |

Die Owner-Rolle allein darf keine Setups verändern. Dafür wird zusätzlich Setup Supply oder eine persönliche Upload-Freigabe benötigt.

## Admin-Panel

Owner können eine Discord User ID eingeben und folgende Rechte verwalten:

| Button | Wirkung |
| :--- | :--- |
| Database freigeben | Datenbank ansehen |
| Upload/Delete freigeben | Setups zusätzlich verändern |
| Alles freigeben | Beide Rechte erteilen |
| Alles entfernen | Beide persönlichen Rechte entfernen |

Discord-Rollen werden dabei nicht verändert. In der Liste stehen kurze Beschreibungen wie „Datenbank nur ansehen“ oder „Datenbank ansehen, Setups ändern“.

## Setup Requests und Bugmeldungen

Setup Requests werden an den eingestellten Discord-Kanal geschickt. Ab drei eingegebenen Buchstaben schlägt die Website passende Fahrzeuge vor und setzt die Klasse automatisch. Die Setup-Supply-Rolle wird erwähnt.

Der rote Button „Bug melden“ führt zu einer eigenen Seite. Angemeldete Nutzer können das Problem beschreiben und optional ein PNG-, JPG- oder WebP-Bild anhängen. Der Bot sendet die Meldung per DM an den Betreiber. Es gibt keinen eigenen Cooldown.

## Speicherung

| Daten | Speicherort |
| :--- | :--- |
| Setup-ZIPs und Fahrzeugkatalog | GitHub |
| Versionen, Anzeigenamen und persönliche Rechte | Cloudflare D1 |
| Audit-Logs | GitHub und Discord |
| Zugangsdaten | Cloudflare Secrets |

Bugtexte und Bilder werden direkt an Discord übertragen. Sie werden nicht in GitHub oder D1 gespeichert.

## Wichtige Dateien

| Datei oder Ordner | Inhalt |
| :--- | :--- |
| [`runtime-worker.js`](runtime-worker.js) | Einstiegspunkt des Workers |
| [`index.html`](index.html) | Oberfläche |
| [`setups.json`](setups.json) | Fahrzeugkatalog |
| [`setups/`](setups) | Setup-Dateien |
| [`schema.sql`](schema.sql) | D1-Tabellen |
| [`wrangler.jsonc`](wrangler.jsonc) | Cloudflare-Konfiguration |
| [`CLOUDFLARE-VARIABLEN.md`](CLOUDFLARE-VARIABLEN.md) | Variablen und ihre Aufgaben |
| [`audit-logs/`](audit-logs) | Änderungsprotokolle |
| [`CHANGELOG.md`](CHANGELOG.md) | Projekthistorie |

## Einrichtung

Benötigt werden ein Cloudflare Worker, eine D1-Datenbank, ein GitHub-Repository und eine Discord-Anwendung mit Bot.

```bash
git clone https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups.git
cd Le-Mans-Ultimate-Setups
npx wrangler@4 d1 execute ACCESS_DB --local --file=./schema.sql
npx wrangler@4 deploy --dry-run
```

Diese Werte werden als Secrets gesetzt:

```bash
npx wrangler@4 secret put DISCORD_CLIENT_SECRET
npx wrangler@4 secret put DISCORD_BOT_TOKEN
npx wrangler@4 secret put GITHUB_TOKEN
npx wrangler@4 secret put SESSION_SECRET
```

Die übrigen IDs und Namen stehen in [`wrangler.jsonc`](wrangler.jsonc). Für eine andere Instanz müssen Repository, Datenbank, Discord-App, Rollen, Kanäle und `SITE_URL` angepasst werden.

Der Discord-Redirect lautet:

```text
https://DEINE-DOMAIN/auth/discord/callback
```

## Changelog

[`CHANGELOG.md`](CHANGELOG.md) enthält die Änderungen am Projekt. Die Automation arbeitet ohne KI-API.

Details zur Automation stehen in [`.github/changelog/README.md`](.github/changelog/README.md).

## Wenn etwas nicht funktioniert

| Problem | Prüfen |
| :--- | :--- |
| Kein Datenbankzugriff | Discord-Rolle oder persönliche Freigabe |
| Upload nicht erlaubt | Setup-Supply-Rolle oder Upload-Freigabe |
| Admin-Panel fehlt | Owner-Rolle oder persönliche Owner-ID |
| ZIP wird abgelehnt | Dateiendung, Inhalt und Größe |
| Request kommt nicht an | Bot-Token, Kanal-ID und Kanalrechte |
| Audit fehlt | GitHub-Token und Audit-Kanal |

Bei Uploadproblemen zuerst den Status der einzelnen Datei lesen. Bereits erfolgreiche Dateien werden beim Fehler-Retry nicht erneut hochgeladen.

<p align="center">
  <img src=".github/readme/footer.svg" alt="Three Peaks Racing" width="1200">
</p>
