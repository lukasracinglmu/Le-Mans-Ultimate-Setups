import ast
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("update_changelog", Path(__file__).with_name("update_changelog.py"))
app = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = app
SPEC.loader.exec_module(app)
REPO = "test-owner/test-repo"


class GitTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.git("init", "--initial-branch=main")
        self.git("config", "user.name", "Changelog Test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "core.hooksPath", "/dev/null")
        self.write("CHANGELOG.md", "# Changelog\n\nEinleitung bleibt erhalten.\n\n## 2026-10-20\n\n### Geändert\n\n- Manuell gepflegter Eintrag.\n")
        self.write("index.html", "<p>alt</p>\n")
        self.base = self.commit("Grundstand", "2026-10-20T12:00:00+02:00")
        self.write(app.STATE_PATH, json.dumps({"version": 1, "last_processed_commit": self.base}) + "\n")

    def git(self, *args, env=None):
        return subprocess.check_output(["git", *args], cwd=self.root, text=True,
                                       stderr=subprocess.DEVNULL, env=env).strip()

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value, encoding="utf-8")

    def commit(self, message, date="2026-10-22T12:00:00+02:00"):
        self.git("add", "--all")
        env = dict(os.environ, GIT_AUTHOR_DATE=date, GIT_COMMITTER_DATE=date)
        self.git("commit", "-m", message, env=env)
        return self.git("rev-parse", "HEAD")

    def update(self, **kwargs):
        return app.update(self.root, REPO, **kwargs)

    def test_no_changes_need_no_external_configuration(self):
        self.assertEqual(self.update()["status"], "unchanged")

    def test_german_entry_preserves_manual_text_and_links_real_commit(self):
        original = (self.root / "CHANGELOG.md").read_text()
        self.write("index.html", "<p>neu</p>\n")
        sha = self.commit("Update interface")
        result = self.update()
        saved = (self.root / "CHANGELOG.md").read_text()
        remaining = iter(saved.splitlines())
        for line in original.splitlines():
            self.assertIn(line, remaining)
        self.assertIn("Website-Oberfläche: 1 Datei geändert.", saved)
        self.assertNotIn("Update interface", saved)
        self.assertIn(f"https://github.com/{REPO}/commit/{sha}", saved)
        self.assertLess(saved.index("## 2026-10-22"), saved.index("## 2026-10-20"))
        self.assertEqual(result["processed"], 1)
        self.assertEqual(json.loads((self.root / app.STATE_PATH).read_text())["last_processed_commit"], sha)

    def test_explicit_german_commit_notes_are_used(self):
        self.write("index.html", "neu\n")
        self.commit("Anzeige anpassen\n\nChangelog:\n- [Ergänzt] Gesamtfortschritt für Setup-Uploads angezeigt.\n- [Geändert] Aktuellen Dateinamen beim Upload dargestellt.\n")
        self.update()
        saved = (self.root / "CHANGELOG.md").read_text()
        self.assertIn("Gesamtfortschritt für Setup-Uploads angezeigt.", saved)
        self.assertIn("Aktuellen Dateinamen beim Upload dargestellt.", saved)
        self.assertNotIn("Website-Oberfläche: 1 Datei", saved)

    def test_invalid_note_falls_back_to_neutral_file_description(self):
        self.write("index.html", "neu\n")
        self.commit("Anzeige anpassen\n\nChangelog:\n- [Geändert] <script>unerwünscht</script>\n")
        self.update()
        saved = (self.root / "CHANGELOG.md").read_text()
        self.assertNotIn("<script>", saved)
        self.assertIn("Website-Oberfläche: 1 Datei geändert.", saved)

    def test_invalid_audit_aborts_entire_update_without_cursor_loss(self):
        self.write("index.html", "neu\n")
        self.commit("Anzeige anpassen")
        self.write("audit-logs/2026-10/event.json", "invalid json")
        self.commit("Audit")
        before = [(self.root / p).read_bytes() for p in ("CHANGELOG.md", app.STATE_PATH)]
        with self.assertRaises(app.ChangelogError):
            self.update()
        self.assertEqual(before, [(self.root / p).read_bytes() for p in ("CHANGELOG.md", app.STATE_PATH)])

    def test_retry_and_bot_commit_do_not_duplicate_entries(self):
        self.write("index.html", "neu\n")
        self.commit("Anzeige anpassen")
        self.update()
        saved = (self.root / "CHANGELOG.md").read_bytes()
        cursor = (self.root / app.STATE_PATH).read_bytes()
        self.assertEqual(self.update()["status"], "unchanged")
        self.commit("docs: update changelog automatically [skip ci]")
        self.assertEqual(self.update()["status"], "unchanged")
        self.assertEqual(saved, (self.root / "CHANGELOG.md").read_bytes())
        self.assertEqual(cursor, (self.root / app.STATE_PATH).read_bytes())

    def test_zip_and_audit_are_aggregated_without_account_data(self):
        self.write("setups/Hypercar/Auto/A.zip", "fake zip A")
        self.commit("Add setup: A")
        self.write("setups/Hypercar/Auto/B.zip", "fake zip B")
        self.write("audit-logs/2026-10/event.json", json.dumps({"action": "SETUP_VERSION_UPDATE",
                   "discordUserId": "123456789012345678", "discordAccount": "Private Person", "newValue": "1.4"}))
        self.commit("Audit SETUP_VERSION_UPDATE")
        self.update()
        saved = (self.root / "CHANGELOG.md").read_text()
        self.assertIn("ZIP-Dateien: 2 hinzugefügt", saved)
        self.assertIn("1 Versionsspeicherung", saved)
        self.assertNotIn("123456789012345678", saved)
        self.assertNotIn("Private Person", saved)
        self.assertEqual(saved.count("### Setup-Bestand / Audit-Protokoll"), 1)

    def test_mixed_commit_includes_code_zip_and_permissions(self):
        self.write("index.html", "neu\n")
        self.write("setups/Hypercar/Auto/A.zip", "binary secret content")
        self.write("audit-logs/2026-10/event.json", json.dumps({"action": "PERMISSION_GRANT",
                   "targetDiscordUserId": "123456789012345678"}))
        self.commit("Gemischte Änderung")
        self.update()
        saved = (self.root / "CHANGELOG.md").read_text()
        self.assertIn("Website-Oberfläche", saved)
        self.assertIn("1 hinzugefügt", saved)
        self.assertIn("1 Rechteänderung", saved)
        self.assertNotIn("binary secret content", saved)
        self.assertNotIn("targetDiscordUserId", saved)

    def test_berlin_date_crosses_midnight(self):
        self.write("index.html", "neu\n")
        self.commit("Späte Änderung", "2026-10-21T23:30:00+00:00")
        self.update()
        self.assertIn("## 2026-10-22", (self.root / "CHANGELOG.md").read_text())

    def test_first_parent_merge_includes_merged_changes_once(self):
        self.git("checkout", "-b", "feature")
        self.write("feature.js", "const improved = true;\n")
        self.commit("Feature ergänzen")
        self.git("checkout", "main")
        env = dict(os.environ, GIT_AUTHOR_DATE="2026-10-22T12:00:00+02:00", GIT_COMMITTER_DATE="2026-10-22T12:00:00+02:00")
        self.git("merge", "--no-ff", "feature", "-m", "Feature übernehmen", env=env)
        self.update()
        saved = (self.root / "CHANGELOG.md").read_text()
        self.assertEqual(saved.count("feature.js"), 1)

    def test_dry_run_leaves_both_files_untouched(self):
        self.write("index.html", "neu\n")
        self.commit("Anzeige anpassen")
        before = [(self.root / p).read_bytes() for p in ("CHANGELOG.md", app.STATE_PATH)]
        self.assertTrue(self.update(dry_run=True)["dry_run"])
        self.assertEqual(before, [(self.root / p).read_bytes() for p in ("CHANGELOG.md", app.STATE_PATH)])

    def test_run_limit_keeps_remaining_commits_pending(self):
        self.write("index.html", "eins\n")
        first = self.commit("Erste Änderung")
        self.write("index.html", "zwei\n")
        self.commit("Zweite Änderung")
        with patch.object(app, "MAX_COMMITS", 1):
            result = self.update()
        self.assertEqual(result["remaining"], 1)
        self.assertEqual(json.loads((self.root / app.STATE_PATH).read_text())["last_processed_commit"], first)

    def test_confidential_files_are_not_documented(self):
        self.write(".env.production", "API_KEY=do-not-copy-this\n")
        self.write("server.key", "private key material")
        self.write("index.html", "neu\n")
        self.commit("Konfiguration und Anzeige")
        self.update()
        saved = (self.root / "CHANGELOG.md").read_text()
        for value in (".env.production", "server.key", "do-not-copy-this", "private key material"):
            self.assertNotIn(value, saved)
        self.assertIn("index.html", saved)

    def test_deleted_file_is_described_as_removed(self):
        (self.root / "index.html").unlink()
        self.commit("Remove interface")
        self.update()
        saved = (self.root / "CHANGELOG.md").read_text()
        self.assertIn("### Entfernt", saved)
        self.assertIn("1 Datei entfernt", saved)

    def test_secret_in_explicit_note_is_redacted(self):
        self.write("index.html", "neu\n")
        self.commit('Konfiguration\n\nChangelog:\n- [Geändert] Beispiel token="private-value" aus Konfiguration entfernt.\n')
        self.update()
        saved = (self.root / "CHANGELOG.md").read_text()
        self.assertNotIn("private-value", saved)
        self.assertIn("[Geheimwert entfernt]", saved)

    def test_invalid_cursor_does_not_overwrite_changelog(self):
        self.write(app.STATE_PATH, json.dumps({"version": 1, "last_processed_commit": "0" * 40}))
        before = (self.root / "CHANGELOG.md").read_bytes()
        with self.assertRaises(app.ChangelogError):
            self.update()
        self.assertEqual(before, (self.root / "CHANGELOG.md").read_bytes())


