# Automatischer Changelog

Die KI-Automation ist als inaktive Vorlage unter `.github/changelog/changelog.yml.example` vorbereitet. Aktiv ist zunächst ausschließlich der Prüfworkflow **Changelog-Automation prüfen**: Er hat nur Leserechte und führt Tests mit nachgebildeten KI-Antworten aus. Er sendet keine Repository-Diffs an die OpenAI-API und schreibt keine Repository-Dateien.

Nach ausdrücklicher Freigabe kann die Vorlage nach `.github/workflows/changelog.yml` übernommen werden. Der dann aktive Workflow ergänzt `CHANGELOG.md` nach technischen Änderungen auf `main`. ZIP-Uploads und Audit-Dateien werden gesammelt beim nächsten technischen Update oder im täglichen Lauf um 03:23 UTC berücksichtigt. Er lässt sich außerdem unter **Actions → Changelog automatisch ergänzen → Run workflow** starten.

## Einmalig aktivieren

1. Ausdrücklich freigeben, dass der aktive Workflow `contents: write` für Repository-Commits erhält und bereinigte Code-Diffs zur Textgenerierung an die OpenAI-API übermitteln darf. Die Vorlage schreibt ausschließlich Changelog und Cursor.
2. Danach die Vorlage als `.github/workflows/changelog.yml` aktivieren.
3. Einen OpenAI-API-Schlüssel für ein Projekt mit verfügbarem API-Guthaben erstellen.
4. In diesem Repository **Settings → Secrets and variables → Actions → New repository secret** öffnen und `OPENAI_API_KEY` als Secret hinterlegen.
5. Unter **Actions → Changelog automatisch ergänzen → Run workflow** einmal `main` starten.

Der Schlüssel gehört nicht in Quellcode, Changelog, Cloudflare-Variablen oder den Chat. Falls GitHub Actions für das Repository deaktiviert ist, muss es unter **Settings → Actions → General** aktiviert werden. Der Workflow fordert `contents: write` für seinen GitHub-Token an. Eine vorhandene Branch-Regel muss diesen Bot-Push zulassen; die Automation ändert keine Schutzregeln.

Die Textgenerierung nutzt standardmäßig `gpt-5.4-mini` über die OpenAI Responses API. API-Aufrufe werden separat nach Nutzung abgerechnet. Optional kann die Repository-Variable `CHANGELOG_MODEL` ein anderes zur verwendeten API und zum JSON-Schema passendes Modell festlegen.

## Was nach Aktivierung automatisch passiert

* Neue Commits werden ab dem gespeicherten Git-Cursor geprüft; bereits dokumentierte Historie bis `6e3d38c` wird nicht erneut verarbeitet.
* Die KI erhält Commit-Titel, Dateiliste und den tatsächlichen Code-Diff. Sie hat keine Tools und liefert ausschließlich geprüfte Textfelder.
* Datum und echte Commit-Links werden vom Skript ergänzt. Die Datierung erfolgt nach Commit-Zeit in `Europe/Berlin`.
* Neue Einträge werden unter dem passenden Datum und einer deutschen Kategorie ergänzt. Vorhandene manuelle Texte bleiben erhalten.
* ZIP-Änderungen und Audit-Ereignisse werden anhand der tatsächlichen Dateien gezählt. Inhalte mit Accounts, User-IDs oder Berechtigungszielen werden nicht an die KI weitergereicht.
* Auch gemischte Commits mit Code und ZIP-/Audit-Dateien werden berücksichtigt. ZIP-Inhalte werden nicht als KI-Eingabe verwendet.
* Token-Muster, E-Mail-Adressen, Discord-IDs und erkennbare literale Geheimwerte werden vor einem KI-Aufruf entfernt. Environment-Dateien sowie private Schlüssel sind von den KI-Diffs ausgeschlossen.
* Die KI darf keine erfolgreichen Tests, Deployments oder Production-Prüfungen aus bloß vorhandenem Code ableiten.
* Nur `CHANGELOG.md` und `.github/changelog/state.json` werden durch einen automatischen Commit geändert.

## Verhalten bei Fehlern

Ohne `OPENAI_API_KEY` bleibt ein Lauf mit technischen Änderungen wartend: Er zeigt einen Hinweis in der Actions-Zusammenfassung und markiert keine dieser Änderungen als erledigt. Nach Hinterlegen des Secrets kann derselbe Stand erneut verarbeitet werden. Reine ZIP-/Audit-Zusammenfassungen benötigen keinen KI-Aufruf.

Bei API-Fehlern, ungültigen Antworten, zu großen Diffs oder einem nicht mehr gültigen Git-Cursor wird kein neuer Changelog-Stand gespeichert. Pro Lauf werden höchstens 2.000 Commits und acht technische Commits verarbeitet; verbleibende Änderungen bleiben für den nächsten Lauf offen. Ein einzelner vollständiger Diff darf maximal 300.000 Zeichen enthalten. Diese Grenzen verhindern unbemerkte Kürzungen und begrenzen die Anzahl der KI-Aufrufe.

Parallel laufende Changelog-Jobs sind gesperrt. Vor dem Schreiben wird der aktuelle Stand von `main` geladen. Wenn während des Pushs neue Commits eingehen, wird mit aktuellem Stand höchstens zweimal erneut generiert. Alte Remote-Commits werden nicht überschrieben.

Die Changelog-Commits nutzen den eingebauten `GITHUB_TOKEN`. Eigene Änderungen an Changelog und Cursor sind außerdem aus dem Push-Auslöser ausgenommen. Der Workflow führt keine Website- oder Cloudflare-Deployments aus. Bestehende externe Build-Integrationen werden durch diese Einrichtung nicht verändert.

Direkte Änderungen im Cloudflare-Dashboard sind nicht Teil der Git-Historie und werden hier nicht automatisch erfasst. Die KI-Zusammenfassungen ersetzen keine Funktionsprüfung des Website-Codes.

## Lokal prüfen

```bash
python3 -m unittest discover -s .github/changelog -p 'test_*.py' -v
```

Ein vollständiger Probelauf mit KI-Aufrufen und ohne Dateischreibzugriff ist über `python3 .github/changelog/update_changelog.py --dry-run` möglich. Er benötigt bei technischen Änderungen ebenfalls den API-Schlüssel und kann API-Kosten verursachen.

## Dokumentation

* [GitHub: Workflow-Auslöser](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
* [GitHub: Repository-Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
* [OpenAI: strukturierte Ausgaben](https://developers.openai.com/api/docs/guides/structured-outputs)
* [OpenAI: GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
