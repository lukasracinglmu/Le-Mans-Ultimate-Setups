# Changelog

Alle relevanten Änderungen an Website, Discord-Integration, Setup-Verwaltung, GitHub und Cloudflare werden hier dokumentiert. Secrets, Tokens, Passwörter und vertrauliche User-Daten werden nicht eingetragen.

Nachtrag vom 22. Oktober 2026: Die Ergänzungen wurden mit der GitHub-Historie und dem Code abgeglichen. Die Datumsabschnitte nennen den Tag der jeweiligen Änderung; frühere Einträge bleiben als historischer Stand erhalten. Grundlage für die jüngeren Änderungen ist der [Vergleich der 34 Commits seit dem letzten Changelog-Stand](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/compare/e0ff1e0a0f4db39c5c2eb096321a698681734e23...068e0849a0ae219c8281d5572296ea80c6ae3428).

## 2026-10-22 – Nachtrag

### Weitere Setup-Aktivitäten

- Seit dem vorherigen dokumentierten Stand wurden 14 ZIP-Uploads und 12 ZIP-Löschungen in der GitHub-Historie erfasst. Dazu kamen 25 Audit-Commits, davon 1 zur Versionsänderung. Dies beschreibt die zwischenzeitliche Nutzung der Website, nicht Testlöschungen dieser Änderung. [Änderungsverlauf](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/compare/f3cfa8cf0eb06270a70e0a891e9b80ae0138a7fc...8b8a84b985bb18d59dd396d05cdf007c5e81d298).

### Session Upload Progress

- Zusätzliche Fortschrittsanzeige direkt im bestehenden Upload-Bereich ergänzt.
- Die Anzeige enthält die Gesamtzahl der ZIP-Dateien, die Anzahl abgeschlossener Versuche, den aktuellen Dateinamen, einen Prozentwert und einen Fortschrittsbalken.
- Der Fortschritt wird aus dem echten Zähler der Upload-Schleife berechnet. Es gibt keine zeitgesteuerte Simulation.
- Erfolgreiche und fehlgeschlagene Upload-Versuche zählen beide als verarbeitet. Fehlgeschlagene Dateien behalten ihren eigenen Fehlerstatus.
- Nach Abschluss aller Versuche erreicht die Anzeige `100 %`, auch wenn einzelne Dateien fehlgeschlagen sind.
- Jeder neue Upload-Vorgang startet bei null. Ein Retry startet eine eigene Berechnung nur für die fehlgeschlagenen Dateien; erfolgreiche Dateien werden nicht erneut hochgeladen.
- Beim Öffnen einer Fahrzeugansicht wird die vorherige Fortschrittsanzeige ausgeblendet.
- Fortschrittswert und Statusänderungen sind über ARIA-Attribute auch für Screenreader ausgezeichnet.
- Der bestehende Upload bleibt strikt sequenziell mit Concurrency `1`. Upload-API, Reihenfolge, Versionszuordnung, Retry und Aktualisierung nach dem Upload wurden für diese Ergänzung nicht umgebaut.

### Browser-Tab / Favicon

- Das vorhandene goldene 3P-Logo unter `assets/header-logo.webp` als Favicon eingebunden.
- Der HTML-Eintrag verwendet `rel="icon"`, den MIME-Type `image/webp` und den lokalen Pfad `/assets/header-logo.webp?v=3p1`.
- Die Version im Favicon-Pfad berücksichtigt den Browser-Cache; globale Cache-Einstellungen bleiben unverändert.
- Die am 20. Oktober ergänzte `assets/favicon.png` ist nicht lesbar und wird deshalb nicht als Favicon verwendet.
- Das sichtbare Header-Logo wurde nicht verändert. Die Umsetzung von Session Progress und Favicon war auf `index.html` begrenzt.

Belege: [Session Progress und Favicon](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/068e0849a0ae219c8281d5572296ea80c6ae3428).

### Ergänzt

- Vor dem Upload vorhandene Dateien desselben Herstellers und Fahrzeugs auswählen: behalten, als veraltet markieren oder nach bestätigtem Upload ersetzen. SHA-Prüfungen schützen inzwischen geänderte Dateien; die Veraltet-Markierung bleibt an den gespeicherten Dateiinhalt gebunden. ([Commit 44309fc](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/44309fc3ed7c618e7983df8851de9a945da56e8c))

- Fahrzeugvorschläge ab drei eingegebenen Buchstaben mit automatischer und serverseitig geprüfter Klasse für Website-Setup-Requests ergänzt; die Strecke bleibt freie Texteingabe. ([Commit 44309fc](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/44309fc3ed7c618e7983df8851de9a945da56e8c))

- Persönliche Owner-ID und Owner-Rolle getrennt konfigurierbar gemacht; vollständigen Zugriff des persönlichen Owners erhalten. ([Commit 83ab551](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/83ab5516a7dcd24db8d659df1dfbcdab8eb51692))

- Automatische Changelog-Erstellung: 4 Dateien hinzugefügt. Betroffen: `.github/changelog/README.md`, `.github/changelog/changelog.yml.example`, `.github/changelog/test_update_changelog.py`, `.github/changelog/update_changelog.py`. ([Commit 6367e97](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/6367e9761f636763828506f44d26fad7ce65f097))

- GitHub-Automationen: 1 Datei hinzugefügt. Betroffen: `.github/workflows/changelog-check.yml`. ([Commit 6367e97](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/6367e9761f636763828506f44d26fad7ce65f097))

- Automatische Changelog-Pflege ohne KI-Dienst oder API-Schlüssel ergänzt. ([Commit 59246ad](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/59246ade9778d878bb22cc27fa70e3e8f16df504))

- Vor Mehrfach-Uploads die Auswahl zwischen gemeinsamer Version und optionalen Versionsfeldern je ZIP ergänzt. ([Commit 0e1d00e](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/0e1d00e3eba08b3a81fd92e87311028fcb8d1266))

- Bis zu fünf Upload-Versuche je Datei mit steigenden Pausen, Berücksichtigung von GitHub-Limits und sichtbaren Fehlerursachen ergänzt. ([Commit 986a76a](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/986a76a969c4134693a07871bcab46ed2e517125))

### Geändert

- Die Auswahl „Ja“ bei gleicher Setup-Version öffnet jetzt zunächst ein gemeinsames optionales Versionsfeld. Erst die Bestätigung setzt den Upload fort. ([Commit 44309fc](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/44309fc3ed7c618e7983df8851de9a945da56e8c))

- Teamrolle für lesenden Zugriff, Setup Supply für Setup-Änderungen und Owner-Rolle für externe Datenbankfreigaben auf dem angegebenen Discord-Server eingerichtet. ([Commit 83ab551](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/83ab5516a7dcd24db8d659df1dfbcdab8eb51692))

