#!/usr/bin/env python3
"""Read bounded tails of local Codex session logs; emit quota metadata only."""
import datetime
import glob
import json
import math
import os
import sys

MAX_FILES = 16
TAIL_BYTES = 512 * 1024


def timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.timestamp() if dt.tzinfo else None
    except (ValueError, OverflowError, OSError):
        return None


def number(value):
    try:
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    except OverflowError:
        return False


def window(value):
    if not isinstance(value, dict):
        return None
    used = value.get("used_percent")
    reset = value.get("resets_at")
    minutes = value.get("window_minutes")
    return {"used_percent": used if number(used) and 0 <= used <= 100 else None,
            "resets_at": reset if number(reset) and reset > 0 else None,
            "window_minutes": minutes if number(minutes) and minutes > 0 else None}


def event(line):
    try:
        record = json.loads(line)
        if not isinstance(record, dict) or record.get("type") != "event_msg":
            return None
        payload = record.get("payload")
        if not isinstance(payload, dict) or payload.get("type") != "token_count":
            return None
        limits = payload.get("rate_limits")
        at = timestamp(record.get("timestamp"))
        if not isinstance(limits, dict) or at is None:
            return None
        primary, secondary = window(limits.get("primary")), window(limits.get("secondary"))
        if primary is None and secondary is None:
            return None
        plan = limits.get("plan_type")
        if not isinstance(plan, str) or len(plan) > 40 or not all(c.isalnum() or c in ' _-' for c in plan):
            plan = None
        return {"observed_at": at, "plan": plan, "primary": primary, "secondary": secondary}
    except (ValueError, TypeError, UnicodeError, RecursionError):
        return None


def read_sessions(root):
    files, failures = [], 0
    for path in glob.iglob(os.path.join(root, "*", "*", "*", "*.jsonl")):
        try:
            files.append((os.stat(path).st_mtime_ns, path))
        except OSError:
            failures += 1
    files.sort(reverse=True)
    best = None
    partial = len(files) > MAX_FILES
    for _, path in files[:MAX_FILES]:
        try:
            with open(path, "rb") as handle:
                size = handle.seek(0, os.SEEK_END)
                offset = max(0, size - TAIL_BYTES)
                handle.seek(offset)
                data = handle.read(TAIL_BYTES)
                if offset:
                    partial = True
                    # The first line may be incomplete, even if it starts at a boundary.
                    _, sep, data = data.partition(b"\n")
                    if not sep:
                        data = b""
                for line in data.splitlines():
                    # Cheap prefilter avoids parsing unrelated conversation events.
                    if b'"rate_limits"' not in line:
                        continue
                    found = event(line)
                    if found and (best is None or found["observed_at"] > best["observed_at"]):
                        best = found
        except OSError:
            failures += 1
    if best:
        return {"status": "ok", "snapshot": best, "partial": partial or failures > 0}
    return {"status": "error" if failures else "empty", "partial": partial or failures > 0}


if __name__ == "__main__":
    try:
        print(json.dumps(read_sessions(os.path.join(os.path.expanduser("~"), ".codex", "sessions")), allow_nan=False))
    except Exception:
        print('{"status":"error"}')
        sys.exit(1)
