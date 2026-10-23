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

| Name | Aktueller Wert | Zweck |
| :--- | :--- | :--- |
| `DISCORD_CLIENT_ID` | `1556978316404068452` | ID der Discord-Anwendung für Login und Slash-Befehl. |
| `DISCORD_GUILD_ID` | `1464926567401652418` | Discord-Server für Rollenprüfung und Requests. |
| `DISCORD_DATABASE_ROLE_ID` | `1464926567401652420` | Teamrolle für Datenbank und Downloads. |
| `DISCORD_UPLOAD_ROLE_ID` | `1538601074074849330` | Setup-Supply-Rolle für Upload, Löschen und Bearbeiten. |
| `DISCORD_OWNER_ROLE_ID` | `1464926567401652423` | Rolle für Admin-Panel und persönliche Freigaben. |
| `DISCORD_OWNER_USER_ID` | `1033453785416208564` | Persönliche Owner-ID mit vollständigem Zugriff. |
| `DISCORD_CHANNEL_ID` | `1557002876906377258` | Zielkanal für Setup Requests. |
| `DISCORD_AUDIT_CHANNEL_ID` | `1560579797472645151` | Zielkanal für Änderungsprotokolle. |
| `DISCORD_SETUP_REQUEST_ROLE_ID` | `1538601074074849330` | Rolle, die bei Setup Requests erwähnt wird. |
| `SITE_URL` | `https://le-mans-ultimate-setups.3peaks-database.workers.dev` | Öffentliche Adresse und Grundlage des Discord-Redirects. |
| `GITHUB_OWNER` | `lukasracinglmu` | Besitzer des GitHub-Repositorys. |
| `GITHUB_REPO` | `Le-Mans-Ultimate-Setups` | Name des GitHub-Repositorys. |
| `GITHUB_BRANCH` | `main` | Branch für Website, Setups und Audit-Logs. |

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
| `LMUPORTAL_API1` | Der aktuelle Worker verwendet die LMU-Portal-Anbindung nicht. |
| `LMUPORTAL_API2` | Der aktuelle Worker verwendet die LMU-Portal-Anbindung nicht. |
| `UPLOADS_R2` | Setup-ZIPs werden direkt in GitHub gespeichert. |
| `UPLOAD_QUEUE` | Uploads werden direkt und nacheinander verarbeitet. |

Die ungenutzten Einträge können aus der Worker-Konfiguration entfernt werden. Bei R2 und Queue sollte zuerst geprüft werden, ob dort noch Daten oder Nachrichten liegen. Das Entfernen eines Bindings löscht die zugehörige Cloudflare-Ressource nicht automatisch.

## Secrets setzen

```bash
npx wrangler@4 secret put DISCORD_CLIENT_SECRET
npx wrangler@4 secret put DISCORD_BOT_TOKEN
npx wrangler@4 secret put GITHUB_TOKEN
npx wrangler@4 secret put SESSION_SECRET
```

Der Discord-Redirect muss zu `SITE_URL` passen:

```text
https://le-mans-ultimate-setups.3peaks-database.workers.dev/auth/discord/callback
```