- Deutsche Einträge werden aus Changelog-Abschnitten der Commit-Nachrichten oder aus festen Regeln für die geänderten Dateien erzeugt. ([Commit 59246ad](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/59246ade9778d878bb22cc27fa70e3e8f16df504))

- Setup- und Audit-Aktionen werden gesammelt mit Datum und Commit-Verweisen dokumentiert. ([Commit 59246ad](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/59246ade9778d878bb22cc27fa70e3e8f16df504))

- Changelog-Workflows starten ausschließlich bei öffentlichen Repositories auf kostenlosen Standard-Runnern. ([Commit 59246ad](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/59246ade9778d878bb22cc27fa70e3e8f16df504))

- Uploads ohne Versionsangabe erlaubt; erneute Upload-Versuche behalten die Version jeder Datei. ([Commit 0e1d00e](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/0e1d00e3eba08b3a81fd92e87311028fcb8d1266))

- ZIP-Daten nur einmal eingelesen, größere JSON-Kopien vermieden und Upload-Audit vor der nächsten Datei abgeschlossen. ([Commit 986a76a](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/986a76a969c4134693a07871bcab46ed2e517125))

- Cloudflare-Neubuilds bei reinen Setup-, Audit-, Changelog- und README-Änderungen abgeschaltet; ZIP-Dateien bleiben direkt aus GitHub verfügbar. ([Commit 2dade51](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/2dade518ba24c3bc255466a81b1d00c73854e554))

### Entfernt

- Auf Wunsch des Repository-Inhabers alle 363 Setup-ZIPs aus dem aktiven Bestand entfernt. Die Einzellöschungen sind im Audit-Protokoll erfasst; die zugehörigen Versionsdaten werden ebenfalls bereinigt.

- Die vorbereitete kostenpflichtige KI-Anbindung und ihre inaktive Workflow-Vorlage entfernt. ([Commit 59246ad](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/59246ade9778d878bb22cc27fa70e3e8f16df504))

### Dokumentation

- Cloudflare-Variablen, Secrets und Berechtigungen in der README erklärt. ([Commit 83ab551](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/83ab5516a7dcd24db8d659df1dfbcdab8eb51692))

- README mit Schwarz-Gold-Banner, mobilen Grafiken, direkten Links und einer kompakten Funktionsübersicht neu gestaltet. ([Commit 2787af6](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/2787af6025c6ed19e7d5aa417a604bceecd8d79c))

- Architektur, Zugangsrechte und Upload-Ablauf übersichtlich dokumentiert und den kostenlosen automatischen Changelog verlinkt. ([Commit 2787af6](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/2787af6025c6ed19e7d5aa417a604bceecd8d79c))

- README um Fahrzeugklassen, Upload-Grenzen, Versionsregeln, Rechte, Discord-Anbindung und Audit-Ereignisse erweitert. ([Commit 0692344](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/069234419c7260d575f1a47ccdc9002b552b8bdc))

- Datenhaltung, Worker-Schichten, API-Routen, Schutzmechanismen und Betrieb mit Diagrammen und Tabellen erklärt. ([Commit 0692344](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/069234419c7260d575f1a47ccdc9002b552b8bdc))

- Kompakteres 3P-Banner, nummerierte Abschnittsgrafiken und eine Übersicht der Upload-Grenzen ergänzt. ([Commit 0692344](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/069234419c7260d575f1a47ccdc9002b552b8bdc))

- README um Einrichtungsschritte, D1-Beispielschema, API-Datenformate, Admin-Abläufe und den vollständigen Fahrzeugkatalog ergänzt. ([Commit 15dd511](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/15dd511893b7b6510f87138363c5357396e90641))

- Upload-Teilerfolge, Rollenprüfungen, Dateinamenserkennung, Audit-Zustellung und Schutzgrenzen genauer beschrieben. ([Commit 15dd511](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/15dd511893b7b6510f87138363c5357396e90641))

- Fehlersuche, Betriebsprüfungen, Sicherung und Wiederherstellung mit einem eigenen Diagnosebereich ergänzt. ([Commit 15dd511](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/15dd511893b7b6510f87138363c5357396e90641))

- Presence-Beschreibung an die erlaubten Discord-Bot-Aktivitätsfelder angepasst. ([Commit 15dd511](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/15dd511893b7b6510f87138363c5357396e90641))

- README um Versionsauswahl, optionale Felder und Prüfbefehl erweitert. ([Commit 0e1d00e](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/0e1d00e3eba08b3a81fd92e87311028fcb8d1266))

- README um Wiederholungen, Inhaltsprüfung und Grenzen der Erfolgsquote erweitert. ([Commit 986a76a](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/986a76a969c4134693a07871bcab46ed2e517125))

### Setup-Bestand / Audit-Protokoll

- ZIP-Dateien: 1 hinzugefügt, 0 entfernt und 0 geändert.
- Audit-Dateien: 3 ergänzt, geändert oder entfernt. Darin neu protokolliert: 1 Upload, 0 Löschungen, 0 Versionsspeicherungen, 2 Rechteänderungen.
- Belege: [Commits](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/compare/0d606c91fec0dc4f9eb11959dc43e87d46dd9787...f968a3961508f5ea7877c18b2ae6bfe90c790210).

- ZIP-Dateien: 23 hinzugefügt, 363 entfernt und 0 geändert.
- Audit-Dateien: 382 ergänzt, geändert oder entfernt. Darin neu protokolliert: 19 Uploads, 363 Löschungen, 0 Versionsspeicherungen, 0 Rechteänderungen.
- Belege: [Commits](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/compare/0d3afab25e3555d6bd48a1381e5dd64a2a0103b6...1f916a518ec9a1649fa090298277ede54848d5a8).

### Behoben

- Löschvorgänge gegen gleichzeitige GitHub-Änderungen und verlorene Antworten abgesichert. Der Dialog sperrt doppelte Aktionen; die sichtbare Liste wird nach bestätigtem Löschen sofort aktualisiert. ([Commit 44309fc](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/44309fc3ed7c618e7983df8851de9a945da56e8c))

- Für Setup-Requests die Rolle `1538601074074849330` und eine gezielte `allowed_mentions`-Freigabe eingerichtet. ([Commit 44309fc](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/44309fc3ed7c618e7983df8851de9a945da56e8c))

- Weiterleitungsschleife auf der Startseite nach Umstellung des Repositorys auf privat beseitigt. ([Commit f3cfa8c](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/f3cfa8cf0eb06270a70e0a891e9b80ae0138a7fc))

