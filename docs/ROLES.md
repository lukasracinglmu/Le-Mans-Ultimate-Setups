# Rollen- und Rechteübersicht

Diese Übersicht beschreibt die vorgesehenen Website-Rechte der Discord-Rollen.

## Teamrolle

- Sieht oben auf der Website **Bug melden** und **Setup Request**.
- Kann die Fahrzeugdatenbank öffnen.
- Kann Setups ausschließlich herunterladen.
- Kann keine Setups hochladen, bearbeiten oder löschen.
- Hat keinen Zugriff auf das Admin-Panel.

## Setup-Supply-Rolle

- Sieht oben auf der Website **Bug melden** und **Setup Request**.
- Kann die Fahrzeugdatenbank öffnen.
- Kann Setups hochladen, bearbeiten und löschen.
- Hat keinen Zugriff auf das Admin-Panel.

## Owner-Rolle

- Sieht **Bug melden**, **Setup Request** und **Admin-Panel**.
- Hat vollständige Rechte für Upload, Bearbeitung und Löschung von Setups.
- Kann Database- und Upload/Delete-Freigaben verwalten und die Liste freigegebener Nutzer sehen.
- Die Rollen-Zuordnung erfolgt automatisch über denselben Anmeldeweg wie für Team und Setup Supply.
- Diese Serverrolle erteilt keine persönlichen Owner-Rechte für Tickets, Backups oder Wartungsmodus.

## Individuelle Admin-Freigaben

### Admin-Panel-Freigabe

Eine Person mit Admin-Panel-Freigabe sieht im Admin-Panel nur:

- Database- und Upload-Rechte
- Freigegebene User

Sie kann ausschließlich Database- und Upload/Delete-Rechte vergeben oder entfernen.

### Full Admin

Eine Person mit Full-Admin-Freigabe sieht alle Bereiche:

- Database- und Upload-Rechte
- Admin-Rechte
- Freigegebene User

Tickets, Backups und Wartungsmodus bleiben ausschließlich dem persönlichen Owner vorbehalten. Eine Full-Admin-Freigabe oder die Discord-Owner-Rolle gibt diese Bereiche nicht frei.

## Grundsatz

Die Berechtigungen werden sowohl in der Benutzeroberfläche als auch serverseitig geprüft. Das Ausblenden eines Bereichs allein gilt nicht als Sicherheitsmaßnahme; nicht erlaubte API-Aufrufe werden ebenfalls abgewiesen.
