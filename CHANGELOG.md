# Changelog

Alle relevanten Änderungen an Website, Discord-Integration, Setup-Verwaltung, GitHub und Cloudflare werden hier dokumentiert. Secrets, Tokens, Passwörter und vertrauliche User-Daten werden nicht eingetragen.

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