- Startseite, Fahrzeugkatalog, Anbieterbilder und Setup-ZIPs werden serverseitig authentifiziert gelesen. GitHub-Ausfälle verwenden verfügbare statische Website-Dateien ohne erneute Weiterleitung; Discord-Zugriffsprüfungen bleiben aktiv. ([Commit f3cfa8c](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/f3cfa8cf0eb06270a70e0a891e9b80ae0138a7fc))

- GitHub-Zielpfad beim Löschen eines Setups korrigiert. ([Commit 83ab551](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/83ab5516a7dcd24db8d659df1dfbcdab8eb51692))

- Setup-Request-Pings von Schreibrechten getrennt und Berechtigungsprüfungen der Worker-Schichten vereinheitlicht. ([Commit 83ab551](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/83ab5516a7dcd24db8d659df1dfbcdab8eb51692))

- Fehlerhafte Rückgabe nach Abschluss eines Upload-Vorgangs korrigiert. ([Commit 0e1d00e](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/0e1d00e3eba08b3a81fd92e87311028fcb8d1266))

- Verlorene Upload-Antworten durch Prüfung der Git-Blob-Prüfsumme abgefangen; identische ZIPs werden bestätigt und andere Inhalte nicht überschrieben. ([Commit 986a76a](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/986a76a969c4134693a07871bcab46ed2e517125))

- Versionsspeicherung nach einem Teilerfolg erneut versucht und ursprüngliche Dateinamen in der Erfolgszuordnung berücksichtigt. ([Commit 986a76a](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/986a76a969c4134693a07871bcab46ed2e517125))

### Wartung

- D1-Status-Tabelle `setup_lifecycle`, Audit-Ereignis für veraltete Setups, Regressionstests und README ergänzt. Validierung: 53 Node-Tests, 19 UI-Szenarien und 23 Changelog-Tests erfolgreich. ([Commit 44309fc](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/44309fc3ed7c618e7983df8851de9a945da56e8c))

- Regressionstests für private Dateien, Weiterleitungen und Berechtigungen ergänzt; README für das private Repository aktualisiert. ([Commit f3cfa8c](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/f3cfa8cf0eb06270a70e0a891e9b80ae0138a7fc))

- Rollen, externe Freigaben und verweigerte Zugriffe mit automatisierten Tests geprüft. ([Commit 83ab551](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/83ab5516a7dcd24db8d659df1dfbcdab8eb51692))

- Tests für optionale Upload-Versionen und die getrennte Speicherung je Datei ergänzt. ([Commit 0e1d00e](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/0e1d00e3eba08b3a81fd92e87311028fcb8d1266))

- Tests für Netzwerkausfälle, GitHub-Konflikte, Rate-Limits und Versionsfehler sowie einen kostenlosen Prüfworkflow ergänzt. ([Commit 986a76a](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/986a76a969c4134693a07871bcab46ed2e517125))

## 2026-10-20 – Nachtrag

### LMU Portal / Upcoming Races entfernt

- Die LMU-Portal-Anbindung aus `production-worker.js` entfernt: API-Abruf, Zeitüberschreitung, Normalisierung der Renndaten sowie die zugehörigen Cache-Helfer.
- Den bisherigen Handler für `/api/upcoming-races` und die Einbindung des Upcoming-Races-Widgets entfernt.
- Die dazugehörige Darstellung mit Rennfiltern, SR-/Tier-Anzeigen, Countdowns und regelmäßigen Aktualisierungen aus dem Production-Renderer entfernt.
- Verweise auf LMU Portal und Upcoming Races anschließend aus dem README entfernt.
- Der Schemaeintrag `lmu_schedule_cache` ist weiterhin in `schema.sql` vorhanden. Der Commit enthält keine Datenbankmigration zum Löschen der Tabelle.
- Den vorherigen Stand im Branch `backup-before-remove-lmuportal-20261020` festgehalten.

### Favicon-Vorbereitung

- `assets/favicon.png` zum Repository hinzugefügt. Die funktionierende Einbindung über das vorhandene WebP-Logo folgte am 22. Oktober.

Belege: [Integration entfernt](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/da786daee8d86287cc7672251cc9387cbf726764) · [README bereinigt](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/ee2b6b1bc84b410901d68772f67c40fdd07428c6) · [PNG-Asset ergänzt](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/e01dc10fc7bccb2fb8adccd203f48bef46fd37bd).

## 2026-10-19 – Nachtrag

### Gespeicherte Setup-Versionen

- Zwei Audit-Einträge für das Speichern der Version von `Lexus Qatar HYMO.zip` ergänzt.
- Der erste Eintrag setzt die Version auf `1.4.2`; der zweite protokolliert das erneute Speichern von `1.4.2` auf denselben Wert.
- Diese Commits enthalten Audit-Metadaten und keine erneut hochgeladene Setup-ZIP.

Belege: [Version gespeichert](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/364afc228c0bfac797ee8b6326bbcb471ab65c71) · [Erneutes Speichern protokolliert](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/7ae77274b3c6fc03870370d9be3bb323fb6b6e2f).

## 2026-10-18 – Nachtrag

### README / Repository-Darstellung

- Eine README-Neugestaltung mit dem neuen SVG-Banner `assets/banner.svg` eingecheckt.
- Diese README-Neugestaltung anschließend zurückgenommen und den vorherigen README-Inhalt wiederhergestellt.
- Danach Abstände, Überschriften, Tabellen und die visuelle Gliederung des README überarbeitet.
- Das SVG-Banner blieb nach der Rücknahme als Asset im Repository erhalten; das aktuelle README bindet es nicht ein.

Belege: [README und Banner](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/b320fe6e1aebcbb0c6455ba4614be33a8ffe34f4) · [README wiederhergestellt](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/8dc260373a52a8c3768af937d78d5a738df7be09) · [Abschließende Gestaltung](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/1a3a238e68bf32991009659a15c7331a1d7d1307).

## 2026-10-16 – Nachtrag

### Audit-Logs für Setups

- `audit-log.js` als zentrales Modul zur Protokollierung von Setup-Aktionen ergänzt.
- Erfolgreiche Uploads, Löschungen und gespeicherte Versionsänderungen lösen serverseitig die Ereignisse `SETUP_UPLOAD`, `SETUP_DELETE` und `SETUP_VERSION_UPDATE` aus.
- Für jedes Ereignis wird eine eigene JSON-Datei unter `audit-logs/JJJJ-MM/` im konfigurierten GitHub-Branch gespeichert. UTC-Zeitstempel und zufällige ID machen die Dateinamen eindeutig.
- Die Ereignisse enthalten den ausführenden Discord-Account sowie die verfügbaren Setup-Angaben, zum Beispiel Datei, Fahrzeug, Hersteller und Version.
- Der Hersteller wird aus dem Dateinamen ermittelt. Das Feld `track` wird ebenfalls aus dem Dateinamen abgeleitet und ist keine unabhängig geprüfte Streckenangabe.
- Bei Versionsänderungen werden der zuvor gespeicherte Wert und der neue Wert protokolliert, soweit vorhanden.
- Nur vom jeweiligen Endpunkt als erfolgreich bestätigte Aktionen erzeugen diese Erfolgseinträge.
- Die Log-Aufgaben werden über `ctx.waitUntil` weitergeführt, sofern verfügbar. Ein Fehler beim Schreiben des Logs macht eine bereits ausgeführte Setup-Aktion nicht nachträglich erfolglos.

