#!/usr/bin/env python3
"""Read only structurally identified Codex metadata; never emit transcript text.

Linux process/rollout discovery is adapted from Over9k codex.sh,
MIT © 2026 the Over9k authors (see OVER9K-LICENSE.txt).
"""
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

UUID = re.compile(r"(?i)^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$")
TITLE_PREFIX = re.compile(r"(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{5}\.\.\.$")


def session_id(value):
    return value.lower() if isinstance(value, str) and UUID.fullmatch(value) else None


def select_unique(ids):
    ids = {x for x in (session_id(v) for v in ids) if x}
    return next(iter(ids)) if len(ids) == 1 else None


def resolve_title_id(db, value):
    """Only a full UUID or the exact Codex 0.170 truncated title format."""
    if session_id(value):
        return value.lower()
    if not TITLE_PREFIX.fullmatch(value):
        return None
    rows = db.execute("SELECT id FROM threads WHERE id LIKE ? LIMIT 2", (value[:-3].lower() + "%",)).fetchall()
    return select_unique([row[0] for row in rows]) if len(rows) == 1 else None


def parse_events(lines):
    result = {}
    for line in lines:
        try:
            event = json.loads(line)
            payload = event.get("payload") or {}
            if not isinstance(payload, dict):
                continue
            if event.get("type") == "turn_context":
                for key in ("model", "effort"):
                    if isinstance(payload.get(key), str) and len(payload[key]) < 100:
                        result[key] = payload[key]
            if event.get("type") == "event_msg" and payload.get("type") == "token_count":
                info = payload.get("info") or {}
                total = (info.get("last_token_usage") or {}).get("total_tokens")
                window = info.get("model_context_window")
                if isinstance(event.get("timestamp"), str) and isinstance(total, (int, float)) and isinstance(window, (int, float)) and window > 0 and 0 <= total <= window * 2:
                    result["context"] = min(100, round(total * 100 / window))
                    result["observed"] = event["timestamp"]
        except (ValueError, TypeError, AttributeError):
            continue
    return result


def edges_for(root, rows):
    by_parent = {}
    for parent, child, status in rows:
        if session_id(parent) and session_id(child) and status in ("running", "active", "pending"):
            by_parent.setdefault(parent.lower(), []).append((child.lower(), status))
    result, seen, stack = [], {root}, [(root, 0)]
    while stack:
        parent, depth = stack.pop()
        if depth >= 16:
            continue
        for child, status in by_parent.get(parent, []):
            if child in seen:
                continue
            seen.add(child)
            result.append({"id": child, "parent": parent, "status": status, "depth": depth})
            stack.append((child, depth + 1))
    return result


def process_ids(address):
    """Only a process whose inherited HC_TERMINAL_ID matches the requested terminal."""
    found = set()
    for item in Path("/proc").iterdir():
        if not item.name.isdigit():
            continue
        try:
            if (item / "comm").read_text().strip() != "codex":
                continue
            env = (item / "environ").read_bytes().split(b"\0")
            if ("HC_TERMINAL_ID=" + address).encode() not in env:
                continue
            for arg in (item / "cmdline").read_bytes().split(b"\0"):
                value = arg.decode("utf-8", "ignore")
                if session_id(value):
                    found.add(value.lower())
            for fd in (item / "fd").iterdir():
                try:
                    target = os.readlink(fd)
                    match = re.search(r"rollout-.*?([0-9a-f-]{36})\.jsonl$", target, re.I)
                    if match and session_id(match.group(1)):
                        found.add(match.group(1).lower())
                except OSError:
                    pass
        except OSError:
            pass
    return found


def read_tail(path):
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 262144))
            return parse_events(f.read().decode("utf-8", "replace").splitlines())
    except OSError:
        return {}

def command_rows(processes, roots, now, uptime, ticks):
    return [{"id": f"process-{pid}", "parent": "process-root", "depth": 0,
             "name": "Codex command", "role": "command", "status": "running",
             "created": int(now - uptime + started / ticks)}
            for pid, parent, started, comm, _ in processes if parent in roots and comm != "bwrap"]


