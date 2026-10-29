"""Complete immutable repository snapshots; validation mode never publishes or deletes backups."""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

TARGET = "lukasracinglmu/LMU-Database-Backups"
CALLBACK = "https://le-mans-ultimate-setups.3peaks-database.workers.dev/api/internal/backups/complete"
BERLIN = ZoneInfo("Europe/Berlin")


def git(args, cwd=None, token=None, check=True):
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    if token:
        auth = base64.b64encode(("x-access-token:" + token).encode()).decode()
        env.update(GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="http.https://github.com/.extraheader",
                   GIT_CONFIG_VALUE_0="AUTHORIZATION: basic " + auth)
    result = subprocess.run(["git", *args], cwd=cwd, env=env, capture_output=True, text=True)
    if check and result.returncode:
        detail = result.stderr.replace(token or "__no_token__", "[redacted]")[-500:].strip()
        raise RuntimeError("Git operation failed: " + args[0] + ": " + detail)
    return result.stdout.strip() if check else result


def parse_tag_date(tag):
    current = re.fullmatch(r"backup-(\d{4})-(\d{2})-(\d{2})/(\d{2})-(\d{2})-(\d{2})", tag)
    try:
        if current:
            y, d, m, h, minute, second = map(int, current.groups())
            return datetime(y, m, d, h, minute, second, tzinfo=BERLIN)
        legacy = re.fullmatch(r"backup-(\d{4})-(\d{2})-(\d{2})(?:-[A-Za-z0-9-]+)?", tag)
        if legacy:
            y, m, d = map(int, legacy.groups())
            return datetime(y, m, d, 23, 59, 59, tzinfo=BERLIN)
    except ValueError:
        pass
    return None


def validate_payload(data):
    if str(uuid.UUID(data["job_id"])) != data["job_id"]:
        raise ValueError("Invalid job id")
    if data["backup_repository"] != TARGET or data["callback_url"] != CALLBACK:
        raise ValueError("Unexpected backup destination")
    if data.get("backup_branch", "main") != "main":
        raise ValueError("Unexpected backup branch")
    if not re.fullmatch(r"[a-f0-9]{40}", data["source_sha"]):
        raise ValueError("Invalid source commit")
    created = datetime.fromisoformat(data["created_at"].replace("Z", "+00:00"))
    if created.tzinfo is None:
        raise ValueError("Creation time needs a timezone")
    local = created.astimezone(BERLIN)
    if data["tag"] != local.strftime("backup-%Y-%d-%m/%H-%M-%S"):
        raise ValueError("Tag does not match creation time")
    if data["backup_path"] != local.strftime("backups/%Y-%m-%d/%H-%M-%S"):
        raise ValueError("Invalid backup folder")
    if not isinstance(data.get("validation_only", False), bool):
        raise ValueError("Invalid validation mode")
    return created


