# Website-, Rechte- und Discord-Prüfung – 30.10.2026

Geprüft gegen den aktuellen Stand von main, einschließlich der Umstellung auf src/, public/ und ES-Module. Bestehende parallele Refactorings bleiben erhalten.

## Behobene Fehler

| Bereich | Verhalten |
|---|---|
| Admin-Panel-Freigabe | Darf Database- und Upload/Delete-Rechte verwalten und die Userliste sehen. Gewährt allein weder Setup-Zugriff noch Admin-Rechtevergabe. |
| Server-Owner-Rolle | Setup-Verwaltung sowie Database-/Upload-Freigaben. Keine Vergabe von Admin-Panel oder Full Admin. |
| Full Admin | Darf gewöhnliche und Admin-Freigaben verwalten. Tickets, Backups und Wartungsmodus bleiben ausschließlich beim konfigurierten persönlichen Owner. |
| Full Admin entfernen | Entzieht atomar auch persönliche Database-, Upload- und Admin-Panel-Freigaben, einschließlich alter automatisch angelegter Einzelrechte. Gewünschte Einzelrechte anschließend gezielt neu vergeben; Discord-Rollen bleiben gültig. |
| Geschlossene Tickets löschen | Der vorhandene Mülleimer ist mit einer funktionierenden, Owner-geschützten API verbunden. Offene Tickets können nicht gelöscht werden. Keine Lösch-DM. Nummern bleiben durch AUTOINCREMENT dauerhaft verbraucht. |
| Ticket schließen | Speichert den Status vor der DM. Blockierte DMs oder Discord-Ausfälle verhindern das Schließen nicht. Gleichzeitige Schließversuche benachrichtigen höchstens einmal. |
| Ticket erstellen | Eine vollständige Nachricht pro Empfänger mit Ticketnummer, Titel, Beschreibung und Priorität. Owner-Nachricht enthält den Absender als sichtbare @Erwähnung ohne ungewollte Pings. Eigene Owner-Meldungen erzeugen keine zweite Bestätigung im gleichen DM-Chat. Gleichzeitige Formularsendungen werden gesperrt. |
| Ticket-Fortschritt | Bestehende Benachrichtigungen für Bearbeitung, Wiederöffnen und inhaltliche Änderungen bleiben erhalten. Reporter-DMs sind blau; persönliche Owner-Bugmeldungen gelb. Zustellfehler sind nicht fatal. |
| Setup-Bestätigung | Sichtbarer Knopf bleibt auf jeder Anfrage. Setup Supply und die sechs vorhandenen Whitelist-Nutzer dürfen bestätigen. Anfragender wird anschließend gezielt erwähnt; die Benachrichtigung wird nicht mehr absichtlich unterdrückt. Gleichzeitige Klicks werden abgefangen; Discord-nonce verhindert doppelte Folgemeldungen. |
| Setup-Anfrage | Sichtbarer Setup-Supply-Tag ohne Rollen-Ping. Fahrzeug-/Streckenvorschläge, optionale Hersteller einschließlich Egal und Hersteller-/Layout-Prüfung bleiben erhalten. Auch der ältere Registrierungs-Endpunkt registriert alle aktuellen Felder. |
| Website-Audit | GitHub- und Discord-Protokollierung sind unabhängig. Ein GitHub-Fehler unterdrückt das Discord-Audit nicht mehr. Rechte/Administration bleiben violett, Setup-Aktionen blau. |
| Wartung | Anmeldeseiten und benötigte Logos/Skripte/Styles bleiben erreichbar. Nur der persönliche Owner darf die Wartung umgehen. Gesperrte APIs liefern eine verständliche JSON-Fehlermeldung. |
| Herkunftsprüfung | Auch äußere Admin-, Favoriten- und Ticket-Routen weisen fremde Anfrage-Ursprünge ab. |

## Ladeverhalten

