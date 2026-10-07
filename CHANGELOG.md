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

### Setups
- Automatische EVO-Erkennung anhand des Dateinamens ergänzt.
- Oreca 07 Setups werden anhand von `ELMS` bzw. `WEC` im Dateinamen automatisch gruppiert.
- Mehrfachupload bis maximal 50 ZIP-Dateien bleibt serverseitig erzwungen.
- ZIP-Dateien werden zusätzlich anhand ihrer ZIP-Signatur validiert.
- Dateispezifische Upload-Rückmeldungen im Frontend ergänzt.
- Löschvorgang prüft die aktuelle Datei und deren SHA serverseitig, statt einer vom Client gelieferten SHA zu vertrauen.

### Rechte und Sicherheit
- Rollenbasierte Upload-Rechte bleiben erhalten.
- Individuelle Upload-Freigaben über eine Cloudflare-D1-Datenbank ergänzt.
- Nur der Owner kann individuelle Upload-Rechte vergeben oder entziehen.
- Berechtigungsentscheidungen werden nicht im LocalStorage gecacht.
- D1-Datenbank `lmu-setups-access` mit EU-Jurisdiktion und deaktivierter Read-Replication angelegt.

### Website
- Setup-Request-Formular um Klasse, Event und Setup-Variante erweitert.
- Dezente textbasierte Hersteller-Rotation für GO, HYMO und beAlien ergänzt; keine erfundenen Logos verwendet.
- Größen-Slider für den Discord Mini Player ergänzt; die Einstellung wird lokal im Browser gespeichert.
- Discord-Nachrichtenansicht aktualisiert sich im aktiven Kanal regelmäßig.
- XSS-Risiko bei dynamischen Setup-Aktionen reduziert, indem Löschaktionen nicht mehr über dynamisch erzeugte Inline-JavaScript-Strings gebunden werden.

### GitHub
- `CHANGELOG.md` als zentrale Update-Historie hinzugefügt.
- `schema.sql` für die D1-Rechteverwaltung hinzugefügt.
- `wrangler.jsonc` um die D1-Bindung `ACCESS_DB` erweitert.

### Cloudflare
- Neue D1-Datenbank für individuelle Upload-Rechte erstellt.
- Worker-Konfiguration für die D1-Bindung vorbereitet.
- Deployment nach den Änderungen vorgesehen; Ergebnis wird nach erfolgreicher Veröffentlichung hier ergänzt.

### Noch nicht umgesetzt
- LMU Portal / Upcoming Races: Im bestehenden Projekt und in den Cloudflare-Bindings ist aktuell keine LMU-Portal-API oder ein LMU-API-Key vorhanden. Es wurde deshalb kein externer API-Endpunkt erfunden.
- Fahrzeugbilder mit 3P-Livery, 3P-Hintergrundlogo, LMU-Headerlogo und Herstellerlogos: Im Repository sind aktuell keine verifizierten passenden Assets vorhanden.
- Discord Bot Avatar/Logo, Rich-Presence-Logo, DND-Status und dynamische Activity: Die bestehende Architektur verwendet einen stateless Cloudflare Worker ohne dauerhaft verbundene Discord-Gateway-Session. Diese Presence-Funktionen werden daher nicht mit einer unsicheren oder unzuverlässigen Ersatzlösung emuliert.
