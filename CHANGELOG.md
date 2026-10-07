# Changelog

Alle relevanten Änderungen an Website, Discord-Integration, Setup-Verwaltung, GitHub und Cloudflare werden hier dokumentiert. Secrets, Tokens, Passwörter und vertrauliche User-Daten werden nicht eingetragen.

## 2026-10-07

### Discord
- Serverseitige Channel-Berechtigungsprüfung für den Discord Mini Player ergänzt.
- Schutz gegen manipulierte Channel-IDs beim Lesen und Senden von Nachrichten ergänzt.
- Website-Nachrichten werden dem angemeldeten Discord-Nutzer serverseitig zugeordnet, weiterhin regelkonform über den Bot gesendet.
- `/request` Interaction-Handler mit Modal für Fahrzeug, Klasse, Strecke, Event und Setup-Variante implementiert.
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
- Das Three-Peaks-Logo wurde als optimiertes WebP-Asset integriert und im Header vorgeladen.
- Discord-Nachrichten werden nur aktualisiert, wenn der Tab sichtbar ist.
- Keine sicherheitskritischen Rollen- oder Rechteinformationen werden clientseitig gecacht.

### Branding
- Website auf **Three Peaks Racing Setup Database** umgestellt.
- Browser-Titel, Header, Hero-Bereich und Discord-Mini-Player auf Three Peaks Racing Branding angepasst.
- Das bereitgestellte Three-Peaks-Racing-Logo als optimiertes Asset unter `assets/three-peaks-racing-logo.webp` hinzugefügt.
- Das 3P-Logo wird dezent als Hintergrund-Wasserzeichen in Hero und Fahrzeugkarten verwendet.
- Le Mans Ultimate bleibt als Plattform klar sichtbar.

### Website / UI
- Setup-Request-Formular um Klasse, Event und Setup-Variante erweitert.
- Dezente textbasierte Hersteller-Rotation für GO, HYMO und beAlien ergänzt; keine erfundenen Logos verwendet.
- Setup-Löschbutton ist bereits im Normalzustand klar erkennbar und wird beim Hover deutlich rot.
- Löschdialog auf eindeutige Aktionen **Abbrechen** und **Löschen** umgestellt und zeigt den konkreten Dateinamen.
- Mobile und Desktop Darstellung der neuen Branding- und Setup-Komponenten angepasst.
- Upcoming-Races-Bereich ist vorbereitet und wird nur angezeigt, wenn ein realer Backend-Endpunkt gültige Daten liefert.

### GitHub
- `CHANGELOG.md` als zentrale Update-Historie hinzugefügt.
- `schema.sql` für die D1-Rechteverwaltung hinzugefügt.
- `wrangler.jsonc` um die D1-Bindung `ACCESS_DB` erweitert.
- Optimiertes 3P-Logo als versioniertes Asset hinzugefügt.

### Cloudflare
- Neue D1-Datenbank für individuelle Upload-Rechte erstellt.
- Worker-Konfiguration für die D1-Bindung vorbereitet.
- Dynamische bzw. userbezogene API-Daten bleiben von öffentlichem Caching ausgeschlossen.

### Noch offen / technische Einschränkungen
- **LMU Portal / Upcoming Races:** In den aktuell konfigurierten Cloudflare-Bindings existieren noch keine LMU-Portal-Secrets. Außerdem wurde keine belastbare öffentliche Dokumentation für die beiden bereitgestellten LMU-Portal-Keys gefunden. Deshalb wurde kein API-Endpunkt geraten oder erfunden.
- **LMU Portal Secrets:** Die Keys müssen als Cloudflare Secrets eingerichtet werden, bevor eine echte serverseitige Integration erfolgen kann. Die Werte werden nicht in GitHub, Frontend, Changelog oder Logs geschrieben.
- **Discord Game/Application ID:** Die bekannte Le-Mans-Ultimate-ID kann als Identifikation des Discord-Spiels dienen, ersetzt aber keine Bot-Gateway-Presence. Discord Rich Presence Assets gehören zur jeweiligen Application und können nicht allein durch eine fremde Game-ID übernommen werden.
- **Discord Bot Presence / DND / dynamische Activity:** Der bestehende Cloudflare Worker ist stateless und hält keine dauerhafte Discord-Gateway-Verbindung. Presence-Updates werden deshalb nicht mit einer unsicheren oder unzuverlässigen Ersatzlösung emuliert.
- **Fahrzeugbilder mit 3P-Livery und Herstellerlogos:** Es liegen weiterhin keine verifizierten passenden Assets im Repository vor. Es werden keine falschen Bilder oder erfundenen Logos eingesetzt.