- Geschützte Setup-Zusammenfassung liest einmal den vollständigen GitHub-Dateibaum statt 29 Fahrzeugordner einzeln.
- Herstellerzahlen enthalten GO, HYMO, beAlien inklusive bA/bA1/bA2 und unbekannte Hersteller.
- Unvollständige Dateibäume, GitHub-Fehler und ungültige Antworten werden nicht als 0 Setups dargestellt.
- Ergebnis wird im aktuellen Tab 30 Sekunden für Filterwechsel wiederverwendet; erfolgreiche Uploads und Löschungen erzwingen eine Aktualisierung.
- Gleichzeitige /api/me-Aufrufe teilen eine laufende Anfrage. Kein dauerhafter Berechtigungs-Cache im Browser.
- Ticket-Kopfzeile lädt eine kleine Zählantwort statt zwei vollständiger Listen; Hintergrundtabs pausieren die Abfrage.
- Herstellerbilder kommen bevorzugt aus den deployten Assets und dürfen fünf Minuten im Browser bleiben.
- Profilnamen und Discord-Account-Avatare werden als reine Anzeigedaten fünf Minuten zwischengespeichert. Externe Freigaben benötigen dafür keine Server-Mitgliedschaft. Abrufe haben Zeitlimits; große Listen werden auch dann vollständig angezeigt, wenn einzelne Profilabfragen ausfallen. Pro Antwort sind höchstens 32 neue Profilabfragen vorgesehen, weitere Namen können beim erneuten Laden ergänzt werden.
- Rollen- und Rechteprüfungen werden durch Bild-, Profil- oder Setup-Zahlen-Caches nicht umgangen.

## Nachweise und Grenzen

- Node-Tests umfassen die bestehende Website-Suite und neue Tests mit echter SQLite-Datenbank: Rechte-Matrix, beide Full-Admin-Endpunkte, Ticket-Löschung/Nummern, paralleles Schließen und Erstellen, Wartung, Herkunftsprüfung, Audit-Ausfälle, externe Profile sowie vollständige/fehlerhafte Setup-Zusammenfassungen.
- Bot-Tests verwenden den echten discord.js-Builder mit simulierten Discord-/GitHub-Antworten; keine Testnachrichten an echte Nutzer.
- Python-Prüfungen prüfen Repository-Backups und Changelog. Backup-Tests arbeiten mit Testdaten, veröffentlichen kein echtes manuelles Backup und schicken keine DM.
- Syntax, Formatierung, ESLint und Wrangler-Build werden separat geprüft. Bekannte bestehende Stil-Warnungen sind keine Syntaxfehler.
- Browser-Ausgangsmessung: 29 Setup-Anfragen, letzte Antwort nach ca. 4.922 ms, 35 API-Antworten in den ersten sechs Sekunden. Werte hängen von Cache, Netz und Browser ab; kein Lighthouse-Score.
- Kein neuer kostenpflichtiger Dienst, Tarif, Speicher oder zusätzlicher Bot-Prozess wird eingerichtet. Bestehende Kontotarife und Quoten bleiben gültig. Der Cloudflare-Connector hat keine Berechtigung zum Lesen der Abrechnung; deshalb ist dies keine Zusicherung über sämtliche bestehenden Kontokosten.
- Eine absolute Fehlerfreiheit oder Discord-Pushzustellung bei gesperrten DMs/Nutzereinstellungen lässt sich nicht zusichern. Die Anwendung behandelt diese Ausfälle gezielt.


## Bestehende automatische Backups live geprüft

Die vorhandenen Aufträge vom 30.10.2026 um 00:00 und 12:00 Uhr (Europe/Berlin) sind in D1 als completed und notified=1 protokolliert. Der Mittagsauftrag enthält 1.775 Dateien mit 195.210.449 Bytes unter backups/2026-10-30/12-00-30 im Backup-Repository. Dies bestätigt einen vollständigen Repository-Lauf und eine von Discord akzeptierte Owner-Benachrichtigung, keine Lesebestätigung. Während dieser Prüfung wurde kein zusätzliches manuelles Backup gestartet.
