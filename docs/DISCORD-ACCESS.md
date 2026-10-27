# Automatische Discord-Rollen und Website-Zugriff

## Ablauf

1. Die Website-Anmeldung fordert bei Discord die Scopes `identify guilds.members.read` an.
2. Der Worker liest die Server-Mitgliedschaft des angemeldeten Nutzers über dessen OAuth-Token.
3. Falls dieser Weg nicht verfügbar ist (z. B. ältere Sitzungen), versucht der Worker die Mitgliedsabfrage mit dem Bot-Token.
4. Erst eine bestätigte Rollenliste wird in Website-Rechte übersetzt. Persönliche Freigaben werden zusätzlich aus D1 gelesen.
5. Fehlende Rollen führen zu einer Zugriffsverweigerung. Ein Timeout, ein Discord-Limit oder eine fehlgeschlagene Abfrage wird als vorübergehender Prüfungsfehler angezeigt.

## Automatische Serverrollen

| Rolle | Datenbank / Download | Upload / Bearbeiten / Veraltet / Löschen | Admin-Panel |
| --- | --- | --- | --- |
| Team (`1464926567401652420`) | Ja | Nein | Nein |
| Setup Supply (`1538601074074849330`) | Ja | Ja | Nein |
| Konfigurierte Owner-Rolle (`1464926567401652423`) | Ja | Ja | Ja, Database-/Upload-Freigaben und Benutzerliste |

Alle drei Rollen werden beim Discord-Login automatisch auf demselben Weg abgefragt; eine manuelle Freigabe ist dafür nicht nötig. Die Owner-Rolle umfasst auch Upload, Bearbeiten, Veraltet/Aktuell und Löschen. Zusätzliche, ausdrücklich erteilte persönliche Freigaben gelten weiterhin. Die Discord-Owner-Rolle ist nicht mit der persönlichen Owner-ID oder einer Full-Admin-Freigabe gleichzusetzen. Tickets, Backups und Wartungsmodus bleiben auf die persönliche Owner-ID beschränkt.

## Kurzzeitiger Rollen-Zwischenspeicher

Nach einer erfolgreichen Prüfung ergänzt der Worker die signierte, HttpOnly-Sitzung um eine kleine Rollen-Zusammenfassung. Sie ist an den Nutzer, den Server und die konfigurierten Rollen-IDs gebunden. Gespeichert werden nur die drei für die Website relevanten Rollen, keine Berechtigungsliste aus dem Browser.

- Die Zusammenfassung gilt maximal **60 Sekunden** für Lesezugriffe.
- Ein Rollenentzug kann bei Lesezugriffen deshalb höchstens 60 Sekunden verzögert sichtbar sein.
- Upload, Löschen, Bearbeiten und die Vergabe von Rechten verlangen frische Rollen-Daten.
- Persönliche Freigaben werden immer aus D1 gelesen und nicht mit den Discord-Rollen zwischengespeichert.
- Ein ungültiger Cookie, eine fremde Nutzer-ID, geänderte Rollen-Konfiguration oder abgelaufene Zusammenfassung wird nicht akzeptiert.
- Fehlgeschlagene Abfragen werden nicht als erfolgreiche Rollenliste gespeichert.
- Die Sitzungslaufzeit wird beim Aktualisieren der Rollen nicht verlängert.
- `GET /api/me?refresh=1` erzwingt eine neue Rollenprüfung.
- Die eigentliche Download-API und die Setup-Liste prüfen den Zugriff in der Basis-Worker-Schicht. Die umgebende API-Schicht wiederholt diese Prüfung nicht.

Damit laden viele Fahrzeugkarten nicht für jedes Auto dieselben Discord-Rollen erneut. Hersteller-Filter nutzen außerdem den vorhandenen Setup-Cache. Fehlgeschlagene Setup-Zählungen werden als „nicht abrufbar“ angezeigt statt als falsche Null.

## Fehlermeldungen und Wiederherstellung

