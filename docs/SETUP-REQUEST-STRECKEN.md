# Streckenvorschläge für Setup Requests

Die bestätigte Liste enthält 32 Strecken und Layouts. Die einzige Datenquelle ist
`discord-presence/request-tracks.js`; Website und Bot verwenden dieselben Namen und Kurzformen.

## Website

Unter `/request` im Feld **Strecke** mindestens zwei Zeichen eingeben.
Bis zu acht passende Einträge erscheinen unter dem Feld. Klick oder Pfeiltasten und
Enter übernehmen einen Vorschlag; Escape schließt die Liste. Groß-/Kleinschreibung,
Akzente und Trennzeichen spielen bei der Suche keine Rolle. Kurzformen wie
`Spa`, `COTA`, `Portimao` oder `Silverstone` sind hinterlegt.

Es werden nur die bestätigten Strecken/Layout-Namen gesendet. Bekannte exakt
eingegebene Kurzformen werden beim Verlassen des Feldes bzw. Absenden in den
Listennamen umgewandelt. Unbekannte Angaben werden auch serverseitig abgewiesen.
Die Fahrzeugauswahl und das optionale Nachrichtenfeld behalten ihr Verhalten.

Die unvertrauliche Liste wird einmal unter `/api/request/tracks` als JSON geladen.
Die Daten stammen direkt aus dem gebündelten Modul; dafür ist kein GitHub-Abruf
notwendig. Die Suche selbst läuft danach lokal ohne weitere Netzwerkanfragen
pro Tastendruck. Die Fahrzeugauswahl startet unabhängig von der Streckenliste.

## Discord

Bei `/request` haben **fahrzeug** und **strecke** unabhängige Autovervollständigung.
Es werden höchstens 25 passende Vorschläge je Antwort angezeigt. Die Suche
funktioniert auch, wenn das andere Pflichtfeld noch nicht ausgefüllt ist.
Discord erlaubt trotz Autovervollständigung Freitext; deshalb prüft der Bot die
Strecke vor dem Senden erneut.

Die Vorhanden-Prüfung berücksichtigt kurze Dateinamen wie Spa, COTA und Le Mans
sowie die erkennbaren Layout-Namen. Eine als National benannte Datei ersetzt
keinen GP-Request. Der vorhandene Link zum Setup, der Bestätigungsbutton,
die Whitelist und die Rollen-Ping-Einstellungen bleiben bestehen.

## Installation beim Bot-Hoster

1. Neue `discord-presence/index.js` als `index.js` hochladen.
2. Neue `discord-presence/request-tracks.js` daneben hochladen.
3. Startdatei `index.js`, Startbefehl `node index.js`.
4. Bot stoppen und neu starten. Beim Start wird der Guild-Befehl neu registriert.

Keine neuen Abhängigkeiten, Secrets oder kostenpflichtigen Dienste. Vorhandene
`.env` und `setups.json` behalten. Das alte `bot.js` ist nur ein Präsenz-Bot.

Discord-Referenz: https://discordjs.guide/legacy/slash-commands/autocomplete
