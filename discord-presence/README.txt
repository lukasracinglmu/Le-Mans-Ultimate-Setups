LMU SETUP-REQUEST-BOT – STRECKENVORSCHLÄGE

BOT-HOSTER
1. index.js durch die neue Version aus diesem Ordner ersetzen.
2. request-tracks.js in denselben Ordner wie index.js hochladen.
3. Startup-Datei: index.js (package.json enthält weiterhin "node index.js").
4. Bot vollständig stoppen und wieder starten.

Keine neuen Pakete, Variablen, API-Keys oder Tokens erforderlich.
Die vorhandene .env und setups.json bleiben bestehen. Keine .env überschreiben.
Beim Start registriert der Bot /request automatisch neu.
Erfolgsmeldung im Log: "Slash-Command /request wurde registriert."

VERWENDUNG
/request -> fahrzeug: Fahrzeug auswählen -> strecke: erste Buchstaben eingeben.
Beide Felder haben eigene Vorschläge. Discord zeigt höchstens 25 Vorschläge;
mit Buchstaben wird die Liste eingegrenzt. Strecke und Layout auswählen.
Kurzformen wie Spa, COTA, Portimao und Le Mans werden erkannt.
Unbekannte Strecken werden nicht abgeschickt.

DATEIEN
index.js: Präsenz, /request, Fahrzeug-/Streckensuche, Vorhanden-Prüfung und Bestätigungsbutton.
request-tracks.js: gemeinsame Liste von 32 Strecken/Layout-Einträgen für Website und Bot.
bot.js: altes, reines Präsenz-Skript; verarbeitet keine Setup Requests.

BESTEHENDE FUNKTIONEN
Die Setup-Supply-Rolle/Whitelist für den Bestätigungsbutton bleibt erhalten.
Der Rollen-Tag bei neuen Anfragen bleibt sichtbar, ohne Rollen-Ping.
Vorhandene Setups führen weiterhin zur Fahrzeugseite; Layouts werden unterschieden.