- **Nicht angemeldet:** normale Discord-Anmeldung.
- **Rolle bestätigt, aber nicht ausreichend:** keine Datenbankberechtigung (HTTP 403).
- **Discord momentan nicht erreichbar / Limit:** vorübergehender Fehler (HTTP 503 bei geschützten Lese-APIs), auf der Website „Erneut prüfen“.
- **OAuth-Zustimmung fehlt oder ist abgelaufen und der Bot-Fallback scheitert ebenfalls:** Link zur erneuten Discord-Anmeldung.
- Nach einem Discord-Limit wiederholt die Oberfläche die Rollenabfrage nicht sofort mehrfach.

## Was im Discord- und Cloudflare-Setup erforderlich ist

- Cloudflare `DISCORD_GUILD_ID` muss den richtigen Server bezeichnen.
- `DISCORD_DATABASE_ROLE_ID` ist die Teamrolle; `DISCORD_UPLOAD_ROLE_ID` die Setup-Supply-Rolle.
- Bot-Token und Discord-Anwendung müssen zusammengehören.
- Für den Bot-Fallback muss der Bot auf dem angegebenen Server sein.
- Der OAuth-Redirect muss zur Website und ihrer Callback-Adresse passen.
- Nutzer mit einer alten Anmeldung sollten sich einmal auf der Website abmelden und über **Discord Login** neu anmelden. Die Abfrage der Server-Mitgliedschaft muss erlaubt werden.
- Eine individuelle Freigabe ist für Servermitglieder mit Team- oder Setup-Supply-Rolle nicht erforderlich.
- Ein Neustart des separaten Presence-/Slash-Command-Bots ist für diese Worker-Korrektur nicht nötig. Die Website-Berechtigungen werden im Cloudflare-Worker ermittelt.
- Es wurden keine Rollen auf Discord und keine bestehenden persönlichen Freigaben verändert.

Discord beschreibt die notwendige Mitgliedschaftsfreigabe unter [Get Current User Guild Member](https://docs.discord.com/developers/resources/user#get-current-user-guild-member) und das Verhalten bei Limits unter [Rate Limits](https://docs.discord.com/developers/topics/rate-limits).

## Diagnose nur für den persönlichen Owner

`GET /api/admin/discord/role-status?userId=<Discord-ID>`

Die Route überprüft Bot-Identität, Server-Zugriff, Existenz der konfigurierten Rollen und die tatsächliche Mitgliedschaft des angegebenen Nutzers. `withoutManualGrants` zeigt die aus den Live-Rollen abgeleiteten Rechte ohne persönliche Freigaben. Es werden keine Tokens ausgegeben. Zugriff ist nur mit einer gültigen Sitzung der konfigurierten persönlichen Owner-ID möglich.

## Verifikation dieses Fixes

- Der Live-Bot wurde mit dem konfigurierten Client und Server abgeglichen; alle konfigurierten Rollen existieren.
- Bei einem zuvor manuell freigegebenen Team-Mitglied lieferte Discord die Teamrolle.
- Automatisierte Tests führen die Discord-Anmeldung und die geschützte Fahrzeugliste mit einer leeren Freigabedatenbank durch.
- Nach einer Rollenprüfung werden 20 parallele Setup-Abfragen geprüft, ohne weitere Discord-Rollenabfragen.
- Geprüft werden OAuth- und Bot-Fallback, alte Sitzungen, fehlende Zustimmung, echte Rollenverweigerung, Limits, manipulierte/abgelaufene Rollen-Zusammenfassungen und frische Prüfung bei Schreibzugriffen.
- Die bestehende breite Testsuite enthält bereits vor dem Fix veraltete/fehlerhafte Tests, unter anderem eine als Base64 gespeicherte Testdatei und ältere Bugreport-/Upload-Erwartungen. Der Vorher/Nachher-Vergleich zeigte keine neuen Fehler in diesen bestehenden Tests. Die D1-Testattrappe der Rollen-Tests wurde um die mittlerweile vorhandene Schema-Initialisierung ergänzt.
