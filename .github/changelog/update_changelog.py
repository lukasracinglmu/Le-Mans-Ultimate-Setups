#!/usr/bin/env python3
"""Pflegt CHANGELOG.md ohne KI-Dienst, API-Schlüssel oder zusätzliche Python-Pakete."""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from zoneinfo import ZoneInfo


STATE_PATH = ".github/changelog/state.json"
CATEGORIES = ("Ergänzt", "Geändert", "Behoben", "Entfernt", "Dokumentation", "Wartung")
MAX_COMMITS = 2000
SHA = re.compile(r"[0-9a-f]{40}\Z")
DATE_HEADING = re.compile(r"^## (\d{4}-\d{2}-\d{2})[^\n]*\n", re.M)
IGNORED = {"CHANGELOG.md", STATE_PATH}


class ChangelogError(Exception):
    pass


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "--no-pager", *args], cwd=root, capture_output=True,
        text=True, encoding="utf-8", errors="replace", check=False,
    )
    if result.returncode:
        raise ChangelogError("Git-Abfrage fehlgeschlagen: " + args[0])
    return result.stdout


def redact(text: str) -> str:
    text = re.sub(r"\b\d{16,22}\b", "[Discord-ID entfernt]", text)
    text = re.sub(r"\bsk-[A-Za-z0-9_-]{12,}\b", "[API-Schlüssel entfernt]", text)
    text = re.sub(r"\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,})\b", "[Token entfernt]", text)
    text = re.sub(r"\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b", "[Token entfernt]", text)
    text = re.sub(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[E-Mail entfernt]", text)
    return re.sub(
        r"""(?i)((?:["']?)[\w-]*(?:api[_-]?key|secret|password|token)[\w-]*(?:["']?)\s*[:=]\s*)(["'])([^"'\n]+)\2""",
        lambda match: match[1] + match[2] + "[Geheimwert entfernt]" + match[2], text,
    )


def confidential(path: str) -> bool:
    p = Path(path)
    return p.name == ".env" or p.name.startswith(".env.") or p.suffix.lower() in {".pem", ".key"}


def technical_path(path: str) -> bool:
    return path not in IGNORED and not path.startswith(("setups/", "audit-logs/")) and not confidential(path)


def changed_files(root: Path, commit: str) -> list[tuple[str, str]]:
    raw = git(root, "diff-tree", "--no-commit-id", "--no-renames", "--name-status", "-r", "-z", commit + "^", commit)
    items = raw.rstrip("\0").split("\0") if raw else []
    if len(items) % 2:
        raise ChangelogError("Geänderte Dateien konnten nicht gelesen werden.")
    return list(zip(items[::2], items[1::2]))


def read_state(root: Path) -> dict:
    try:
        state = json.loads((root / STATE_PATH).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ChangelogError("Changelog-Status fehlt oder ist ungültig.") from error
    if not isinstance(state, dict) or state.get("version") != 1 or not SHA.fullmatch(str(state.get("last_processed_commit", ""))):
        raise ChangelogError("Ungültiger Changelog-Cursor.")
    return state


def collect(root: Path, base: str, head: str) -> tuple[list[dict], int]:
    git(root, "merge-base", "--is-ancestor", base, head)
    commits = git(root, "rev-list", "--first-parent", "--reverse", base + ".." + head).splitlines()
    selected = []
    for commit in commits[:MAX_COMMITS]:
        files = changed_files(root, commit)
        stamp, message = git(root, "show", "-s", "--format=%cI%x00%B", commit).rstrip("\n").split("\0", 1)
        date = dt.datetime.fromisoformat(stamp).astimezone(ZoneInfo("Europe/Berlin")).date().isoformat()
        selected.append({"sha": commit, "date": date, "message": message, "files": files,
                         "paths": [p for _, p in files if technical_path(p)]})
    return selected, len(commits) - len(selected)


def explicit_notes(message: str) -> list[dict]:
    """Übernimmt freiwillige Beschreibungen aus einem klar begrenzten Commit-Abschnitt."""
    start = re.search(r"(?im)^Changelog:[ \t]*\n", message)
    if not start:
        return []
    entries = []
    for line in message[start.end():].splitlines():
        if not line.strip():
            if entries:
                break
            continue
        match = re.fullmatch(r"- \[([^\]]+)\] (.+)", line)
        if not match or match[1] not in CATEGORIES:
            return []
        text = redact(match[2].strip())
        if not 8 <= len(text) <= 900 or re.search(r"[\x00-\x1f\x7f<>]|https?://|\]\(|\x60{3}|^(?:#{1,6}|[*+-])\s", text):
            return []
        entries.append({"category": match[1], "text": text})
        if len(entries) > 12:
            return []
    return entries


def area(path: str) -> str:
    known = {
        "index.html": "Website-Oberfläche",
        "worker.js": "Core-Worker und API",
        "runtime-worker.js": "Runtime-Routing",
        "production-worker.js": "Website-Integrationen",
        "ui-hotfix.js": "Ergänzungen der Website-Oberfläche",
        "access-worker.js": "Zugriffsverwaltung",
        "audit-log.js": "Audit-Protokollierung",
        "setup-version.js": "Setup-Versionen",
        "schema.sql": "Datenbankstruktur",
        "wrangler.jsonc": "Worker-Konfiguration",
        "setups.json": "Fahrzeugkatalog",
    }
    if path in known:
        return known[path]
    if path.startswith(".github/changelog/"):
        return "Automatische Changelog-Erstellung"
    if path.startswith(".github/workflows/"):
        return "GitHub-Automationen"
    if path.startswith("discord-presence/"):
        return "Discord Presence Bot"
    if path.startswith("assets/"):
        return "Bild- und Branding-Dateien"
    if Path(path).suffix.lower() in {".md", ".txt"}:
        return "Projektdokumentation"
    return "Projektdateien"


def code_path(path: str) -> str:
    safe = redact(re.sub(r"[\x00-\x1f\x7f<>]", " ", path)).replace(chr(96), "'")
    return chr(96) + safe + chr(96)


def describe_files(record: dict) -> list[dict]:
    """Neutrale deutsche Vorlagen: keine erfundenen Aussagen über die Funktion des Codes."""
    groups = collections.defaultdict(list)
    for status, path in record["files"]:
        if technical_path(path):
            kind = status if status in {"A", "D"} else "M"
            groups[(area(path), kind)].append(path)
    entries = []
    for (label, kind), paths in groups.items():
        category, verb = {"A": ("Ergänzt", "hinzugefügt"), "D": ("Entfernt", "entfernt"),
                          "M": ("Geändert", "geändert")}[kind]
        shown = ", ".join(code_path(p) for p in paths[:8])
        extra = f" sowie {len(paths) - 8} weitere" if len(paths) > 8 else ""
        noun = "Datei" if len(paths) == 1 else "Dateien"
        text = f"{label}: {len(paths)} {noun} {verb}. Betroffen: {shown}{extra}."
        entries.append({"category": category, "text": text})
    return entries


def insert_entries(document: str, date: str, category: str, lines: list[str]) -> str:
    headings = list(DATE_HEADING.finditer(document))
    section = next((h for h in headings if h[1] == date), None)
    if section is None:
        following = next((h for h in headings if h[1] < date), None)
        position = following.start() if following else len(document)
        prefix = "" if position == 0 or document[:position].endswith("\n\n") else "\n"
        block = f"## {date}\n\n### {category}\n\n" + "\n".join(lines) + "\n\n"
        return document[:position] + prefix + block + document[position:]
    end = next((h.start() for h in headings if h.start() > section.start()), len(document))
    block = document[section.end():end]
    subheads = list(re.finditer(r"^### ([^\n]+)\n", block, re.M))
    subhead = next((h for h in subheads if h[1] == category), None)
    if subhead:
        offset = next((h.start() for h in subheads if h.start() > subhead.start()), len(block))
        position = section.end() + offset
        addition = "\n".join(lines) + "\n\n"
    else:
        position = end
        addition = f"### {category}\n\n" + "\n".join(lines) + "\n\n"
    if not document[:position].endswith("\n\n"):
        addition = "\n" + addition
    return document[:position] + addition + document[position:]


def routine_changes(root: Path, record: dict) -> collections.Counter:
    counts = collections.Counter()
    for status, path in record["files"]:
        if path.startswith("setups/") and path.lower().endswith(".zip"):
            counts[{"A": "zip_added", "D": "zip_deleted", "M": "zip_updated"}.get(status, "zip_updated")] += 1
        if path.startswith("audit-logs/") and path.endswith(".json"):
            counts["audit_files"] += 1
            if status == "A":
                try:
                    event = json.loads(git(root, "show", record["sha"] + ":" + path))
                except ValueError as error:
                    raise ChangelogError("Eine Audit-Datei enthält ungültiges JSON.") from error
                if not isinstance(event, dict):
                    raise ChangelogError("Eine Audit-Datei enthält kein Ereignisobjekt.")
                action = event.get("action")
                if action in {"SETUP_UPLOAD", "SETUP_DELETE", "SETUP_VERSION_UPDATE", "PERMISSION_GRANT", "PERMISSION_REVOKE"}:
                    counts[action] += 1
    return counts


def counted(number: int, singular: str, plural: str) -> str:
    return f"{number} {singular if number == 1 else plural}"


def update(root: Path, repository: str, *, dry_run=False) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ChangelogError("Ungültiger Repository-Name.")
    state = read_state(root)
    head = git(root, "rev-parse", "HEAD").strip()
    records, remaining = collect(root, state["last_processed_commit"], head)
    if not records:
        return {"status": "unchanged", "processed": 0, "remaining": remaining}
    path = root / "CHANGELOG.md"
    original = path.read_text(encoding="utf-8")
    if not original.startswith("# Changelog\n"):
        raise ChangelogError("Unerwarteter Aufbau von CHANGELOG.md.")
    document = original
    by_date = collections.defaultdict(collections.Counter)
    sources = collections.defaultdict(list)
    for record in records:
        counts = routine_changes(root, record)
        if counts:
            by_date[record["date"]].update(counts)
            sources[record["date"]].append(record["sha"])
        if not record["paths"]:
            continue
        entries = explicit_notes(record["message"]) or describe_files(record)
        for entry in entries:
            link = f"[Commit {record['sha'][:7]}](https://github.com/{repository}/commit/{record['sha']})"
            document = insert_entries(document, record["date"], entry["category"], [f"- {entry['text']} ({link})"])
    for date in sorted(by_date):
        counts = by_date[date]
        items = []
        if any(counts[k] for k in ("zip_added", "zip_deleted", "zip_updated")):
            items.append(f"ZIP-Dateien: {counts['zip_added']} hinzugefügt, {counts['zip_deleted']} entfernt und {counts['zip_updated']} geändert.")
        if counts["audit_files"]:
            actions = ", ".join([
                counted(counts["SETUP_UPLOAD"], "Upload", "Uploads"),
                counted(counts["SETUP_DELETE"], "Löschung", "Löschungen"),
                counted(counts["SETUP_VERSION_UPDATE"], "Versionsspeicherung", "Versionsspeicherungen"),
                counted(counts["PERMISSION_GRANT"] + counts["PERMISSION_REVOKE"], "Rechteänderung", "Rechteänderungen"),
            ])
            items.append(f"Audit-Dateien: {counts['audit_files']} ergänzt, geändert oder entfernt. Darin neu protokolliert: {actions}.")
        before = git(root, "rev-parse", sources[date][0] + "^").strip()
        link = f"[Commits](https://github.com/{repository}/compare/{before}...{sources[date][-1]})"
        document = insert_entries(document, date, "Setup-Bestand / Audit-Protokoll",
                                  ["- " + item for item in items] + [f"- Belege: {link}."])
    # Bot-/Cursor-Commits lösen keine endlose Kette weiterer Cursor-Commits aus.
    if document == original:
        return {"status": "unchanged", "processed": 0, "remaining": remaining}
    state["last_processed_commit"] = records[-1]["sha"]
    if not dry_run:
        path.write_text(document, encoding="utf-8")
        (root / STATE_PATH).write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    return {"status": "updated", "processed": len(records), "remaining": remaining, "dry_run": dry_run}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Vollständig prüfen, ohne Dateien zu schreiben.")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    try:
        result = update(root, os.environ.get("GITHUB_REPOSITORY", "lukasracinglmu/Le-Mans-Ultimate-Setups"),
                        dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (ChangelogError, OSError) as error:
        print("::error::" + redact(str(error)), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