### Audit-Logs für Berechtigungen

- Vergabe und Entzug individueller Database- und Upload/Delete-Freigaben in die Protokollierung aufgenommen.
- Die Ereignisse `PERMISSION_GRANT` und `PERMISSION_REVOKE` enthalten ausführenden Nutzer, betroffenen Nutzer, Berechtigungsart und Zustandswechsel.
- Diese Protokollierung sitzt im Runtime-Layer und erfolgt nach einer erfolgreichen Antwort der bestehenden Rechteverwaltung.

### Discord-Ausgabe der Audit-Logs

- `DISCORD_AUDIT_CHANNEL_ID` in der Worker-Konfiguration ergänzt.
- Nach erfolgreicher Speicherung in GitHub werden die Ereignisse zusätzlich als Discord-Embed an den konfigurierten Audit-Kanal gesendet.
- Deutsche Titel für Upload, Löschen, Versionsänderung und Rechtevergabe beziehungsweise Rechteentzug ergänzt.
- Ausführenden Nutzer und bei Rechteänderungen auch den betroffenen Nutzer als Discord-Mention dargestellt.
- `allowed_mentions` beschränkt die erlaubten Mentions auf die geprüften beteiligten Nutzer-IDs.
- Fehler beim Discord-Versand werden abgefangen; der zuvor gespeicherte GitHub-Eintrag bleibt bestehen.

### Admin-Erkennung / Rechteverwaltung

- Admin-Erkennung in `/api/me` und in der Admin-Oberfläche auf `isAdmin` abgestimmt. Der Owner wird dabei als Admin erkannt.
- Upload/Delete-Freigabe-Endpunkte prüfen die Admin-Berechtigung bereits im Access-Layer vor der Weiterleitung.
- Die zusätzliche individuelle Database-Freigabe bei Vergabe von Upload/Delete Access bleibt erhalten.

### Browser-Navigation / Discord-Anmeldung

- Fahrzeugübersicht und Fahrzeugansichten mit `history.replaceState`, `history.pushState` und `popstate` an die Browser-History angebunden.
- Browser-Zurück, Maustasten und `Alt + Pfeil links` können damit aus einer Fahrzeugansicht zur vorherigen App-Ansicht zurückführen; Vorwärts stellt die gespeicherte Fahrzeugansicht wieder her.
- Der vorhandene Zurück-Button nutzt beim Verlassen einer Fahrzeugansicht die Browser-History.
- Die vorhandenen Funktionen für Ansichtswechsel, Filter und Scrollposition bleiben Grundlage der Navigation.
- Nach erfolgreichem OAuth-Callback wird die Anwendung über eine kurze HTML-Antwort mit `window.location.replace` geöffnet. Für deaktiviertes JavaScript ist eine Meta-Refresh-Weiterleitung enthalten.
- Die Callback-Antwort setzt die Session, entfernt den OAuth-State-Cookie und wird mit `Cache-Control: no-store` ausgeliefert.

### Core-Worker / technische Korrekturen

- Einen Syntaxfehler im Session-Parser korrigiert.
- Erstellung und Prüfung der HMAC-Sessions auf die Web-Crypto-Helfer mit `crypto.subtle.sign` beziehungsweise `crypto.subtle.verify` abgestimmt; Base64url-Konvertierung und Cookie-Helfer angepasst.
- Die Startseite wird im Core-Worker aus `env.ASSETS` statt über einen GitHub-Raw-Abruf geladen.
- GitHub-API-Helfer, Dateinamen-Normalisierung, ZIP-Verarbeitung und Download-Weiterleitung im Core-Worker überarbeitet. Die Binärdaten-Konvertierung nach Base64 erfolgt in Blöcken.
- Im Core-Worker vorhandene Platzhalter für Discord-Kanäle, Nachrichten, Requests, Slash-Command-Registrierung und Interactions wieder durch Handler ersetzt. Diese enthalten Kanalberechtigungsprüfungen beziehungsweise die Prüfung von Discord-Interaction-Signaturen.
- Die Download-Weiterleitung für individuell freigegebene Nutzer im Access-Layer auf einen expliziten `Accept: application/octet-stream`-Header angepasst.

### Setup-Bestand / gespeicherte Ereignisse

- `Duqueine Laguna Seca GO.zip` beim Fahrzeug Duqueine D09 gelöscht und die Löschung als JSON-Audit gespeichert.
- Das Speichern von `Toyota COTA HYMO.zip` mit Version `1.4.2` protokolliert.
- Erste JSON-Audit-Dateien für Vergabe und Entzug von Database Access eingecheckt. Einzelne Nutzer-IDs und Accountdaten werden hier nicht wiederholt.

### README-Bildverweise

- Logo-Darstellung im README korrigiert und die Verweise auf vorhandene gültige Repository-Assets angepasst.

Belege: [Setup-Audits und Admin-Erkennung](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/2acac0cb3ae281a411c53067667ac3b7d2efd6e1) · [Rechte-Audits](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/fd82cecb06518225400b1859a111a02712ce9dd5) · [Discord-Audits](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/8937efb050a8b92b1b49c918b400730cd0eff229) · [Beide Nutzer in Audit-Mentions](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/7007878490f6e6faf152c91d65755a83fdcb72fe) · [Browser-History](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/37b1ba3df830af8c25a5057a48d4d52f36467f27) · [OAuth-Abschluss und Core-Worker](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/cccd737a0ef6522e514ddf3ea9ed780453854c31) · [Parser-Korrektur](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/5e8df43a11326cc6b9edc0fde0d0c0baf318fbf5) · [README-Assets](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/cb544034e2a921ef058ae8d8311b7c5ab441ac9f).

## 2026-10-15 – Nachtrag

### Setup-Bestand

- `BMW V8 Le Mans GO.zip` beim BMW M Hybrid V8 hinzugefügt und am selben Tag wieder gelöscht. Daraus entstand kein dauerhafter Zuwachs im Setup-Bestand.

