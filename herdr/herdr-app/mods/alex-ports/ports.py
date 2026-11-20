#!/usr/bin/env python3
"""Read-only, local Linux TCP listener ownership for the alex-ports Herdr mod.

Input contains local terminal roots and candidate pane directories. Output can
also identify an outside listener by a matching project, never by guessed terminal.
No process arguments, environment or terminal contents are read.
"""

from __future__ import annotations

import ipaddress
import json
import os
import re
import selectors
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Callable, Dict, List, Mapping, Optional, Sequence, Set, Tuple

MAX_INPUT_BYTES = 48_000
MAX_SCAN_BYTES = 1_000_000
MAX_OUTPUT_BYTES = 1_000_000
MAX_ROOTS = 2_000
MAX_PIDS = 4_000
MAX_HOPS = 32
COMMAND_TIMEOUT_SECONDS = 4
MAX_STDERR_BYTES = 16_000
MAX_RECORD_AGE_MS = 30_000
CREATED_TIME_SLOP_MS = 5_000

SCANNER_UNAVAILABLE = "listener scanner unavailable"
SCAN_FAILED = "listener scan failed"
METADATA_INCOMPLETE = "some listener or process metadata was unavailable"
INVALID_INPUT = "invalid observer input"

Listener = Tuple[int, str, str, int]  # pid, bind address, family, port


@dataclass
class ScanResult:
    scanner: Optional[str]
    listeners: List[Listener]
    partial: bool = False
    error: Optional[str] = None


def parse_endpoint(raw: str) -> Optional[Tuple[str, str, int]]:
    """Parse only numeric bind endpoints; never resolve hostnames or guess family."""
    value = raw.strip()
    value = re.sub(r"\s+\(LISTEN\)$", "", value, flags=re.IGNORECASE)
    family_hint = None
    prefix = re.match(r"^(?:TCP|IPv)([46]):?", value, flags=re.IGNORECASE)
    if prefix:
        family_hint = "ipv" + prefix.group(1)
        value = value[prefix.end():]
    elif value.upper().startswith("TCP:"):
        value = value[4:]

    if value.startswith("["):
        close = value.find("]")
        if close < 0 or close + 1 >= len(value) or value[close + 1] != ":":
            return None
        address = value[1:close]
        port_text = value[close + 2:]
        family = "ipv6"
    else:
        if ":" not in value:
            return None
        address, port_text = value.rsplit(":", 1)
        if ":" in address:
            family = "ipv6"
        elif address == "*" and family_hint:
            family = family_hint
        elif address == "*":
            return None
        else:
            family = "ipv4"

    if not port_text.isdecimal():
        return None
    port = int(port_text)
    if not 1 <= port <= 65535:
        return None

    if address != "*":
        ip_text = address.split("%", 1)[0]
        try:
            parsed = ipaddress.ip_address(ip_text)
        except ValueError:
            return None
        actual_family = "ipv4" if parsed.version == 4 else "ipv6"
        if family != actual_family:
            return None
        if family_hint and family_hint != actual_family:
            return None
    elif family not in ("ipv4", "ipv6"):
        return None
    return address, family, port


def parse_ss(text: str) -> Tuple[List[Listener], bool]:
    """Parse `ss -H -ltnp`; report owner/address omissions as partial."""
    listeners: Set[Listener] = set()
    partial = False
    for line in text.splitlines():
        fields = line.split(maxsplit=5)
        if not fields or fields[0] != "LISTEN":
            continue
        if len(fields) < 4:
            partial = True
            continue
        endpoint = parse_endpoint(fields[3])
        if endpoint is None:
            partial = True
            continue
        pids = {int(value) for value in re.findall(r"(?:^|[,(\s])pid=(\d+)", line)}
        pids = {pid for pid in pids if 1 <= pid <= 2_147_483_647}
        if not pids:
            partial = True
            continue
        address, family, port = endpoint
        listeners.update((pid, address, family, port) for pid in pids)
    return sorted(listeners), partial


