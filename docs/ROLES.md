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
- Kann Database-, Upload/Delete- und Admin-Panel-Freigaben verwalten.
- Full-Admins können zusätzlich den Wartungsmodus und weitere Adminrechte verwalten.

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
- Wartungsmodus
- Freigegebene User

Full-Admins können die entsprechenden Rechte verwalten. Die Haupt-Owner-Rechte bleiben davon getrennt und können nicht entfernt werden.

## Grundsatz

Die Berechtigungen werden sowohl in der Benutzeroberfläche als auch serverseitig geprüft. Das Ausblenden eines Bereichs allein gilt nicht als Sicherheitsmaßnahme; nicht erlaubte API-Aufrufe werden ebenfalls abgewiesen.