class TextTest(unittest.TestCase):
    def test_same_day_insertion_preserves_existing_categories(self):
        original = "# Changelog\n\n## 2026-10-22 – Nachtrag\n\n### Geändert\n\n- Alter Eintrag.\n\n### Behoben\n\n- Alte Korrektur.\n\n## 2026-10-20\n\nAlt.\n"
        saved = app.insert_entries(original, "2026-10-22", "Geändert", ["- Neuer Eintrag."])
        self.assertEqual(saved.count("## 2026-10-22"), 1)
        self.assertEqual(saved.count("### Geändert"), 1)
        self.assertLess(saved.index("Neuer Eintrag"), saved.index("### Behoben"))
        self.assertTrue(all(line in saved.splitlines() for line in original.splitlines()))

    def test_older_missing_date_is_inserted_in_order(self):
        original = "# Changelog\n\n## 2026-10-22\n\nNeu.\n\n## 2026-10-20\n\nAlt.\n"
        saved = app.insert_entries(original, "2026-10-21", "Geändert", ["- Dazwischen."])
        self.assertLess(saved.index("## 2026-10-22"), saved.index("## 2026-10-21"))
        self.assertLess(saved.index("## 2026-10-21"), saved.index("## 2026-10-20"))

    def test_secrets_and_personal_data_are_redacted(self):
        text = 'api_key="sk-abcdefghijklmnopqrstuvwxyz"; token="secret-value"; user=123456789012345678; mail=test@example.com'
        cleaned = app.redact(text)
        for value in ("sk-abcdefghijklmnopqrstuvwxyz", "secret-value", "123456789012345678", "test@example.com"):
            self.assertNotIn(value, cleaned)

    def test_note_block_ends_at_blank_line(self):
        notes = app.explicit_notes("Titel\n\nChangelog:\n- [Geändert] Die Anzeige angepasst.\n\nWeitere Anmerkung.")
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]["text"], "Die Anzeige angepasst.")

    def test_unknown_category_uses_fallback(self):
        self.assertEqual(app.explicit_notes("Changelog:\n- [Unbekannt] Irgendetwas geändert.\n"), [])

    def test_script_has_no_network_or_ai_dependency(self):
        source = Path(app.__file__).read_text()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    self.assertNotIn(alias.name.split(".")[0], {"urllib", "requests", "http", "socket", "openai", "anthropic"})
        self.assertNotIn("api.openai.com", source)
        self.assertNotIn("OPENAI_API_KEY", source)

    def test_both_workflows_only_use_free_public_repository_runners(self):
        root = Path(__file__).resolve().parents[2]
        for name in ("changelog.yml", "changelog-check.yml"):
            text = (root / ".github/workflows" / name).read_text()
            self.assertIn("toJSON(github.event.repository.private) == 'false'", text)
            self.assertIn("runs-on: ubuntu-24.04", text)
            self.assertNotIn("secrets.", text)
            self.assertNotIn("actions/upload-artifact", text)
            self.assertNotIn("actions/cache", text)


if __name__ == "__main__":
    unittest.main()