def sandbox_children(address):
    """Direct children of this terminal's Codex sandbox, without command text."""
    processes = []
    for item in Path("/proc").iterdir():
        if not item.name.isdigit():
            continue
        try:
            comm = (item / "comm").read_text().strip()
            stat = (item / "stat").read_text().rsplit(")", 1)[1].split()
            parent, started = int(stat[1]), int(stat[19])
            processes.append((int(item.name), parent, started, comm, item))
        except (OSError, ValueError, IndexError):
            continue
    roots = set()
    for pid, _, _, comm, item in processes:
        if not comm.startswith("codex-linux-san"):
            continue
        try:
            if ("HC_TERMINAL_ID=" + address).encode() in (item / "environ").read_bytes().split(b"\0"):
                roots.add(pid)
        except OSError:
            pass
    try:
        uptime = float(Path("/proc/uptime").read_text().split()[0])
        ticks = os.sysconf("SC_CLK_TCK")
    except (OSError, ValueError):
        return []
    now = time.time()
    return command_rows(processes, roots, now, uptime, ticks)


def lookup(db, ident):
    row = db.execute("SELECT model, reasoning_effort, rollout_path, updated_at FROM threads WHERE id = ?", (ident,)).fetchone()
    if not row:
        return {}
    model, effort, path, updated = row
    result = {k: v for k, v in (("model", model), ("effort", effort), ("updated", updated)) if v is not None}
    # Restrict file access to Codex's own sessions tree and do not expose path.
    if path:
        p = Path(path).resolve()
        root = (Path.home() / ".codex" / "sessions").resolve()
        if p.is_relative_to(root) and p.suffix == ".jsonl":
            result.update(read_tail(p))
    return result


def main(addresses):
    home = Path.home() / ".codex"
    databases = sorted(home.glob("state_*.sqlite"), reverse=True)
    db = sqlite3.connect(f"file:{databases[0]}?mode=ro", uri=True, timeout=1) if databases else None
    result = {}
    for argument in addresses[:40]:
        address, _, title_id = argument.partition("=")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", address):
            continue
        try:
            commands = sandbox_children(address)
            title_match = resolve_title_id(db, title_id) if db and title_id else None
            if title_id and not title_match:
                ident = None
            else:
                ident = select_unique([*process_ids(address), title_match]) if db else None
        except (OSError, sqlite3.Error, ValueError):
            continue
        if not ident:
            if commands:
                result[address] = {"children": commands}
            continue
        try:
            info = lookup(db, ident)
        except (OSError, sqlite3.Error, ValueError):
            continue
        info["children"] = []
        # Edges must be explicit and active. Never infer a child from cwd or review text.
        try:
            rows, pending, visited = [], [ident], set()
            while pending and len(visited) < 128:
                parent = pending.pop()
                if parent in visited:
                    continue
                visited.add(parent)
                children = db.execute("SELECT parent_thread_id, child_thread_id, status FROM thread_spawn_edges WHERE parent_thread_id = ?", (parent,)).fetchall()
                rows.extend(children)
                pending.extend(child for _, child, status in children if session_id(child) and status in ("running", "active", "pending"))
            for child in edges_for(ident, rows):
                row = db.execute("SELECT agent_nickname, agent_role, created_at, model, updated_at FROM threads WHERE id = ?", (child["id"],)).fetchone()
                if row:
                    child.update({"name": row[0] or row[1] or "Codex subagent", "role": row[1], "created": row[2]})
                    if row[3] and row[4]:
                        child.update({"model": row[3], "updated": row[4]})
                    info["children"].append(child)
        except sqlite3.Error:
            pass
        for command in commands:
            command["parent"] = ident
        info["children"].extend(commands)
        result[address] = info
    if db:
        db.close()
    return result


if __name__ == "__main__":
    try:
        print(json.dumps(main(sys.argv[1:])))
    except (OSError, sqlite3.Error):
        print("{}")