Belege: [Setup hinzugefügt](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/8b27894e180e16d6e87969bc2c63d3d15261a2b3) · [Setup wieder gelöscht](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/4c6bd37dd9c38b6c61316251084c2e126edcce63).


## 2026-10-09 – Nachtrag

### Setup-Versionen
- Freies Versionsfeld beim bestehenden Setup-Upload ergänzt; es wird kein automatisches oder starres SemVer-Schema erzwungen.
- Versionswerte werden getrimmt, serverseitig validiert und auf eine sinnvolle Maximallänge von 40 Zeichen begrenzt.
- Eine beim Multi-ZIP-Upload eingegebene Version wird auf alle Dateien dieses Upload-Vorgangs angewendet.
- Die bestehende strikt sequenzielle Upload-Verarbeitung mit Concurrency `1` bleibt erhalten.
- Retry-Vorgänge behalten die ursprünglich dem Upload zugewiesene Version.
- Setup-Versionen werden persistent in D1 gespeichert und beim Laden der Setup-Liste wieder mit dem jeweiligen Setup zusammengeführt.
- Die Zuordnung erfolgt über Fahrzeugklasse, Fahrzeug und Setup-Datei statt über DOM-Position oder Array-Index.
- Alte Setups ohne gespeicherte Versionsinformation bleiben vollständig kompatibel und zeigen `—`.
- Nach erfolgreichem Upload werden Setup und Version über die bestehende Aktualisierung ohne erzwungenen Seitenreload sichtbar.
- Upload-Forwarding für Multipart/FormData korrigiert, nachdem ein übernommener Multipart-Header neue Uploads blockiert hatte.

### Setup-Versionen nachträglich bearbeiten
- Edit-/Stift-Funktion für vorhandene Setup-Einträge ergänzt.
- Das Edit-Icon wird ausschließlich für Nutzer mit bestehender Upload/Delete-Berechtigung angeboten.
- Database-only Nutzer können Setups und Versionen weiterhin ansehen und herunterladen, aber nicht bearbeiten.
- Der Edit-Endpunkt prüft die Upload/Delete-Berechtigung zusätzlich serverseitig und verweigert unberechtigte Änderungen mit `403`.
- Bestehende Setups mit `Version: —` können nachträglich eine Version erhalten.
- Bereits vorhandene Versionswerte können später geändert werden.
- Beim Bearbeiten der Version wird die eigentliche ZIP-Datei nicht erneut hochgeladen oder verändert.
- Vor dem Speichern wird serverseitig geprüft, dass das referenzierte Setup tatsächlich existiert.
- Nach dem Speichern wird die sichtbare Version ohne `location.reload()` aktualisiert.

### Fahrzeugübersicht / Navigation
- Zusätzlicher Fahrzeugklassenfilter für `Alle`, `Hypercar`, `LMP2`, `LMP3` und `LMGT3` ergänzt.
- Der Klassenfilter verwendet die bestehende Fahrzeugdatenstruktur und arbeitet gemeinsam mit der vorhandenen Fahrzeugsuche.
- Klassenfilter und interner GO/HYMO/beAlien-Filter besitzen getrennte Zustände.
- Beim Öffnen eines Fahrzeugs wird die aktuelle Scrollposition der Fahrzeugübersicht gespeichert.
- Fahrzeugdetailseiten öffnen unabhängig von der vorherigen Position immer oben.
- Beim Zurückkehren aus der Fahrzeugdetailseite wird die vorherige Scrollposition der Übersicht wiederhergestellt.
- Der bestehende Herstellerfilter innerhalb der Fahrzeugansicht wird beim Verlassen weiterhin auf `Alle` zurückgesetzt.

### Berechtigungen / Database Access
- Individueller Database Access und Upload/Delete Access technisch voneinander getrennt.
- Upload/Delete Access umfasst weiterhin Database Access; reiner Database Access verleiht keine Upload-, Delete- oder Edit-Rechte.
- Individuelle Upload-Freigaben über `upload_access` bleiben als höhere Berechtigungsstufe erhalten.
- Die für Upload/Delete verwendete Discord-Rollenprüfung wurde in den Access-Layer integriert.
- Upload-, Delete- und Setup-Version-Edit-Endpunkte werden zusätzlich serverseitig auf die höhere Berechtigung geprüft.
- Kombinierte Admin-Ansicht für individuell freigegebene Database-/Upload-Nutzer ergänzt; vorhandene D1-Freigaben bleiben bestehen.
- Discord-Anzeigenamen werden für die Admin-Übersicht serverseitig aufgelöst; bei nicht verfügbarer Auflösung wird ein neutraler Fallback verwendet.

### Hersteller-Diashow
- Fehlerhafte Auslieferung der GO-, HYMO- und beAlien-Grafiken korrigiert.
- Herstellerbilder werden wieder mit dem korrekten MIME-Type `image/webp` ausgeliefert.
- Fehlerhafte Cache-Behandlung der Herstellerbilder korrigiert, ohne die bestehende Diashow oder deren Design umzubauen.

### Discord Bot / Presence
- Separaten Discord-Presence-Bot als vollständigen Projektbestandteil unter `discord-presence/` dokumentiert.
- Produktiven Wispbyte-Einstiegspunkt `discord-presence/index.js` ergänzt.
- `discord-presence/package.json` auf den tatsächlichen Wispbyte-Entry-Point `index.js` ausgerichtet.
- Presence verwendet den bestehenden Discord-Bot mit Status DND und der Aktivität `Le Mans Ultimate`.
- `.env.example`/Projektstruktur dokumentieren die benötigte Bot-Konfiguration, ohne echte Tokens einzuchecken.
- Technische Discord-Einschränkung dokumentiert: normale Bot-Gateway-Presence kann kein frei konfiguriertes Rich-Presence-Large-Image wie ein Game/Client-RPC erzwingen.

### GitHub / Repository
- Repository um eine `.gitignore` für Secrets, lokale Environment-Dateien, `node_modules` und lokale Wrangler-Daten ergänzt.
- Tatsächlich verwendete Website-/Worker-Scripts, finale Branding-/Hersteller-Assets und Discord-Bot-Scripts als Projektbestandteile zusammengeführt bzw. dokumentiert.
- Deutsches Projekt-README vollständig neu aufgebaut.
- README anschließend nochmals visuell erweitert: große Technologie-Badges, Feature-Matrix, Hersteller-Showcase, Architekturdiagramm, Repository-Map, Berechtigungsmodell, Upload-Pipeline, Versionssystem, Discord-/Cloudflare-Bereiche, Deployment-Flow und Tech-Stack.
- Keine Secrets oder Tokens wurden für die Repository-Dokumentation committed.
- `KNOWN_GOOD_ROLLBACK` wurde auf den dokumentierten funktionierenden Projektstand aktualisiert, bevor weitere Security-Arbeiten begonnen werden.

