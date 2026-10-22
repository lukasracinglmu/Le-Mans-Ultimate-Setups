# Automatischer Changelog ohne KI-Dienst

Die Automation ergänzt `CHANGELOG.md` selbstständig nach Änderungen auf `main`. Sie benötigt weder einen API-Schlüssel noch ein kostenpflichtiges KI-Abonnement.

## Kosten und Ausführung

Das Repository ist öffentlich. Die verwendeten Standard-Runner `ubuntu-24.04` sind für öffentliche Repositories kostenlos. Beide Changelog-Workflows prüfen vor dem Start eines Jobs ausdrücklich, dass das Ereignis aus einem öffentlichen Repository stammt. Bei einem privaten Repository werden die Jobs übersprungen.

Die Automation verwendet keine KI-API, keine kostenpflichtigen Actions, keine größeren Runner und keine hochgeladenen Artefakte oder Caches. Sie verändert keine Rechnungs-, Tarif- oder Sichtbarkeitseinstellungen des Kontos.

Technische Änderungen auf `main` starten die Aktualisierung. ZIP-Uploads und Audit-Dateien werden beim nächsten technischen Update oder im täglichen Lauf um 03:23 UTC gesammelt berücksichtigt. Zusätzlich ist **Actions → Changelog automatisch ergänzen → Run workflow** verfügbar.

## Wie die deutschen Texte entstehen

Für jeden technischen Commit wird zuerst ein freiwilliger `Changelog:`-Abschnitt in der Commit-Nachricht gesucht. Daraus übernimmt das Skript gültige Beschreibungen und ergänzt das Datum sowie einen echten Commit-Link.

Beispiel einer Commit-Nachricht:

```text
Upload-Anzeige erweitern

Changelog:
- [Ergänzt] Gesamtfortschritt des aktuellen Upload-Vorgangs angezeigt.
- [Geändert] Aktuellen Dateinamen während des Uploads sichtbar gemacht.
```

Erlaubte Kategorien sind `Ergänzt`, `Geändert`, `Behoben`, `Entfernt`, `Dokumentation` und `Wartung`. Die Einträge stehen unmittelbar unter `Changelog:`; eine Leerzeile nach den Einträgen beendet den Abschnitt.

Ohne diesen Abschnitt erstellt die Automation deutsche Einträge aus dem betroffenen Projektbereich, den Dateinamen und dem tatsächlichen Status der Änderungen. Zum Beispiel:

```text
Website-Oberfläche: 1 Datei geändert. Betroffen: index.html.
```

Diese festen Formulierungen beschreiben die nachweisbaren Dateiänderungen. Eine selbstständige inhaltliche KI-Auswertung findet nicht statt. Ausführliche Funktionsbeschreibungen werden aus dem freiwilligen Commit-Abschnitt übernommen.

ZIP-Dateien werden nach Hinzufügen, Entfernen und Ändern gezählt. Für Audit-Dateien werden die tatsächlichen Ereignisarten zusammengefasst. Die Darstellung übernimmt keine Accounts oder Nutzer-IDs aus den Audit-Daten.

## Speicherung und Zuverlässigkeit

* Datum nach Commit-Zeit in `Europe/Berlin` und echte Commit-Links.
* Vorhandene manuelle Changelog-Texte bleiben erhalten.
* Der Cursor unter `.github/changelog/state.json` verhindert doppelte Verarbeitung.
* Historie bis zum manuell nachgetragenen Stand `6e3d38c` wird nicht erneut verarbeitet.
* Zusammengeführte Änderungen werden über die erste Elternlinie vollständig berücksichtigt.
* Pro Lauf höchstens 2.000 Commits; ein Rest bleibt für den nächsten Lauf offen.
* Die Automation schreibt ausschließlich `CHANGELOG.md` und den Cursor.
* Gleichzeitige Changelog-Jobs sind gesperrt. Bei zwischenzeitlichen Änderungen an `main` wird höchstens zweimal mit neuem Stand wiederholt.
* Bot-Commits erzeugen keine endlose Kette weiterer Cursor-Commits.
* Environment-Dateien und private Schlüssel werden nicht dokumentiert. Erkennbare Geheimwerte, E-Mail-Adressen und Discord-IDs werden aus übernommenen Texten entfernt.
* Bei ungültigen Audit-Daten oder einem ungültigen Cursor wird der Lauf abgebrochen, ohne einen halbfertigen Stand zu speichern.

Nur der Aktualisierungsjob benötigt `contents: write`, um die beiden Dateien mit dem eingebauten GitHub-Token zu speichern. Der separate Prüfworkflow besitzt nur Leserechte. Externe KI-Dienste und zusätzliche Secrets werden nicht verwendet.

Die Workflows führen selbst keine Website- oder Cloudflare-Deployments aus. Direkte Änderungen im Cloudflare-Dashboard sind nicht Teil der Git-Historie und werden hier nicht automatisch erfasst.

## Prüfen

```bash
python3 -m unittest discover -s .github/changelog -p 'test_*.py' -v
python3 .github/changelog/update_changelog.py --dry-run
```

Der Probelauf schreibt keine Dateien. Beide Befehle funktionieren ohne KI-Zugang.

[GitHub: kostenlose Nutzung von Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
