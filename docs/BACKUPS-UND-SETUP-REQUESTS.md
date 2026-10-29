# Backups und Setup-Anfragen

## Vollständige Repository-Sicherungen

- Automatisch täglich um **00:00 und 12:00 Uhr, Europe/Berlin**, inklusive Sommerzeit. Cloudflare prüft stündlich, ob ein Sicherungszeitpunkt erreicht ist; GitHub Actions kopiert die Dateien. Derselbe automatische Zeitpunkt wird nur einmal eingereiht.
- Quelle ist ein festgehaltener Commit von `lukasracinglmu/Le-Mans-Ultimate-Setups`, Branch `main`. Gesichert werden **alle dort versionierten Dateien**, einschließlich Codes, versteckter Dateien, Bilder und Setup-ZIPs. Nicht enthalten sind Discord-/Cloudflare-Secrets, nicht eingecheckte Dateien, GitHub-Issues oder eine exportierte Cloudflare-D1-/R2-Datenbank. Die Sicherung ersetzt keinen Export dieser separaten Dienste.
- Ziel ist `lukasracinglmu/LMU-Database-Backups`, Branch `main`: `backups/JJJJ-MM-TT/HH-mm-ss/repository/`. Neben `repository/` stehen ein Manifest mit Quellcommit, Dateizahl und Größe sowie eine lesbare Beschreibung.
- Tags heißen `backup-Jahr-Tag-Monat/Stunde-Minute-Sekunde`. Der ZIP-Link enthält genau diese Sicherung samt `repository/`, Manifest und Beschreibung. Kopierte Workflows liegen innerhalb von `repository/.github/` und werden im Backup-Repo nicht ausgeführt.
- Ein Erfolg wird erst gemeldet, wenn Quellbaum und gesicherter Git-Baum identisch sind, der Ordner auf `main` vorhanden ist und Dateizahl/Größe stimmen. Ein reiner MD-Index zählt nicht als vollständiges Backup.
- Backups über 14 Tage werden beim nächsten erfolgreichen Sicherungslauf aus den aktuellen Ordnern und Backup-Tags entfernt. GitHub kann Git-Objekte in der Commit-Historie weiterhin aufbewahren; das ist keine garantierte physische Löschung aller Git-Objekte.
- Vorhandene ältere Index-Sicherungen bleiben als **Altbestand · Vollständigkeit nicht geprüft** gekennzeichnet. Deren fehlende Dateien lassen sich nicht nachträglich aus dem Index herstellen.
- Nur Discord-ID `1033453785416208564` sieht und bedient die Backup-Oberfläche. Nach einem vollständigen manuellen oder automatischen Backup erhält nur dieser Account eine DM mit Datum/Uhrzeit, Größe, Dateizahl, Ansicht und ZIP-Link. Zustellfehler machen ein vollständiges Backup nicht ungültig und werden erneut versucht.
- Ein manueller Klick reiht einen Auftrag ein; die Oberfläche zeigt den tatsächlichen Fortschritt und mögliche Fehler. Eine angenommene Anfrage ist noch kein erfolgreiches Backup.

### Bestehende Zugangsdaten und Validierung

Der Cloudflare-Worker verwendet `GITHUB_TOKEN` für Quellstand und `repository_dispatch` (Contents-Schreibrecht), `BACKUP_GITHUB_TOKEN` zum Prüfen der Zielkopie und `DISCORD_BOT_TOKEN` ausschließlich für die Owner-DM. Der GitHub-Actions-Workflow verwendet seinen eigenen kurzlebigen `github.token` zum Lesen des Quell-Repositories und das vorhandene Repository-Secret **BACKUP_REPO_TOKEN** zum Schreiben im privaten Backup-Repository. Diese beiden Backup-Token müssen Zugriff auf dasselbe Ziel haben. Kein Tokenwert gehört in den Code.

Die Abschlussmeldung authentifiziert GitHub mit einer kurzlebigen OIDC-Identität des konkreten Workflows auf `main`. Ein zusätzlicher gemeinsamer Callback-Schlüssel ist nicht nötig.

`validateBackupConfiguration` prüft einen vollständigen Transfer mit lokalem Git-Baumvergleich und einem Git-Push-Probelauf auf GitHub Actions. Dabei werden **keine Remote-Sicherung, kein Backup-Tag und keine DM** angelegt. Es entstehen ein Validierungsauftrag und ein Workflow-Protokoll. GitHub Actions nutzt die vorhandene Kontingent-/Abrechnungsregel des privaten Repositories; dieses Feature bucht keinen neuen Dienst oder Tarif.

## Setup-Anfragen auf Website und Discord

- Pflichtfelder sind Fahrzeug und Strecke/Layout. Hersteller **GO**, **HYMO** oder **beAlien** sowie die Nachricht sind optional. Ohne Auswahl gilt **Egal – keine Präferenz**. Beim Bot steht **Egal** ausdrücklich in der Hersteller-Auswahl; alternativ kann `/request … hersteller:…` einfach weggelassen werden; auch das ältere Discord-Formular erlaubt ein leeres Herstellerfeld.
- Die Vorhanden-Prüfung vergleicht Fahrzeugordner, Strecke/Layout **und Hersteller**. Ein HYMO-Setup verhindert keine GO-Anfrage. Ohne Herstellerwahl wird nach einem Setup beliebigen Herstellers für genau dieses Fahrzeug und Streckenlayout gesucht; ein vorhandener Treffer liefert weiterhin den direkten Link. Verschiedene Streckenlayouts bleiben getrennt. Dateikürzel `bA`, `bA1`, `bA2` werden beAlien zugeordnet.
- Bei einem passenden vorhandenen Setup erscheint auf der Website ein direkter Link zum Fahrzeug/Setup, im Discord-Befehl eine nur für den Anfragenden sichtbare Antwort. Es wird keine neue Channel-Anfrage gepostet.
- Neue Anfragen erscheinen über beide Wege als ein Embed mit Fahrzeug/Klasse, Strecke, Hersteller (ohne Auswahl: **Egal**), Nachricht und getaggtem Anfragenden. Die Setup-Supply-Rolle steht darüber als sichtbarer Tag, bekommt dabei aber **keinen Rollen-Ping**.
- Der Button **Setup wurde hochgeladen** ist für alle sichtbar. Nur die Setup-Supply-Rolle `1538601074074849330` oder die bereits freigegebenen IDs `771358435416473600`, `640948738445279261`, `198399938739175424`, `711862720567312455`, `646758275714514955`, `999265474078593164` können bestätigen.
- Nach Bestätigung wird das Embed grün, erhält Datum/Uhrzeit, der Button verschwindet. Eine Channel-Nachricht informiert den ursprünglichen Anfragenden mit persönlichem Ping und Fahrzeuglink. Der Button ist eine manuelle Bestätigung; er lädt selbst keine Datei hoch.
- Alte Discord-Nachrichten werden durch ein Deployment nicht rückwirkend neu aufgebaut. Neu erstellte Anfragen bekommen das vollständige Embed samt Button.
- Der Railway-Bot lädt beim Start den aktualisierten Slash-Befehl. Für andere Bot-Hoster müssen `index.js`, `request-tracks.js` und `request-manufacturers.js` gemeinsam aktualisiert werden, anschließend neu starten.
