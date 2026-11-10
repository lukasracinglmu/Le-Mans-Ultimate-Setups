# Cloudflare-Variablen

Diese Datei erklärt die Variablen und Bindings des Workers `le-mans-ultimate-setups`.

## Benötigte Bindings

| Name | Typ | Zweck |
| :--- | :--- | :--- |
| `ACCESS_DB` | D1-Datenbank | Speichert persönliche Freigaben, Versionen, Anzeigenamen, den Veraltet-Status und den Versandstatus von Bugmeldungen. |
| `ASSETS` | Assets | Liefert Website, Bilder und andere statische Dateien aus. |

## Benötigte Secrets

Diese Werte dürfen nicht im Repository oder in normalen Textvariablen stehen.

| Name | Zweck |
| :--- | :--- |
| `DISCORD_CLIENT_SECRET` | Geheimer Schlüssel für den Discord-Login. |
| `DISCORD_BOT_TOKEN` | Prüft Discord-Rollen und sendet Setup Requests, Audit-Meldungen und Bugreports. |
| `GITHUB_TOKEN` | Liest und verändert das private GitHub-Repository. |
| `SESSION_SECRET` | Signiert die Login-Sitzungen der Website. |

## Benötigte Textvariablen

Der Code enthält keine Ersatzwerte für diese Werte. Fehlt eine Variable, greift die zugehörige Berechtigung, Benachrichtigung oder GitHub-Anfrage nicht. Ohne `DISCORD_OWNER_USER_ID` hat z. B. niemand Owner-Rechte, ohne `GITHUB_REPO` liest der Worker nichts aus dem Repository. `npm run check:deploy` bricht ab, wenn eine Pflichtvariable (Liste in `src/config.js`) in `wrangler.jsonc` fehlt oder leer ist.

| Name | Aktueller Wert | Zweck |
| :--- | :--- | :--- |
| `DISCORD_CLIENT_ID` | `1556978316404068452` | ID der Discord-Anwendung für Login und Slash-Befehl. |
| `DISCORD_GUILD_ID` | `1464926567401652418` | Discord-Server für Rollenprüfung und Requests. |
| `DISCORD_DATABASE_ROLE_ID` | `1464926567401652420` | Teamrolle für Datenbank und Downloads. |
| `DISCORD_UPLOAD_ROLE_ID` | `1538601074074849330` | Setup-Supply-Rolle für Upload, Löschen und Bearbeiten. |
| `DISCORD_OWNER_ROLE_ID` | `1464926567401652423` | Rolle für Admin-Panel und persönliche Freigaben. |
| `DISCORD_OWNER_USER_ID` | `1033453785416208564` | Persönliche Owner-ID mit vollständigem Zugriff. |
| `DISCORD_FULL_ADMIN_USER_IDS` | `282959005108928513` | Optional. Discord-IDs mit festem Full-Admin-Recht, kommagetrennt. Sie sehen außerdem die Bug-Tickets. Sie erscheinen nicht in der Nutzerliste des Admin-Panels und lassen sich dort nicht entziehen. |
| `DISCORD_CHANNEL_ID` | `1511795330176520193` | Zielkanal für Setup Requests. |
| `DISCORD_AUDIT_CHANNEL_ID` | `1564325702344507442` | Zielkanal für Änderungsprotokolle. |
| `DISCORD_SETUP_REQUEST_ROLE_ID` | `1538601074074849330` | Rolle, die bei Setup Requests erwähnt wird. |
| `SITE_URL` | `https://le-mans-ultimate-setups.3peaks-database.workers.dev` | Öffentliche Adresse und Grundlage des Discord-Redirects. |
| `GITHUB_OWNER` | `lukasracinglmu` | Besitzer des GitHub-Repositorys. |
| `GITHUB_REPO` | `Le-Mans-Ultimate-Setups` | Name des GitHub-Repositorys. |
| `GITHUB_BRANCH` | `main` | Branch für Website, Setups und Audit-Logs. |
| `BACKUP_GITHUB_OWNER` | `lukasracinglmu` | Besitzer des Backup-Repositorys. Fehlt der Wert, wird `GITHUB_OWNER` verwendet. |
| `BACKUP_GITHUB_REPO` | `LMU-Database-Backups` | Repository, das die vollständigen Backups erhält. |
| `BACKUP_GITHUB_BRANCH` | `main` | Branch im Backup-Repository. |

## Optional

| Name | Zweck |
| :--- | :--- |
| `DISCORD_SETUP_REQUEST_ROLE_ID` | Kann fehlen. Dann wird die Upload-Rolle für den Ping verwendet. Ein eigener Wert ist übersichtlicher. |
| `DISCORD_AUDIT_CHANNEL_ID` | Wird nur für Audit-Meldungen in Discord gebraucht. GitHub-Audit-Dateien funktionieren getrennt davon. |
| `DISCORD_PUBLIC_KEY` | Aktuell nicht eingetragen und nicht erforderlich. Der Worker lädt den Schlüssel mit dem Bot-Token. |

## Aktuell nicht verwendet

| Name | Grund |
| :--- | :--- |
| `DISCORD_ROLE_ID` | Alte Ersatzrolle. Die getrennten Datenbank- und Upload-Rollen sind gesetzt. |
| `LMUPORTAL_API1` | LMU-Portal-Token 1 für den geschützten Rennkalender-Proxy. Als Cloudflare Secret setzen. |
| `LMUPORTAL_API2` | Optionaler zweiter LMU-Portal-Token/Fallback. Als Cloudflare Secret setzen. |
| `UPLOADS_R2` | Setup-ZIPs werden direkt in GitHub gespeichert. |
| `UPLOAD_QUEUE` | Uploads werden direkt und nacheinander verarbeitet. |

Die ungenutzten Einträge können aus der Worker-Konfiguration entfernt werden. Bei R2 und Queue sollte zuerst geprüft werden, ob dort noch Daten oder Nachrichten liegen. Das Entfernen eines Bindings löscht die zugehörige Cloudflare-Ressource nicht automatisch.

## Rennkalender

Die Website bietet `/calendar` mit Upcoming- und Future-Schedule-Tab, Countdown in Europe/Berlin, Tomorrow-Markierung, Filtern und den Klassen-/Event-Badges. Der Worker ruft das Portal serverseitig auf; Tokens werden nie an den Browser ausgeliefert. Der Proxy nutzt den aktuellen LMU-Portal-Datensatz über `db.lmuportal.space`; `LMUPORTAL_API1` und optional `LMUPORTAL_API2` werden als sichere Server-Schlüssel verwendet.

## Secrets setzen

```bash
npx wrangler@4 secret put DISCORD_CLIENT_SECRET
npx wrangler@4 secret put DISCORD_BOT_TOKEN
npx wrangler@4 secret put GITHUB_TOKEN
npx wrangler@4 secret put SESSION_SECRET
npx wrangler@4 secret put LMUPORTAL_API1
npx wrangler@4 secret put LMUPORTAL_API2
```

Der Discord-Redirect muss zu `SITE_URL` passen:

```text
https://le-mans-ultimate-setups.3peaks-database.workers.dev/auth/discord/callback
```

