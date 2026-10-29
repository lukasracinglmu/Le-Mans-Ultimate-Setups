"""Exercise the real Git transfer against temporary local bare repositories, never GitHub."""
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("repository_backup", Path(__file__).parents[1] / "scripts/repository-backup.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def git(*args, cwd=None):
    return subprocess.check_output(["git", *args], cwd=cwd, text=True, stderr=subprocess.DEVNULL).strip()


class BackupTransfer(unittest.TestCase):
    def test_complete_snapshot_validation_retention_and_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, target = root / "source", root / "target"
            for repo in (source, target):
                repo.mkdir()
                git("init", "-b", "main", cwd=repo)
                git("config", "user.name", "Test", cwd=repo)
                git("config", "user.email", "test@example.invalid", cwd=repo)
            for name, value in {"index.html": "<html>complete</html>", ".hidden": "dotfile", ".github/workflows/a.yml": "name: example", "setups/car/setup.zip": "ZIP bytes"}.items():
                file = source / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(value)
            git("add", ".", cwd=source)
            git("commit", "-m", "source", cwd=source)
            source_sha = git("rev-parse", "HEAD", cwd=source)
            source_tree = git("rev-parse", "HEAD^{tree}", cwd=source)
            (target / "README.md").write_text("backup index")
            old = target / "backups/2026-10-01/00-00-00"
            old.mkdir(parents=True)
            (old / ".backup.json").write_text(json.dumps({"created_at": "2026-09-30T22:00:00Z"}))
            git("add", ".", cwd=target)
            git("commit", "-m", "old", cwd=target)
            git("tag", "backup-2026-01-10/00-00-00", cwd=target)
            git("tag", "KEEP-ME", cwd=target)
            bare = root / "target.git"
            git("clone", "--bare", str(target), str(bare))
            original_head = git("rev-parse", "main", cwd=bare)
            data = {"job_id": "12345678-1234-4234-8234-123456789abc", "created_at": "2026-10-29T11:00:00Z", "source_sha": source_sha, "backup_repository": backup.TARGET, "backup_branch": "main", "callback_url": backup.CALLBACK, "tag": "backup-2026-29-10/12-00-00", "backup_path": "backups/2026-10-29/12-00-00", "validation_only": True}
            real_git = backup.git

            def local_git(args, **kwargs):
                replacements = {"https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups.git": str(source), "https://github.com/" + backup.TARGET + ".git": str(bare)}
                return real_git([replacements.get(arg, arg) for arg in args], **kwargs)

            with patch.object(backup, "git", local_git), patch.dict(os.environ, GITHUB_REPOSITORY="lukasracinglmu/Le-Mans-Ultimate-Setups", GITHUB_TOKEN="fake-source", BACKUP_TOKEN="fake-destination"):
                backup.copy_snapshot(data)
                self.assertEqual(git("rev-parse", "main", cwd=bare), original_head)
                self.assertNotIn(data["tag"], git("tag", cwd=bare))
                data["validation_only"] = False
                backup.copy_snapshot(data)
                self.assertEqual(git("rev-parse", data["tag"] + ":repository", cwd=bare), source_tree)
                self.assertEqual(git("rev-parse", "main:" + data["backup_path"] + "/repository", cwd=bare), source_tree)
                self.assertEqual(json.loads(git("show", data["tag"] + ":.backup.json", cwd=bare))["file_count"], 4)
                self.assertIn("repository/.github/workflows/a.yml", git("ls-tree", "-r", "--name-only", data["tag"], cwd=bare))
                self.assertNotIn("backup-2026-01-10/00-00-00", git("tag", cwd=bare))
                self.assertIn("KEEP-ME", git("tag", cwd=bare))
                # Idempotent retry must accept the already published tag without replacing it.
                backup.copy_snapshot(data)
                self.assertEqual(git("rev-parse", data["tag"] + ":repository", cwd=bare), source_tree)

    def test_rejects_wrong_destinations_paths_and_dates(self):
        data = {"job_id": "12345678-1234-4234-8234-123456789abc", "created_at": "2026-10-29T11:00:00Z", "source_sha": "a" * 40, "backup_repository": backup.TARGET, "callback_url": backup.CALLBACK, "tag": "backup-2026-29-10/12-00-00", "backup_path": "backups/2026-10-29/12-00-00"}
        backup.validate_payload(data)
        for field, value in [("backup_path", "../../danger"), ("callback_url", "https://evil.invalid"), ("backup_repository", "other/repo"), ("tag", "backup-2026-29-10/00-00-00"), ("source_sha", "bad")]:
            with self.assertRaises(ValueError):
                backup.validate_payload(dict(data, **{field: value}))
        self.assertEqual(backup.parse_tag_date(data["tag"]).hour, 12)
        self.assertIsNone(backup.parse_tag_date("KNOWN_GOOD_ROLLBACK"))


if __name__ == "__main__":
    unittest.main()
