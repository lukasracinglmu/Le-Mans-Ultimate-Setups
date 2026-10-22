import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error


SPEC = importlib.util.spec_from_file_location("update_changelog", Path(__file__).with_name("update_changelog.py"))
app = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = app
SPEC.loader.exec_module(app)
REPO = "test-owner/test-repo"


def note(context, key, model):
    return [{"category": "Geändert", "text": "Die Upload-Anzeige wurde angepasst."}]


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
        return subprocess.check_output(["git", *args], cwd=self.root, text=True, stderr=subprocess.DEVNULL, env=env).strip()

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value, encoding="utf-8")

    def commit(self, subject, date="2026-10-22T12:00:00+02:00"):
        self.git("add", "--all")
        env = dict(os.environ, GIT_AUTHOR_DATE=date, GIT_COMMITTER_DATE=date)
        self.git("commit", "-m", subject, env=env)
        return self.git("rev-parse", "HEAD")

    def update(self, **kwargs):
        return app.update(self.root, REPO, kwargs.pop("api_key", "test-key"), "test-model", generator=kwargs.pop("generator", note), **kwargs)

    def test_no_changes_do_not_need_key(self):
        generator = Mock()
        self.assertEqual(self.update(api_key="", generator=generator)["status"], "unchanged")
        generator.assert_not_called()

    def test_code_uses_full_diff_and_preserves_manual_text(self):
        original = (self.root / "CHANGELOG.md").read_text()
        self.write("index.html", "<p>neu</p>\n")
        sha = self.commit("Anzeige anpassen")
        generator = Mock(side_effect=note)
        result = self.update(generator=generator)
        context = generator.call_args.args[0]
        self.assertIn("-<p>alt</p>", context["diff"])
        self.assertIn("+<p>neu</p>", context["diff"])
        self.assertEqual(context["files"], ["index.html"])
        saved = (self.root / "CHANGELOG.md").read_text()
        remaining_lines = iter(saved.splitlines())
        for line in original.splitlines():
            self.assertIn(line, remaining_lines)
        self.assertIn(f"https://github.com/{REPO}/commit/{sha}", saved)
        self.assertLess(saved.index("## 2026-10-22"), saved.index("## 2026-10-20"))
        self.assertEqual(result["processed"], 1)
        self.assertEqual(json.loads((self.root / app.STATE_PATH).read_text())["last_processed_commit"], sha)

    def test_missing_key_does_not_advance_or_write(self):
        self.write("index.html", "<p>neu</p>\n")
        self.commit("Anzeige anpassen")
        before = [(self.root / path).read_bytes() for path in ("CHANGELOG.md", app.STATE_PATH)]
        generator = Mock()
        with self.assertRaises(app.MissingKey):
            self.update(api_key="", generator=generator)
        self.assertEqual(before, [(self.root / path).read_bytes() for path in ("CHANGELOG.md", app.STATE_PATH)])
        generator.assert_not_called()

    def test_failed_second_summary_rolls_back_entire_run(self):
        self.write("index.html", "eins\n")
        self.commit("Erste Änderung")
        self.write("index.html", "zwei\n")
        self.commit("Zweite Änderung")
        before = [(self.root / path).read_bytes() for path in ("CHANGELOG.md", app.STATE_PATH)]
        generator = Mock(side_effect=[note(None, None, None), app.ChangelogError("API nicht verfügbar")])
        with self.assertRaises(app.ChangelogError):
            self.update(generator=generator)
        self.assertEqual(before, [(self.root / path).read_bytes() for path in ("CHANGELOG.md", app.STATE_PATH)])

    def test_retry_and_bot_commit_do_not_duplicate_entries(self):
        self.write("index.html", "neu\n")
        self.commit("Anzeige anpassen")
        self.update()
        saved = (self.root / "CHANGELOG.md").read_bytes()
        cursor = (self.root / app.STATE_PATH).read_bytes()
        generator = Mock()
        self.assertEqual(self.update(generator=generator)["status"], "unchanged")
        self.commit("docs: update changelog automatically [skip ci]")
        self.assertEqual(self.update(generator=generator)["status"], "unchanged")
        self.assertEqual(saved, (self.root / "CHANGELOG.md").read_bytes())
        self.assertEqual(cursor, (self.root / app.STATE_PATH).read_bytes())
        generator.assert_not_called()

    def test_zip_and_audit_are_aggregated_without_ai(self):
        self.write("setups/Hypercar/Auto/A.zip", "fake zip A")
        self.commit("Add setup: A")
        self.write("setups/Hypercar/Auto/B.zip", "fake zip B")
        self.write("audit-logs/2026-10/event.json", json.dumps({"action": "SETUP_VERSION_UPDATE", "discordUserId": "123456789012345678", "discordAccount": "Private Person", "newValue": "1.4"}))
        self.commit("Audit SETUP_VERSION_UPDATE")
        generator = Mock()
        self.update(api_key="", generator=generator)
        saved = (self.root / "CHANGELOG.md").read_text()
        self.assertIn("ZIP-Dateien: 2 hinzugefügt", saved)
        self.assertIn("1 Versionsspeicherungen", saved)
        self.assertNotIn("123456789012345678", saved)
        self.assertNotIn("Private Person", saved)
        self.assertEqual(saved.count("### Setup-Bestand / Audit-Protokoll"), 1)
        generator.assert_not_called()

    def test_mixed_commit_includes_code_and_routine_changes(self):
        self.write("index.html", "neu\n")
        self.write("setups/Hypercar/Auto/A.zip", "binary secret content")
        self.write("audit-logs/2026-10/event.json", json.dumps({"action": "PERMISSION_GRANT", "targetDiscordUserId": "123456789012345678"}))
        self.commit("Gemischte Änderung")
        generator = Mock(side_effect=note)
        self.update(generator=generator)
        context = generator.call_args.args[0]
        self.assertNotIn("binary secret content", context["diff"])
        self.assertNotIn("targetDiscordUserId", context["diff"])
        saved = (self.root / "CHANGELOG.md").read_text()
        self.assertIn("Upload-Anzeige", saved)
        self.assertIn("1 hinzugefügt", saved)
        self.assertIn("1 Rechteänderungen", saved)

    def test_berlin_date_crosses_midnight(self):
        self.write("index.html", "neu\n")
        self.commit("Späte Änderung", "2026-10-21T23:30:00+00:00")
        generator = Mock(side_effect=note)
        self.update(generator=generator)
        self.assertEqual(generator.call_args.args[0]["date"], "2026-10-22")

    def test_first_parent_merge_includes_merged_changes(self):
        self.git("checkout", "-b", "feature")
        self.write("feature.js", "const improved = true;\n")
        self.commit("Feature ergänzen")
        self.git("checkout", "main")
        env = dict(os.environ, GIT_AUTHOR_DATE="2026-10-22T12:00:00+02:00", GIT_COMMITTER_DATE="2026-10-22T12:00:00+02:00")
        self.git("merge", "--no-ff", "feature", "-m", "Feature übernehmen", env=env)
        generator = Mock(side_effect=note)
        self.update(generator=generator)
        self.assertEqual(generator.call_count, 1)
        self.assertIn("const improved = true", generator.call_args.args[0]["diff"])

    def test_dry_run_leaves_both_files_untouched(self):
        self.write("index.html", "neu\n")
        self.commit("Anzeige anpassen")
        before = [(self.root / path).read_bytes() for path in ("CHANGELOG.md", app.STATE_PATH)]
        self.assertTrue(self.update(dry_run=True)["dry_run"])
        self.assertEqual(before, [(self.root / path).read_bytes() for path in ("CHANGELOG.md", app.STATE_PATH)])

    def test_run_limit_keeps_remaining_commits_pending(self):
        self.write("index.html", "eins\n")
        first = self.commit("Erste Änderung")
        self.write("index.html", "zwei\n")
        self.commit("Zweite Änderung")
        with patch.object(app, "MAX_AI_COMMITS", 1):
            result = self.update()
        self.assertEqual(result["remaining"], 1)
        self.assertEqual(json.loads((self.root / app.STATE_PATH).read_text())["last_processed_commit"], first)

    def test_oversized_diff_is_not_silently_truncated(self):
        self.write("index.html", "x" * 1000)
        self.commit("Große Änderung")
        before = (self.root / app.STATE_PATH).read_bytes()
        generator = Mock()
        with patch.object(app, "MAX_PATCH_CHARS", 10), self.assertRaises(app.ChangelogError):
            self.update(generator=generator)
        self.assertEqual(before, (self.root / app.STATE_PATH).read_bytes())
        generator.assert_not_called()

    def test_confidential_files_are_excluded_from_model_input(self):
        self.write(".env.production", "OPENAI_API_KEY=do-not-send-this\n")
        self.write("server.key", "private key material")
        self.write("index.html", "neu\n")
        self.commit("Konfiguration und Anzeige")
        generator = Mock(side_effect=note)
        self.update(generator=generator)
        context = generator.call_args.args[0]
        self.assertNotIn("do-not-send-this", context["diff"])
        self.assertNotIn("private key material", context["diff"])
        self.assertEqual(context["files"], ["index.html"])