def parse_lsof(text: str) -> Tuple[List[Listener], bool]:
    """Parse `lsof -nP -iTCP -sTCP:LISTEN -Fpn` without retaining names."""
    listeners: Set[Listener] = set()
    partial = False
    current_pid: Optional[int] = None
    for line in text.splitlines():
        if line.startswith("p"):
            value = line[1:]
            current_pid = int(value) if value.isdecimal() else None
            if current_pid is None or not 1 <= current_pid <= 2_147_483_647:
                current_pid = None
                partial = True
        elif line.startswith("n"):
            if current_pid is None:
                partial = True
                continue
            endpoint = parse_endpoint(line[1:])
            if endpoint is None:
                partial = True
                continue
            address, family, port = endpoint
            listeners.add((current_pid, address, family, port))
    return sorted(listeners), partial


def _permission_warning(stderr: str) -> bool:
    folded = stderr.lower()
    return any(token in folded for token in (
        "permission denied",
        "operation not permitted",
        "can't open",
        "cannot open",
    ))


def _run_bounded(argv: Sequence[str]) -> Optional[Tuple[int, str, str]]:
    """Drain child pipes with hard byte/time limits; never expose stderr."""
    try:
        process = subprocess.Popen(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
    except OSError:
        return None

    selector = selectors.DefaultSelector()
    stdout = bytearray()
    stderr = bytearray()
    stderr_truncated = False
    assert process.stdout is not None and process.stderr is not None
    selector.register(process.stdout, selectors.EVENT_READ, "stdout")
    selector.register(process.stderr, selectors.EVENT_READ, "stderr")
    deadline = time.monotonic() + COMMAND_TIMEOUT_SECONDS
    failed = False

    try:
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                failed = True
                break
            events = selector.select(remaining)
            if not events:
                failed = True
                break
            for key, _mask in events:
                try:
                    chunk = os.read(key.fileobj.fileno(), 65_536)
                except BlockingIOError:
                    continue
                except OSError:
                    failed = True
                    break
                if not chunk:
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                if key.data == "stdout":
                    if len(stdout) + len(chunk) > MAX_SCAN_BYTES:
                        failed = True
                        break
                    stdout.extend(chunk)
                elif len(stderr) < MAX_STDERR_BYTES:
                    kept = chunk[:MAX_STDERR_BYTES - len(stderr)]
                    stderr.extend(kept)
                    stderr_truncated = stderr_truncated or len(kept) < len(chunk)
                else:
                    stderr_truncated = True
            if failed:
                break

        if failed:
            process.kill()
        try:
            process.wait(timeout=max(0.1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            failed = True
    finally:
        for key in list(selector.get_map().values()):
            selector.unregister(key.fileobj)
            key.fileobj.close()
        selector.close()
        if process.poll() is None:
            process.kill()
            process.wait()

    if failed:
        return None
    stderr_text = bytes(stderr).decode("utf-8", errors="replace")
    if stderr_truncated:
        stderr_text += " [stderr truncated]"
    return process.returncode, bytes(stdout).decode("utf-8", errors="replace"), stderr_text


def _run_scanner(scanner: str) -> ScanResult:
    if scanner == "ss":
        scans = []
        for flag, wildcard in (("-4", "0.0.0.0"), ("-6", "[::]")):
            result = _run_bounded(["ss", flag, "-H", "-ltnp"])
            if result is None or result[0] != 0:
                return ScanResult(scanner, [], error=SCAN_FAILED)
            lines = []
            for line in result[1].splitlines():
                fields = line.split(maxsplit=5)
                if len(fields) >= 4 and fields[3].startswith("*:"):
                    fields[3] = wildcard + fields[3][1:]
                lines.append(" ".join(fields))
            parsed, partial = parse_ss("\n".join(lines))
            scans.append((parsed, partial or bool(result[2].strip())))
        return ScanResult(scanner, sorted(set(scans[0][0] + scans[1][0])), partial=scans[0][1] or scans[1][1])
    elif scanner == "lsof":
        argv = ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]
    else:
        return ScanResult(None, [], error=SCAN_FAILED)

    completed = _run_bounded(argv)
    if completed is None:
        return ScanResult(scanner, [], error=SCAN_FAILED)
    return_code, stdout, stderr = completed

    if return_code != 0:
        # lsof returns 1 for an empty match set on some platforms. Empty output
        # plus no diagnostics is a valid empty result; anything else is unknown.
        if scanner == "lsof" and return_code == 1 and not stdout.strip():
            return ScanResult(scanner, [], partial=bool(stderr.strip()))
        return ScanResult(scanner, [], error=SCAN_FAILED)

    if scanner == "ss":
        listeners, partial = parse_ss(stdout)
    else:
        listeners, partial = parse_lsof(stdout)
    if _permission_warning(stderr):
        partial = True
    elif stderr.strip():
        partial = True
    return ScanResult(scanner, listeners, partial=partial)


def scan_local_listeners(scanner: Optional[str] = None) -> ScanResult:
    """Read TCP listeners using ss, with lsof as a command-availability fallback."""
    selected = scanner
    if selected is None:
        if shutil.which("ss"):
            selected = "ss"
        elif shutil.which("lsof"):
            selected = "lsof"
        else:
            return ScanResult(None, [], error=SCANNER_UNAVAILABLE)

    if selected == "ss+lsof":
        a, b = _run_scanner("ss"), _run_scanner("lsof")
        if a.error and b.error:
            return ScanResult("ss+lsof", [], error=SCAN_FAILED)
        return ScanResult("ss+lsof", sorted(set(a.listeners + b.listeners)), partial=bool(a.partial or b.partial or a.error or b.error))
    result = _run_scanner(selected)
    if scanner is None and selected == "ss" and result.partial and shutil.which("lsof"):
        other = _run_scanner("lsof")
        if not other.error:
            return ScanResult("ss+lsof", sorted(set(result.listeners + other.listeners)), partial=True)
    if scanner is None and selected == "ss" and result.error and shutil.which("lsof"):
        return _run_scanner("lsof")
    return result


def parse_proc_stat(text: str) -> Optional[Dict[str, int]]:
    """Extract only PPID and start ticks; discard the parenthesized comm field."""
    try:
        before, after = text.rsplit(")", 1)
        pid_text = before.split("(", 1)[0].strip()
        fields = after.split()  # begins at field 3 (state)
        pid = int(pid_text)
        ppid = int(fields[1])
        start_time = int(fields[19])  # field 22 in /proc/<pid>/stat
    except (ValueError, IndexError):
        return None
    if pid <= 0 or ppid < 0 or start_time <= 0:
        return None
    return {"pid": pid, "ppid": ppid, "start_time": start_time}


def read_proc_identity(pid: int) -> Optional[Dict[str, int]]:
    """Read one known PID's stat file only; never inspect cmdline or environ."""
    try:
        with open("/proc/{}/stat".format(pid), "r", encoding="ascii", errors="replace") as handle:
            text = handle.read(16_384)
    except OSError:
        return None
    identity = parse_proc_stat(text)
    if identity is None or identity["pid"] != pid:
        return None
    return {"ppid": identity["ppid"], "start_time": identity["start_time"]}


def read_boot_time_ms() -> Optional[int]:
    """Read only Linux's btime field to compare process ticks with created_ms."""
    try:
        with open("/proc/stat", "r", encoding="ascii", errors="replace") as handle:
            for line in handle:
                if line.startswith("btime "):
                    seconds = int(line.split()[1])
                    return seconds * 1000 if seconds > 0 else None
    except (OSError, ValueError, IndexError):
        return None
    return None


def _positive_pid(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 2_147_483_647


def is_fresh_record(record: object, now_ms: int) -> bool:
    """Whether one public-contract record is safe to expose as a current badge."""
    if not isinstance(record, dict):
        return False
    observed_at = record.get("observed_at")
    return (
        record.get("status") == "ok"
        and (record.get("machine") is None or record.get("machine") == "")
        and ((record.get("relation") == "terminal" and isinstance(record.get("terminal"), str) and bool(record.get("terminal")))
             or (record.get("relation") == "project" and record.get("terminal") is None
                 and isinstance(record.get("project_dir"), str) and record["project_dir"].startswith("/")))
        and _positive_pid(record.get("pid"))
        and isinstance(record.get("start_time"), int)
        and not isinstance(record.get("start_time"), bool)
        and record["start_time"] > 0
        and isinstance(record.get("address"), str)
        and bool(record["address"])
        and not re.search(r"[\x00-\x1f\x7f]", record["address"])
        and record.get("family") in ("ipv4", "ipv6")
        and isinstance(record.get("port"), int)
        and not isinstance(record.get("port"), bool)
        and 1 <= record["port"] <= 65535
        and isinstance(observed_at, int)
        and not isinstance(observed_at, bool)
        and observed_at <= now_ms
        and now_ms - observed_at <= MAX_RECORD_AGE_MS
    )


def _normalize_roots(payload: object) -> Tuple[Dict[int, List[Dict[str, object]]], int, bool]:
    if not isinstance(payload, dict) or not isinstance(payload.get("roots"), list):
        raise ValueError(INVALID_INPUT)
    roots = payload["roots"]
    if len(roots) > MAX_ROOTS:
        raise ValueError(INVALID_INPUT)

    anchors: Dict[int, List[Dict[str, object]]] = {}
    issues = payload.get("incomplete_roots", 0)
    if not isinstance(issues, int) or isinstance(issues, bool) or issues < 0 or issues > MAX_ROOTS:
        raise ValueError(INVALID_INPUT)
    if sum(len(root.get("pids", [])) for root in roots if isinstance(root, dict) and isinstance(root.get("pids"), list)) > MAX_PIDS:
        raise ValueError(INVALID_INPUT)
    usable_roots = False

    for root in roots:
        if not isinstance(root, dict):
            issues += 1
            continue
        address = root.get("address")
        if isinstance(address, str) and "/" in address:
            # Herdr's machine/address form denotes a remote terminal. Never
            # compare its PID with the local /proc namespace.
            continue
        if (not isinstance(address, str) or not address or len(address) > 256
                or re.search(r"[\x00-\x1f\x7f]", address)):
            issues += 1
            continue
        created_ms = root.get("created_ms")
        pids = root.get("pids")
        if (not isinstance(created_ms, int) or isinstance(created_ms, bool) or created_ms <= 0
                or not isinstance(pids, list) or not pids or len(pids) > 2):
            issues += 1
            continue
        valid_pid_list = [pid for pid in pids if _positive_pid(pid)]
        valid_pids = set(valid_pid_list)
        if len(valid_pid_list) != len(pids) or len(valid_pids) != len(valid_pid_list) or not valid_pids:
            issues += 1
        if not valid_pids:
            continue
        usable_roots = True
        for pid in valid_pids:
            anchor = {"terminal": address, "created_ms": created_ms}
            if anchor not in anchors.setdefault(pid, []):
                anchors[pid].append(anchor)
    return anchors, issues, usable_roots


def _walk_ancestry(
    pid: int,
    read_identity: Callable[[int], Optional[Mapping[str, int]]],
    cache: Dict[int, Optional[Mapping[str, int]]],
) -> Tuple[List[Tuple[int, Mapping[str, int]]], Optional[str]]:
    chain: List[Tuple[int, Mapping[str, int]]] = []
    seen: Set[int] = set()
    current = pid
    for _ in range(MAX_HOPS):
        if current in seen:
            return chain, "cycle"
        seen.add(current)
        if current not in cache:
            cache[current] = read_identity(current)
        identity = cache[current]
        if identity is None:
            return chain, "unavailable"
        chain.append((current, identity))
        parent = identity.get("ppid")
        if not isinstance(parent, int) or parent < 0:
            return chain, "unavailable"
        if parent <= 1:
            return chain, None
        current = parent
    return chain, "limit"


def _resolve_terminal(
    chain: Sequence[Tuple[int, Mapping[str, int]]],
    anchors: Mapping[int, Sequence[Mapping[str, object]]],
    boot_time_ms: Optional[int],
    ticks_per_second: Optional[int],
) -> Tuple[Optional[str], Optional[str]]:
    if boot_time_ms is None or not ticks_per_second:
        return None, "clock"
    for pid, identity in chain:
        candidates: Set[str] = set()
        invalid_anchor = False
        for anchor in anchors.get(pid, ()):
            start_ms = boot_time_ms + int(identity["start_time"]) * 1000 // ticks_per_second
            created_ms = int(anchor["created_ms"])
            if abs(start_ms - created_ms) > CREATED_TIME_SLOP_MS:
                invalid_anchor = True
                continue
            candidates.add(str(anchor["terminal"]))
        if candidates:
            if len(candidates) == 1:
                return next(iter(candidates)), None
            return None, "ambiguous"
        if invalid_anchor:
            return None, "reused"
    return None, None


def _wall_time_ms() -> int:
    return time.time_ns() // 1_000_000


def project_root(path: str) -> Optional[str]:
    if not isinstance(path, str) or not path.startswith("/") or re.search(r"[\x00-\x1f\x7f]", path):
        return None
    path = os.path.realpath(path)
    if path == "/" or path == os.path.expanduser("~"):
        return None
    try:
        r = subprocess.run(["git", "--no-optional-locks", "-c", "core.fsmonitor=false",
                            "rev-parse", "--show-toplevel"], cwd=path,
                           stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=2, check=False)
        if r.returncode == 0 and len(r.stdout) < 8192:
            root = os.path.realpath(os.fsdecode(r.stdout).strip())
            if root.startswith("/") and root != "/":
                return root
    except (OSError, subprocess.SubprocessError):
        pass
    return path


def read_process_cwd(pid: int) -> Optional[str]:
    try:
        return os.readlink("/proc/{}/cwd".format(pid))
    except OSError:
        return None


def observe(
    payload: object,
    scan_fn: Optional[Callable[[Optional[str]], ScanResult]] = None,
    proc_reader: Callable[[int], Optional[Mapping[str, int]]] = read_proc_identity,
    boot_time_ms: Optional[int] = None,
    ticks_per_second: Optional[int] = None,
    now_fn: Callable[[], int] = _wall_time_ms,
    cwd_reader: Callable[[int], Optional[str]] = read_process_cwd,
    root_resolver: Callable[[str], Optional[str]] = project_root,
) -> Dict[str, object]:
    """Take a fresh bounded snapshot. No previous snapshot is accepted or merged."""
    checked_at = now_fn()
    try:
        anchors, input_issues, has_roots = _normalize_roots(payload)
    except ValueError:
        return {
            "version": 1, "checked_at": checked_at, "state": "error",
            "listeners": [], "error": INVALID_INPUT,
        }

    raw_projects = payload.get("projects", []) if isinstance(payload, dict) else []
    if not isinstance(raw_projects, list) or len(raw_projects) > MAX_ROOTS:
        return {"version": 1, "checked_at": checked_at, "state": "error", "listeners": [], "error": INVALID_INPUT}
    projects = {root_resolver(p) for p in raw_projects if isinstance(p, str)}
    projects.discard(None)
    if not has_roots and not projects:
        state = "partial" if input_issues else "ok"
        return {
            "version": 1, "checked_at": checked_at, "state": state,
            "listeners": [], "error": METADATA_INCOMPLETE if input_issues else None,
        }

    scanner_fn = scan_fn or scan_local_listeners
    first = scanner_fn(None)
    if first.error:
        return {
            "version": 1, "checked_at": now_fn(), "state": "error",
            "listeners": [], "error": first.error,
        }

    partial = bool(input_issues or first.partial)
    if boot_time_ms is None:
        boot_time_ms = read_boot_time_ms()
    if ticks_per_second is None:
        try:
            ticks_per_second = int(os.sysconf("SC_CLK_TCK"))
        except (AttributeError, OSError, ValueError):
            ticks_per_second = None
    if not ticks_per_second or ticks_per_second <= 0:
        partial = True

    cache: Dict[int, Optional[Mapping[str, int]]] = {}
    first_chains: Dict[int, Tuple[List[Tuple[int, Mapping[str, int]]], Optional[str]]] = {}
    for pid, _address, _family, _port in first.listeners:
        first_chains[pid] = _walk_ancestry(pid, proc_reader, cache)

    second = scanner_fn(first.scanner)
    if second.error:
        return {
            "version": 1, "checked_at": now_fn(), "state": "error",
            "listeners": [], "error": second.error,
        }
    partial = partial or second.partial
    if set(first.listeners) != set(second.listeners):
        partial = True

    stable: Dict[int, bool] = {}
    for pid, identity in cache.items():
        current = proc_reader(pid)
        stable[pid] = current is not None and dict(current) == dict(identity or {})
        if not stable[pid]:
            partial = True

    first_by_endpoint: Dict[Tuple[str, str, int], Set[int]] = {}
    second_by_endpoint: Dict[Tuple[str, str, int], Set[int]] = {}
    for pid, address, family, port in first.listeners:
        first_by_endpoint.setdefault((address, family, port), set()).add(pid)
    for pid, address, family, port in second.listeners:
        second_by_endpoint.setdefault((address, family, port), set()).add(pid)

    confirmed: List[Dict[str, object]] = []
    for endpoint, first_pids in first_by_endpoint.items():
        second_pids = second_by_endpoint.get(endpoint, set())
        if first_pids != second_pids:
            partial = True
            continue

        resolved: Dict[int, Optional[str]] = {}
        endpoint_unknown = False
        for pid in first_pids:
            chain, chain_error = first_chains.get(pid, ([], "unavailable"))
            if chain_error or any(not stable.get(chain_pid, False) for chain_pid, _ in chain):
                # Incomplete ancestry cannot prove terminal ownership, but a
                # stable listener can still be associated with a project.
                partial = True
                if stable.get(pid, False):
                    resolved[pid] = None
                else:
                    endpoint_unknown = True
                continue
            terminal, resolution_error = _resolve_terminal(
                chain, anchors, boot_time_ms, ticks_per_second,
            )
            if resolution_error:
                partial = True
                endpoint_unknown = True
                continue
            resolved[pid] = terminal

        if endpoint_unknown:
            partial = True
            continue
        terminal_addresses = {terminal for terminal in resolved.values() if terminal is not None}
        project = None
        if not terminal_addresses:
            candidates = []
            for pid in first_pids:
                cwd = cwd_reader(pid)
                root = root_resolver(cwd) if cwd else None
                # CWD and identity must still be the same after resolving.
                if not root or root not in projects or cwd_reader(pid) != cwd or proc_reader(pid) != cache.get(pid):
                    candidates = []
                    break
                candidates.append(root)
            if not candidates or len(set(candidates)) != 1:
                continue
            project = candidates[0]
        if project is None and (len(terminal_addresses) != 1 or any(value is None for value in resolved.values())):
            partial = True
            continue

        terminal_address = next(iter(terminal_addresses)) if project is None else None
        address, family, port = endpoint
        for pid in sorted(first_pids):
            identity = cache.get(pid)
            if not identity:
                partial = True
                continue
            confirmed.append({
                "terminal": terminal_address,
                "pid": pid,
                "start_time": int(identity["start_time"]),
                "address": address,
                "family": family,
                "port": port,
                "status": "ok",
                "machine": None,
                "relation": "project" if project else "terminal",
                **({"project_dir": project} if project else {}),
            })

    checked_at = now_fn()
    for record in confirmed:
        record["observed_at"] = checked_at
    confirmed = [record for record in confirmed if is_fresh_record(record, checked_at)]
    confirmed.sort(key=lambda item: (
        str(item["terminal"]), int(item["port"]), str(item["address"]), int(item["pid"]),
    ))

    if len(confirmed) > MAX_OUTPUT_BYTES // 128:
        return {
            "version": 1, "checked_at": checked_at, "state": "error",
            "listeners": [], "error": SCAN_FAILED,
        }
    return {
        "version": 1,
        "checked_at": checked_at,
        "state": "partial" if partial else "ok",
        "listeners": confirmed,
        "error": METADATA_INCOMPLETE if partial else None,
    }


def main(argv: Sequence[str]) -> int:
    if len(argv) != 2 or len(argv[1].encode("utf-8", errors="replace")) > MAX_INPUT_BYTES:
        result = {
            "version": 1, "checked_at": _wall_time_ms(), "state": "error",
            "listeners": [], "error": INVALID_INPUT,
        }
    else:
        try:
            payload = json.loads(argv[1])
        except (json.JSONDecodeError, UnicodeError):
            payload = None
        result = observe(payload)

    output = json.dumps(result, ensure_ascii=True, separators=(",", ":"))
    if len(output.encode("utf-8")) > MAX_OUTPUT_BYTES:
        output = json.dumps({
            "version": 1, "checked_at": _wall_time_ms(), "state": "error",
            "listeners": [], "error": SCAN_FAILED,
        }, separators=(",", ":"))
    sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