### Security-Vorbereitung
- Security-Hardening-Vorgabe dokumentiert: bestehende Funktionen, Design, UI und UX haben Vorrang und dürfen durch optionale Security-Maßnahmen nicht verändert werden.
- Vor weiteren Security-Änderungen wurde ein bekannter Rollback-Stand festgehalten.
- Bestehende Schutzmechanismen wurden geprüft, darunter HTTPS-Prüfung, Same-Origin-Prüfung für schreibende Requests, Request-Größenlimit, Security-Header/CSP, OAuth-State-Prüfung, serverseitige Session-/Rollenprüfung und parameterisierte D1-Abfragen.
- Weiteres Hardening soll ausschließlich in kompatiblen, kleinen Änderungspaketen erfolgen; Maßnahmen mit Risiko für bestehende legitime Abläufe werden nicht blind aktiviert.

### Temporär getestete und wieder entfernte Änderung
- Fahrzeugbilder in der Fahrzeugdetailansicht wurden testweise ergänzt.
- Die Änderung wurde anschließend auf Wunsch vollständig zurückgenommen: UI-Integration, Sprite/Asset und Runtime-Integration wurden wieder entfernt.
- Der übrige Website-Stand wurde dabei nicht absichtlich verändert.

### Weitere README-Korrekturen nach dem bisherigen Nachtrag

- Das README am 9. Oktober nach dem letzten Changelog-Commit nochmals gestaltet und Bildverweise für die GitHub-Darstellung angepasst.
- In einem Folgecommit die betreffenden Bildverweise auf GitHub-Media-URLs umgestellt. Spätere Bildkorrekturen sind unter dem 16. Oktober dokumentiert.

Belege: [README überarbeitet](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/16fc3b6ee676f805f6c1f4ba74f5d9522baf43fd) · [Media-Bildverweise](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/583a6437eeb9e497cc77e90c29df0a6436a4fca5).


## 2026-10-08 – Nachtrag

### Access-Layer / Rechte
- Access-Wrapper für die bestehende Production-Worker-Kette erweitert.
- Database Access und Upload/Delete Access als getrennte Berechtigungsstufen umgesetzt.
- Server-Schutz für Upload und Delete auf die höhere Berechtigungsstufe gelegt.
- Individuelle Database-Freigaben in D1 berücksichtigt, ohne bestehende Upload-Freigaben zu migrieren oder zu löschen.
- Upload/Delete-berechtigte Nutzer erhalten automatisch auch Zugriff auf die Setup-Datenbank.
- Reine Database-Freigaben erhalten ausdrücklich keine zusätzlichen Upload/Delete-Rechte.

### Navigation / Filter
- Verhalten des GO/HYMO/beAlien-Filters beim Verlassen einer Fahrzeugdetailseite korrigiert: Rückkehr zur Übersicht setzt diesen Filter wieder auf `Alle`.
- Sonstige Fahrzeug-, Setup- und Upload-Abläufe blieben unverändert.

### Ergänzung: Upload / Retry / Aktualisierung

- Multi-ZIP-Uploads auf strikt sequenzielle Verarbeitung mit Concurrency `1` umgestellt; jede ZIP wird einzeln gesendet.
- Laufende Uploads gegen den gleichzeitigen Start einer weiteren Upload- oder Retry-Queue abgesichert.
- Dateistatus für wartende, laufende, erfolgreiche und fehlgeschlagene Versuche beibehalten; ungültige Dateitypen und Dateigrößen werden zusätzlich im Frontend abgefangen.
- Das Limit beträgt 50 ausgewählte ZIP-Dateien pro Vorgang und 25 MiB pro ZIP.
- Der Retry verarbeitet ausschließlich die weiterhin fehlgeschlagenen Jobs.
- Retry-Button bei vorhandenen Fehlern sichtbar gehalten und rot hervorgehoben. Die Pulsanimation berücksichtigt `prefers-reduced-motion`.
- Nach Abschluss einer Queue mit erfolgreichen Uploads werden Setup-Liste und Fahrzeugzähler aktualisiert, ohne Seitenreload.
- Vor dieser Aktualisierung werden Cache und offene Request-Zuordnung des betroffenen Fahrzeugs verworfen, damit neu hochgeladene Dateien und Zähler tatsächlich neu geladen werden.
- Den Fahrzeugzähler-Helfer global verfügbar gemacht, damit die Upload-Abschlusslogik ihn erreichen kann.

### Ergänzung: Streckensuche / Hersteller / Setup-Zähler

- Streckensuche in der Fahrzeugansicht ergänzt; die Suche arbeitet auf den Setup-Dateinamen und lässt sich mit dem Herstellerfilter kombinieren.
- Herstellerfilter für `Alle`, `GO`, `HYMO` und `beAlien` zwischen Übersicht und Fahrzeugansicht synchronisiert.
- Herstellerabschnitte mit GO in Rot, HYMO in Lila und beAlien in Grün eingeführt; vorhandene Varianten- und Rennseriengruppen bleiben darunter erhalten.
- Fahrzeugkarten um die tatsächliche Zahl verfügbarer Setup-Dateien ergänzt. Ein ausgewählter Hersteller wird bei der Zählung berücksichtigt.
- Rekursive Aktualisierung der Zähler durch den DOM-Observer behoben: Die Beobachtung reagiert auf Änderungen der Fahrzeugliste statt auf die neu eingefügten Zähler.
- Die Hersteller-Diashow auf einen zuständigen Controller für das sichtbare Bild abgestimmt. Die manuellen Pfeile wurden entfernt; der automatische Wechsel alle fünf Sekunden bleibt bestehen.

### Ergänzung: Zugriff auf die Setup-Datenbank

- Fahrzeugkatalog `/setups.json`, Setup-Liste und Downloads an angemeldeten Database Access gebunden.
- Öffentliche Zwischenlösungen zum Umgehen dieser Prüfung wieder entfernt.
- Ohne Anmeldung wird `401`, bei fehlendem Database Access `403` zurückgegeben.
- Das Frontend zeigt bis zur abgeschlossenen Prüfung einen passenden Login-, Prüf- oder Zugriffshinweis und lädt die Fahrzeugdaten erst nach Freigabe.
- Separate Konfigurationswerte für Database-Rolle und Upload/Delete-Rolle dokumentiert.

### Ergänzung: Setup Requests / Discord-Mentions