def callback(data, success):
    audience = CALLBACK.split("/api/")[0]
    oidc_url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"] + "&" + urlencode({"audience": audience})
    req = Request(oidc_url, headers={"Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"], "User-Agent": "LMU-Repository-Backup"})
    with urlopen(req, timeout=30) as response:
        token = json.load(response)["value"]
    # Only public identity metadata is logged; the bearer token is never logged.
    encoded = token.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
    print("Workflow identity:", json.dumps({k: claims.get(k) for k in ("repository", "ref", "workflow_ref", "event_name", "aud", "run_id")}))
    req = Request(CALLBACK, data=json.dumps({"job_id": data["job_id"], "success": success}).encode(),
                  headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": "LMU-Repository-Backup"}, method="POST")
    try:
        with urlopen(req, timeout=60) as response:
            result = json.load(response)
    except HTTPError as error:
        print("Backup callback HTTP status:", error.code, file=sys.stderr)
        raise
    if result.get("success") is not True:
        raise RuntimeError("Backup verification callback failed")


def copy_snapshot(data):
    created = validate_payload(data)
    source_repo = os.environ["GITHUB_REPOSITORY"]
    if source_repo != "lukasracinglmu/Le-Mans-Ultimate-Setups":
        raise ValueError("Unexpected source repository")
    source_token = os.environ["GITHUB_TOKEN"]
    backup_token = os.environ.get("BACKUP_TOKEN", "")
    if not backup_token:
        raise RuntimeError("BACKUP_REPO_TOKEN is not configured")
    # Fail early with a useful error if the existing Actions secret was not updated.
    check = Request("https://api.github.com/repos/" + TARGET, headers={"Authorization": "Bearer " + backup_token, "Accept": "application/vnd.github+json", "User-Agent": "LMU-Repository-Backup"})
    try:
        with urlopen(check, timeout=30) as response:
            json.load(response)
    except HTTPError as error:
        raise RuntimeError("GitHub Actions secret BACKUP_REPO_TOKEN cannot access " + TARGET + " (HTTP " + str(error.code) + "). Update that existing secret with the backup-repository token.") from None
    source_url = "https://github.com/" + source_repo + ".git"
    target_url = "https://github.com/" + TARGET + ".git"
    sha, tag, folder = data["source_sha"], data["tag"], data["backup_path"]
    with tempfile.TemporaryDirectory(prefix="lmu-backup-") as temp:
        source = Path(temp) / "source.git"
        destination = Path(temp) / "destination"
        git(["clone", "--mirror", source_url, str(source)], token=source_token)
        git(["cat-file", "-e", sha + "^{commit}"], cwd=source)
        source_tree = git(["rev-parse", sha + "^{tree}"], cwd=source)
        raw = git(["ls-tree", "-rl", sha], cwd=source)
        blobs = [line for line in raw.splitlines() if line.split(maxsplit=3)[1] == "blob"]
        sizes = [int(line.split(maxsplit=4)[3]) for line in blobs]
        if not blobs:
            raise RuntimeError("Source repository is empty")
        git(["ls-remote", "--exit-code", target_url, "refs/heads/main"], token=backup_token)
        git(["clone", "--single-branch", "--branch", "main", target_url, str(destination)], token=backup_token)
        git(["config", "user.name", "LMU Backup Bot"], cwd=destination)
        git(["config", "user.email", "actions@users.noreply.github.com"], cwd=destination)
        git(["fetch", str(source), sha], cwd=destination)
        existing = git(["ls-remote", "--tags", target_url, "refs/tags/" + tag], token=backup_token)

        manifest_path = destination / folder / ".backup.json"
        if manifest_path.exists():
            if json.loads(manifest_path.read_text()).get("source_sha") != sha:
                raise RuntimeError("Backup folder already contains another source")
        else:
            git(["read-tree", "--prefix=" + folder + "/repository/", "-u", sha + "^{tree}"], cwd=destination)
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest = dict(data, source_repository=source_repo, source_tree=source_tree,
                            file_count=len(blobs), size_bytes=sum(sizes), delete_at=(created + timedelta(days=14)).isoformat())
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
            (manifest_path.parent / "README.md").write_text(
                "# Vollständiges LMU-Repository-Backup\n\n"
                f"Erstellt: {data['created_at']}\n\nQuellstand: {sha}\n\n"
                f"{len(blobs)} Dateien, {sum(sizes)} Bytes. Aufbewahrung: 14 Tage.\n\n"
                f"[Alle Dateien ansehen](repository/) · [Vollständige ZIP herunterladen]"
                f"(https://github.com/{TARGET}/archive/refs/tags/{tag}.zip)\n")
            git(["add", "--", folder], cwd=destination)
            copied_tree = git(["write-tree"], cwd=destination)
            actual_tree = git(["rev-parse", copied_tree + ":" + folder + "/repository"], cwd=destination)
            if actual_tree != source_tree:
                raise RuntimeError("Copied subtree differs from the source tree")
            git(["commit", "-m", "Complete repository backup " + tag], cwd=destination)
        snapshot_tree = git(["rev-parse", "HEAD:" + folder], cwd=destination)
        # The tag contains just this snapshot. Copied workflow files stay below repository/.
        snapshot_commit = git(["commit-tree", snapshot_tree, "-m", "LMU snapshot of " + sha], cwd=destination)
        if existing:
            git(["fetch", "origin", "refs/tags/" + tag], cwd=destination, token=backup_token)
            previous = json.loads(git(["show", "FETCH_HEAD:.backup.json"], cwd=destination))
            if previous.get("source_sha") != sha or previous.get("job_id") != data["job_id"]:
                raise RuntimeError("Backup tag already contains another snapshot")
        if not existing:
            git(["push", "--dry-run", "origin", snapshot_commit + ":refs/tags/" + tag], cwd=destination, token=backup_token)
        if data.get("validation_only", False):
            print("Validated complete repository transfer:", len(blobs), "files,", sum(sizes), "bytes. No backup published.")
            return
        if not existing:
            git(["tag", tag, snapshot_commit], cwd=destination)
            git(["push", "origin", "refs/tags/" + tag], cwd=destination, token=backup_token)
        cutoff = created - timedelta(days=14)
        for candidate in (destination / "backups").glob("*/*/.backup.json"):
            relative = candidate.parent.relative_to(destination).as_posix()
            if not re.fullmatch(r"backups/\d{4}-\d{2}-\d{2}/\d{2}-\d{2}-\d{2}", relative):
                continue
            meta = json.loads(candidate.read_text())
            when = datetime.fromisoformat(meta["created_at"].replace("Z", "+00:00"))
            if when < cutoff:
                git(["rm", "-r", "--", relative], cwd=destination)
        git(["fetch", "--tags", "origin"], cwd=destination, token=backup_token)
        expired_tags = []
        for old_tag in git(["tag", "--list", "backup-*"], cwd=destination).splitlines():
            when = parse_tag_date(old_tag)
            if when and when < cutoff:
                expired_tags.append(old_tag)
                date = old_tag.split("/")[0][7:]
                git(["rm", "--ignore-unmatch", "--", "backups/" + date + "/" + old_tag + ".md"], cwd=destination)
        if git(["diff", "--cached", "--quiet"], cwd=destination, check=False).returncode:
            git(["commit", "-m", "Remove backups older than 14 days"], cwd=destination)
        pushed = False
        for attempt in range(3):
            result = git(["push", "origin", "HEAD:main"], cwd=destination, token=backup_token, check=False)
            if result.returncode == 0:
                pushed = True
                break
            git(["pull", "--rebase", "origin", "main"], cwd=destination, token=backup_token)
        if not pushed:
            raise RuntimeError("Backup index push failed")
        for old_tag in expired_tags:
            git(["push", "origin", ":refs/tags/" + old_tag], cwd=destination, token=backup_token)
        print("Complete backup verified:", tag, len(blobs), "files,", sum(sizes), "bytes")


def main():
    data = json.loads(os.environ["BACKUP_REQUEST"])
    validate_payload(data)
    success = False
    try:
        copy_snapshot(data)
        success = True
    except Exception as error:
        print("Repository backup failed:", str(error), file=sys.stderr)
    try:
        callback(data, success)
    except Exception as error:
        print("Backup completion could not be confirmed:", type(error).__name__, file=sys.stderr)
        sys.exit(1)
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
