# Admin- und Ticket-Funktionen

## Rechteübersicht

Das Admin-Panel führt Database-, Upload/Delete-, Admin-Panel- und Full-Admin-Rechte getrennt. Nutzerkarten zeigen die aktiven Rechte als Badges. „Alles freigeben“ und „Alles entfernen“ betreffen ausschließlich Database sowie Upload/Delete. Full Admin wird separat vergeben oder entfernt und kann nur vom Haupt-Admin verwaltet werden.

## Ticketverwaltung

Tickets besitzen die Status Offen, In Bearbeitung und Geschlossen. Geschlossene Tickets können gelöscht werden; ihre Nummer wird wegen AUTOINCREMENT nicht wiederverwendet. Die Suche berücksichtigt Ticketnummer, Titel, Ersteller, Discord-ID, Beschreibung, Priorität, Status und Abschlussnachricht.

## Benachrichtigungen

Beim Erstellen wird die vollständige Bugmeldung als eine Nachricht mit Ticketnummer und Mention des Absenders versendet. Statuswechsel und Abschluss benachrichtigen den Reporter. Fehler beim Reporter-DM-Versand verhindern die Statusänderung nicht. Beim Löschen wird keine DM versendet.

## Audit

Rechteänderungen, Full-Admin-Änderungen, Admin-Panel-Änderungen sowie Setup- und Ticketaktionen werden im bestehenden Audit-Channel protokolliert. Audit-Fehler blockieren die eigentliche Aktion nicht.

## Wartungsmodus

Der Wartungsmodus ist für eine editierbare Meldung vorgesehen. Während des Wartungsmodus bleibt der Zugriff für Full-Admins möglich; andere Besucher sehen ausschließlich die Wartungsseite.
