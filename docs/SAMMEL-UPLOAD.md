# Sammel-Upload für Setups

Auf der Fahrzeugübersicht steht für Nutzer mit Uploadrecht der Button **Sammel-Upload**.
Der normale Upload innerhalb eines Fahrzeugs bleibt erhalten.

## Ablauf

1. Bis zu 50 einzelne Setup-ZIP-Dateien auswählen, jeweils maximal 25 MiB. Eine äußere Sammel-ZIP wird nicht entpackt.
2. Die Vorschau schlägt das Fahrzeug anhand des Dateinamens vor. Klasse und Fahrzeug stammen aus demselben aktuellen Katalog wie die Übersicht.
3. Jede Zuordnung prüfen. Sie lässt sich ändern; unbekannte oder mehrdeutige Dateien müssen zugeordnet oder übersprungen werden. Ohne gültige Auswahl startet kein Upload.
4. Eine gemeinsame Version oder unterschiedliche Versionen je Datei angeben. Versionsfelder bleiben wie bisher optional (maximal 40 Zeichen).
5. Bei passenden vorhandenen Setups desselben Anbieters den bisherigen Umgang wählen: behalten, ersetzen, alte Datei nach erfolgreichem Speichern löschen oder als veraltet markieren.
6. Die ZIPs werden nacheinander über denselben geschützten Upload wie bisher gespeichert. Fortschritt und Ergebnis jeder Datei erscheinen in der Übersicht. Währenddessen die Seite geöffnet lassen.

## Erkennung und Schutz bestehender Setups

- Die Erkennung verwendet feste Fahrzeugnamen und eindeutige Kurzformen wie 499P, BMW V8, Huracan oder Ginetta; keine KI und kein externer Erkennungsdienst.
- Peugeot 9X8 und Peugeot 9X8 Evo bleiben getrennt. Nur „Peugeot“ oder „BMW“ ist keine eindeutige Zuordnung.
- Die Erkennung liest den ZIP-Dateinamen, nicht den Inhalt. Bei ungebräuchlichen Namen bleibt die manuelle Auswahl möglich.
- Versionen, identische ZIP-Inhalte und vorhandene Dateien werden über die bisherigen Prüfungen behandelt. Anbieter, Dateifamilie und Zielfahrzeug begrenzen die Auswahl alter Setups.
- Eine alte Datei kann innerhalb eines Durchlaufs nicht mehrfach als betroffenes Ziel ausgewählt werden.
- Es gibt keine pauschale Ersetzung aller Dateien eines Fahrzeugs. Änderungen an alten Dateien erfolgen entsprechend der ausdrücklichen Auswahl und erst nach bestätigter Speicherung der neuen ZIP.
- Ein fehlgeschlagener Upload stoppt nicht alle weiteren Dateien. Wiederholungsversuche beachten die bisherigen Server-Wartezeiten; anschließend lassen sich nur die fehlgeschlagenen Dateien erneut versuchen.
- Gleiche Dateinamen für verschiedene Fahrzeuge haben getrennte Ergebnisse. Cache und Übersichtszähler werden nach dem Durchlauf aktualisiert.

## Berechtigungen und Betrieb

Der Button erscheint ausschließlich mit bestehendem Uploadrecht. Jede einzelne Speicherung wird weiterhin serverseitig autorisiert. Downloadrechte allein reichen nicht aus. Es werden keine neuen Dienste, Schlüssel, Datenbanken oder kostenpflichtigen Ressourcen eingerichtet.

Der Sammel-Upload verwendet denselben Audit- und Benachrichtigungsweg wie der bisherige Upload. Er fügt keinen eigenen Versand hinzu. Adminfunktionen, Backups, Wartungsmodus, Favoriten und die Katalogfilter werden nicht umgebaut.