- Den anfragenden Nutzer aus der serverseitig geprüften Anmeldung beziehungsweise der Discord-Interaction übernommen und als User-Mention in die Request-Nachricht aufgenommen.
- Optionalen Rollen-Ping über `DISCORD_SETUP_REQUEST_ROLE_ID` ergänzt.
- `allowed_mentions` auf den anfragenden Nutzer und eine gültig konfigurierte Request-Rolle beschränkt.
- Die zusätzliche Überschrift in der erzeugten Discord-Request-Nachricht entfernt.

### Ergänzung: damaliges Upcoming-Races-Widget

- Das Widget rechts neben dem Inhalt angeordnet und für Desktop als haftende Seitenleiste mit internem Scrollbereich umgesetzt.
- Breitenänderung über den linken Rand korrigiert und die gewählte Breite lokal gespeichert.
- Bronze-, Silver-, Gold-, Weekly- und Special-Kategorien sowie zugehörige Filter und Farben abgestimmt; Special-/Weekly-Angaben und SR-Anforderungen bei der Zuordnung berücksichtigt.
- Countdowns regelmäßig aktualisiert und Rennen nach Erreichen ihrer Startzeit aus der Upcoming-Liste entfernt.
- Die mobile Darstellung und die Wiederherstellung des modularen Runtime-Entry-Points nach zwischenzeitlichen Bundle-Änderungen korrigiert.
- Diese Widget-Funktionen sind historisch dokumentiert; die Anbindung wurde am 20. Oktober entfernt.

Belege: [Sequenzieller Upload](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/3ab3c40f5895af6f3ece53da7378e40f9742d130) · [Upload-Abschluss](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/c66b1d972205037ed437f5907ca24657840af578) · [Zähler nachladen](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/62ba7330f1fbabc331a1fec48fa8c4b2fb91940d) · [Hersteller und Suche](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/4eec53236f6c2f41b5cafe05038b9d4a36aaece8) · [Diashow und Zähler](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/a31acdaa00cce3d7d4925b511ef9b6982ce66f92) · [Katalog-Zugriff](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/0e7874f71bc32ffd2576897516a1163fc52549df) · [Request-Mentions](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/e35a298e787b1abea6fd8f947aacea53d9fe5855) · [Request-Überschrift](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/9941c5bede47f90eb084634496e242fb9eca597c) · [Widget und Klassifizierung](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/8606a62ef9e08f227cb89c37a306a4034b3406fd) · [Linker Resize-Rand](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/886193c47ac42a53d458012d191ce7e9d78f152d).


## 2026-10-07

### LMU Portal / Upcoming Races
- Echten Developer-API-Endpunkt `GET https://lmuportal.com/api/v1/schedule/current-week` serverseitig angebunden.
- Authentifizierung erfolgt ausschließlich im Cloudflare Worker über vorhandene LMU-Portal-Secrets; Secret-Werte werden weder an Browser noch GitHub ausgegeben.
- Reale Felder aus der API werden normalisiert: Serienname, Strecke, Layout, UTC-Startzeit, Tier, SR-Anforderung, Renndauer, Fahrzeugklassen und Setup-Typ.
- Vergangene Starts werden serverseitig ausgefiltert und kommende Starts chronologisch sortiert.
- Timeout-, 401-, 403-, 429-, 503- und ungültige-Response-Behandlung ergänzt.
- Serverseitiger Schedule-Cache über D1-Tabelle `lmu_schedule_cache` ergänzt; frische Daten werden bevorzugt, ein älterer gültiger Cache kann bei kurzfristigem Ausfall als Fallback dienen.
- Production-API erfolgreich mit echten LMU-Portal-Daten verifiziert.
- Upcoming Races als eigenständiges Widget links neben dem Hauptinhalt platziert; Desktop-Größe ist per Resize-Handle anpassbar und wird lokal gespeichert, der Inhalt scrollt bei kleiner Größe intern.

### Discord
- Serverseitige Channel-Berechtigungsprüfung für den Discord Mini Player ergänzt.
- Schutz gegen manipulierte Channel-IDs beim Lesen und Senden von Nachrichten ergänzt.
- Website-Nachrichten werden dem angemeldeten Discord-Nutzer serverseitig zugeordnet, weiterhin regelkonform über den Bot gesendet.
- `/request` Interaction-Handler mit Modal für Fahrzeug, Klasse und Strecke implementiert.
- `Event / Rennserie` und `Setup Variante` aus dem Discord-Modal und der erzeugten Setup-Request-Nachricht entfernt.
- Setup Requests enthalten keine sichtbare Discord User ID.
- Setup Requests verwenden echte Zeilenumbrüche und deaktivieren Discord Mentions.
- Owner-Endpunkt und UI-Aktion zur Registrierung des Guild-Slash-Commands `/request` ergänzt.
- Discord Mini Player erhielt einen Größen-Slider; die Größe wird ausschließlich als UI-Präferenz lokal gespeichert.
- Aktive Discord-Kanäle werden periodisch aktualisiert, ohne versteckte oder nicht autorisierte Kanäle freizugeben.

### Setups
- Automatische EVO-Erkennung anhand des Dateinamens ergänzt.
- Oreca 07 Setups werden anhand von `ELMS` bzw. `WEC` im Dateinamen automatisch gruppiert.
- Mehrfachupload bis maximal 50 ZIP-Dateien bleibt serverseitig erzwungen.
- ZIP-Dateien werden zusätzlich anhand ihrer ZIP-Signatur validiert.
- Dateispezifische Upload-Rückmeldungen im Frontend ergänzt.
- Löschvorgang prüft die aktuelle Datei und deren SHA serverseitig, statt einer vom Client gelieferten SHA zu vertrauen.
- Setup-Listen werden im Frontend kurzzeitig im Arbeitsspeicher gecacht und bei Upload/Löschen gezielt invalidiert.

### Rechte und Sicherheit
- Rollenbasierte Upload-Rechte bleiben erhalten.
- Individuelle Upload-Freigaben über eine Cloudflare-D1-Datenbank ergänzt.
- Nur der Owner kann individuelle Upload-Rechte vergeben oder entziehen.
- Berechtigungsentscheidungen werden nicht im LocalStorage gecacht.
- D1-Datenbank `lmu-setups-access` mit EU-Jurisdiktion und deaktivierter Read-Replication angelegt.
- Dynamische UI-Inhalte werden ohne unsichere Inline-Handler bzw. als Text gerendert.

### Performance
- Wiederholte Setup-Requests beim schnellen Wechsel zwischen Fahrzeugseiten werden durch In-Memory-Cache und Request-Deduplizierung reduziert.
- `setups.json` wird browserseitig cachefähig geladen.
- Branding- und Herstellerbilder werden im Production Worker mit öffentlichem Browser-/Edge-Cache ausgeliefert.
- Discord-Nachrichten werden nur aktualisiert, wenn der Tab sichtbar ist.
- Keine sicherheitskritischen Rollen- oder Rechteinformationen werden clientseitig gecacht.

