# Sicherheitsrichtlinie

## Meldung von Sicherheitsproblemen

Bitte veröffentliche keine Details zu Sicherheitslücken in einem öffentlichen Issue.

Nutze stattdessen eine private GitHub-Sicherheitsmeldung oder kontaktiere den Repository-Betreiber direkt. Beschreibe möglichst:

- betroffene URL oder Funktion,
- reproduzierbare Schritte,
- erwartetes und tatsächliches Verhalten,
- mögliche Auswirkungen,
- Screenshots oder Logs ohne Tokens, Cookies oder personenbezogene Geheimnisse.

## Umgang mit Geheimnissen

Tokens, Session-Secrets, Discord-Schlüssel und GitHub-Zugangsdaten gehören ausschließlich in Cloudflare Secrets oder lokale Umgebungsvariablen. Sie dürfen niemals in Commits, Issues, Logs oder Screenshots erscheinen.

## Unterstützte Sicherheitsmaßnahmen

Das Projekt verwendet unter anderem signierte Sessions, CSRF-/Origin-Prüfungen, Content-Security-Policy, sichere Response-Header, Größenlimits, Dateitypprüfung, serverseitige Berechtigungsprüfung sowie automatisierte GitHub-Sicherheitsprüfungen.