class TextTest(unittest.TestCase):
    def test_same_day_insertion_preserves_old_lines_and_categories(self):
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
        source = 'OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"; token="secret-value"; user=123456789012345678; mail=test@example.com'
        cleaned = app.redact(source)
        for secret in ("sk-abcdefghijklmnopqrstuvwxyz", "secret-value", "123456789012345678", "test@example.com"):
            self.assertNotIn(secret, cleaned)

    def test_response_schema_rejects_links_and_injected_headings(self):
        for text in ("## Neue Überschrift", "Änderung\n## Falsch", "Siehe https://example.com", "<script>alert(1)</script>"):
            with self.subTest(text=text), self.assertRaises(app.ChangelogError):
                app.validate_notes({"entries": [{"category": "Geändert", "text": text}]})

    def test_refused_or_incomplete_response_is_not_saved(self):
        for response in ({"status": "incomplete", "output": []}, {"status": "completed", "output": [{"content": [{"type": "refusal"}]}]}):
            with self.subTest(response=response), self.assertRaises(app.ChangelogError):
                app.response_text(response)

    def test_responses_api_request_and_json_parsing(self):
        entries = {"entries": note(None, None, None)}
        result = {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(entries)}]}]}
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps(result).encode()
        with patch.object(app.urllib.request, "urlopen", return_value=response) as call:
            self.assertEqual(app.generate_notes({"diff": "+neu"}, "test-key", "test-model"), entries["entries"])
        request = call.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.full_url, "https://api.openai.com/v1/responses")
        self.assertFalse(payload["store"])
        self.assertTrue(payload["text"]["format"]["strict"])
        self.assertNotIn("tools", payload)

    def test_http_error_does_not_echo_api_key_or_response_body(self):
        error = urllib.error.HTTPError("https://api.openai.com/v1/responses", 401, "test-key must not appear", {}, None)
        with patch.object(app.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(app.ChangelogError) as raised:
                app.generate_notes({}, "test-key", "test-model")
        self.assertIn("401", str(raised.exception))
        self.assertNotIn("test-key", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