### Branding
- Website auf **Three Peaks Racing Setup Database** umgestellt.
- Neues bereitgestelltes Header-Logo unter `assets/header-logo.webp` eingebunden und in Production als tatsächlich geladenes Bild verifiziert.
- Das bisherige Three-Peaks-Racing-Logo bleibt unter `assets/three-peaks-racing-logo.webp` erhalten und wird als dezentes Hintergrund-Wasserzeichen verwendet.
- GO Setups, HYMO und beAlien liegen als echte Bild-Assets unter `assets/manufacturers/`.
- Production-Auslieferung der Branding-Assets erfolgt über den Worker mit korrektem Bild-MIME-Type und Browser-Cache.

### Website / UI
- Beschreibungstext auf **Setup Database für Three Peaks Racing** geändert.
- Herstelleranzeige auf eine bildbasierte Diashow mit GO Setups, HYMO und beAlien umgestellt.
- Reihenfolge der Diashow: GO Setups → HYMO → beAlien; automatischer Wechsel alle 5 Sekunden sowie manuelle Vor-/Zurück-Navigation.
- GO-, HYMO- und beAlien-Bilder wurden im gerenderten Production-Ergebnis als echte geladene Bilder verifiziert.
- `Event / Rennserie` und `Setup Variante` vollständig aus dem sichtbaren Website-Setup-Request entfernt und im Production-DOM verifiziert.
- Setup-Löschbutton ist bereits im Normalzustand klar erkennbar und wird beim Hover deutlich rot.
- Löschdialog auf eindeutige Aktionen **Abbrechen** und **Löschen** umgestellt und zeigt den konkreten Dateinamen.
- Mobile und Desktop Darstellung der Branding- und Setup-Komponenten angepasst.

### GitHub
- `CHANGELOG.md` als zentrale Update-Historie hinzugefügt.
- `schema.sql` um die D1-Tabelle `lmu_schedule_cache` ergänzt.
- `wrangler.jsonc` verwendet `runtime-worker.js` als Entry Point.
- Optimiertes 3P-Logo, neues Header-Logo und die drei bereitgestellten Herstellerbilder als versionierte Assets hinterlegt.

### Cloudflare
- Neue D1-Datenbank für individuelle Upload-Rechte erstellt.
- D1-basierter LMU-Schedule-Cache ergänzt.
- Vorhandene LMU-Portal-Secrets in den Worker-Bindings verifiziert; Secret-Werte wurden weder ausgelesen noch verändert oder in Source Code bzw. GitHub übernommen.
- Production Worker für LMU Upcoming Races, Branding-Assets, neues Header-Logo, Herstellerbilder und reduzierten Setup-Request aktualisiert.
- Production Rendering mit HTTP 200 verifiziert; Upcoming Races wurden mit echten API-Daten gerendert.

### Noch offen / technische Einschränkungen
- **Setup Request End-to-End:** Die sichtbare Entfernung der beiden Felder und der serverseitige reduzierte Request-Pfad sind implementiert; ein tatsächlicher erfolgreicher Discord-Versand wurde in der automatisierten Browser-Session nicht durchgeführt, da dort keine authentifizierte User-Session vorlag.
- **Discord Bot Presence / DND / dynamische Activity:** Der bestehende Cloudflare Worker ist stateless und hält keine dauerhafte Discord-Gateway-Verbindung. Presence-Updates werden deshalb nicht mit einer unsicheren oder unzuverlässigen Ersatzlösung emuliert.
- **Fahrzeugbilder mit 3P-Livery:** Es liegen weiterhin keine verifizierten passenden Fahrzeugbilder im Repository vor. Es werden keine falschen Bilder oder erfundenen Assets eingesetzt.

### Ergänzung: Core-Worker-Schutz und Upload-Grenzen

- HTTPS-Prüfung, Prüfung unerwarteter HTTP-Methoden sowie Origin-/Referer-Prüfungen für schreibende Anfragen im Core-Worker ergänzt.
- Security-Header um Content Security Policy, Frame-Schutz, `nosniff`, Referrer-Policy, Permissions-Policy und Cross-Origin-Policies erweitert.
- Eine `Content-Length`-Kontrolle mit 26 MiB als Request-Grenze sowie zusätzliche Dateinamen- und Größenprüfungen beim Upload ergänzt.
- Fehlerausgaben des Core-Workers auf neutrale Fehlertypen reduziert, damit interne Fehlermeldungen nicht ungefiltert in Logs ausgegeben werden.
- Setup-API und Downloads zusätzlich hinter der Discord-Anmeldung geschützt.
- Mehrfachuploads auf eine ZIP je HTTP-Anfrage umgestellt. Die spätere Begrenzung auf Concurrency `1` erfolgte am 8. Oktober.
- Retry-Button für fehlgeschlagene Uploads wiederhergestellt und seine Sichtbarkeit korrigiert.
- Einen Frontend-Syntaxfehler bei Theme-/Login-Initialisierung korrigiert; Dark Mode ist der Standard, ein gespeicherter Light Mode wird vor dem Rendern berücksichtigt.

### Ergänzung: Cloudflare-Konfiguration / Runtime

- `run_worker_first` aktiviert, damit Worker-Routen vor der statischen Asset-Auslieferung verarbeitet werden.
- Bindings für `UPLOADS_R2` und `UPLOAD_QUEUE` sowie einen Queue-Consumer in `wrangler.jsonc` ergänzt.
- Einen Queue-Handler im Runtime-Entry-Point ergänzt, damit die konfigurierte Queue bei Deployments einen passenden Consumer besitzt.
- Die vorhandene Queue-Konfiguration beschreibt keinen automatisch aktiven Hintergrund-Upload: Der aktuelle Website-Upload sendet jede ZIP über die bestehende HTTP-API direkt an die GitHub-Verarbeitung.
- Nach zwischenzeitlichen Runtime-Bundles den modularen Entry Point wiederhergestellt und Template-Literal-Syntaxfehler korrigiert.

Belege: [Core-Worker-Hardening](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/134b4ba9a7b4a4ee4a0ac15950f4245d42be347f) · [Setup-API mit Anmeldung](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/9a343cc01b60cb1e52b65dcce11f21ee85105221) · [Eine ZIP je Anfrage](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/8acea5d1b56e54ff97acdcca163e187f32ce5dc4) · [Theme und Login](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/471eadd25852dfbae525201cf351e365153dcd6b) · [R2-/Queue-Bindings](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/467bbeb6b4a140c16a3107a3d893fc1fb6076583) · [Modularer Runtime-Stand](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/commit/48e7355f395a352688863727f5564761cb3a6300).
