"""Read-only Codex skill inventory for Herdr's Skills panel.

Only documented project, user, and admin skill locations are searched.
This file is also passed to `python3 -c` by the mod so it can run on the
selected terminal's machine without installing anything there.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys

MAX_SKILL_BYTES = 64 * 1024
MAX_SKILLS_PER_ROOT = 250
ADMIN_SKILLS_PATH = "/etc/codex/skills" if os.name == "posix" else None


def _within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _scalar(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        quote = value[0]
        value = value[1:-1]
        if quote == "'":
            value = value.replace("''", "'")
    return value.strip()


def _metadata(text: str, fallback: str) -> tuple[str, str]:
    name, description = fallback, "No description in SKILL.md frontmatter."
    if not text.startswith("---\n") and not text.startswith("---\r\n"):
        return name, description
    lines = text.splitlines()
    try:
        end = next(i for i, line in enumerate(lines[1:], 1) if line.strip() == "---")
    except StopIteration:
        return name, description
    front = lines[1:end]
    values: dict[str, str] = {}
    for index, line in enumerate(front):
        if ":" not in line or line[:1].isspace():
            continue
        key, raw = line.split(":", 1)
        key = key.strip().lower()
        if key not in {"name", "description"}:
            continue
        raw = raw.strip()
        if raw in {"|", ">", "|-", ">-", "|+", ">+"}:
            parts = []
            for nested in front[index + 1 :]:
                if nested and not nested[:1].isspace():
                    break
                if nested.strip():
                    parts.append(nested.strip().removeprefix("- "))
            values[key] = " ".join(parts).strip()
        else:
            values[key] = _scalar(raw)
    if values.get("name"):
        name = values["name"]
    if values.get("description"):
        description = values["description"]
    return name[:160], description[:500] + ("…" if len(description) > 500 else "")


def _read_skill_file(path: Path) -> tuple[str, bool]:
    with path.open("rb") as stream:
        data = stream.read(MAX_SKILL_BYTES + 1)
    truncated = len(data) > MAX_SKILL_BYTES
    return data[:MAX_SKILL_BYTES].decode("utf-8", errors="replace"), truncated


def _repository_boundary(cwd: Path) -> Path:
    for ancestor in (cwd, *cwd.parents):
        try:
            if (ancestor / ".git").exists():
                return ancestor
        except OSError:
            continue
    return cwd


def discover(
    cwd_value: str,
    home_value: str | None = None,
    include_preview: bool = False,
    admin_value: str | None = ADMIN_SKILLS_PATH,
) -> dict:
    """Return Codex user/project skills visible from cwd, without writing files."""
    try:
        cwd = Path(cwd_value).expanduser().resolve(strict=True)
    except (OSError, RuntimeError, ValueError):
        return {"skills": [], "warnings": [], "error": "The selected working directory is not accessible."}
    if not cwd.is_dir():
        return {"skills": [], "warnings": [], "error": "The selected working directory is not a directory."}

    try:
        home = Path(home_value).expanduser().resolve(strict=True) if home_value else Path.home().resolve(strict=True)
    except (OSError, RuntimeError, ValueError):
        home = None

    boundary = _repository_boundary(cwd)
    roots: list[tuple[Path, Path, str]] = []
    for project_dir in (cwd, *cwd.parents):
        if not _within(project_dir, boundary):
            break
        roots.append((project_dir / ".agents" / "skills", boundary, "project"))
        if project_dir == boundary:
            break
    if home is not None:
        roots.append((home / ".agents" / "skills", home, "user"))
    if admin_value:
        admin_root = Path(admin_value).expanduser()
        roots.append((admin_root, admin_root.parent, "admin"))

    skills: list[dict] = []
    warnings: list[str] = []
    seen: set[str] = set()
    for raw_root, allowed_root, scope in roots:
        try:
            root = raw_root.resolve(strict=True)
            allowed = allowed_root.resolve(strict=True)
            if not _within(root, allowed) or not root.is_dir():
                warnings.append(f"Ignored an out-of-scope {scope} skills directory.")
                continue
            children = sorted(root.iterdir(), key=lambda p: p.name.casefold())
        except FileNotFoundError:
            continue
        except (OSError, RuntimeError) as exc:
            warnings.append(f"Could not list a {scope} skills directory: {exc}")
            continue

        if len(children) > MAX_SKILLS_PER_ROOT:
            warnings.append(f"Only the first {MAX_SKILLS_PER_ROOT} entries in a {scope} skills directory were checked.")
        for child in children[:MAX_SKILLS_PER_ROOT]:
            try:
                skill_dir = child.resolve(strict=True)
                if not _within(skill_dir, root) or not skill_dir.is_dir():
                    continue
                skill_file = (skill_dir / "SKILL.md").resolve(strict=True)
                if not _within(skill_file, skill_dir) or not skill_file.is_file():
                    continue
                identity = hashlib.sha256(os.fsencode(skill_file)).hexdigest()[:24]
                if identity in seen:
                    continue
                content, truncated = _read_skill_file(skill_file)
            except FileNotFoundError:
                continue
            except (OSError, RuntimeError) as exc:
                warnings.append(f"Could not read a skill in {scope} scope: {exc}")
                continue

            seen.add(identity)
            name, description = _metadata(content, child.name)
            if scope == "user":
                source = "User · ~/.agents/skills"
            elif scope == "admin":
                source = "Admin · /etc/codex/skills"
            else:
                try:
                    shown = skill_dir.parent.relative_to(boundary).as_posix()
                except ValueError:
                    shown = ".agents/skills"
                source = f"Project · {shown}"
            row = {
                "id": identity,
                "name": name,
                "description": description,
                "source": source,
                "scope": scope,
                "truncated": truncated,
            }
            if include_preview:
                row["preview"] = content
            skills.append(row)
    skills.sort(key=lambda item: (item["name"].casefold(), item["source"].casefold(), item["id"]))
    return {"skills": skills, "warnings": warnings, "error": None}


def read_skill(
    cwd_value: str,
    identity: str,
    home_value: str | None = None,
    admin_value: str | None = ADMIN_SKILLS_PATH,
) -> dict:
    """Read only a skill ID returned by discovery for this same scope."""
    result = discover(cwd_value, home_value, include_preview=True, admin_value=admin_value)
    if result.get("error"):
        return {"error": result["error"]}
    for item in result["skills"]:
        if item["id"] == identity:
            return {"skill": item}
    return {"error": "This skill is no longer available in the selected project, user, or admin scope. Refresh the inventory."}


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in {"list", "read"} or (argv[0] == "list" and len(argv) != 2) or (argv[0] == "read" and len(argv) != 3):
        print(json.dumps({"error": "Expected: list <cwd> or read <cwd> <skill-id>"}))
        return 2
    result = discover(argv[1]) if argv[0] == "list" else read_skill(argv[1], argv[2])
    print(json.dumps(result, ensure_ascii=False))
    return 2 if result.get("error") else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
