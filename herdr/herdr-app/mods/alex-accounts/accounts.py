#!/usr/bin/env python3
"""Private, one-shot, explicitly scoped Codex tracking profiles and usage."""
import argparse
import datetime
import fcntl
import json
import math
import os
from pathlib import Path
import re
import secrets
import selectors
import signal
import shutil
import stat
import subprocess
import sys
import time

ROOT = Path.home() / ".local/share/herdr-codex-accounts"
ID = re.compile(r"^[0-9a-f]{32}$")
COLLECTOR = Path.home() / ".local/lib/codexbar-cli-0.84.0/codexbar"
INTERVAL = 120
STALE_SECONDS = 300
TIMEOUT = 45
OUTPUT_LIMIT = 262144
CONFIG = {"version": 1, "providers": [
    {"id": "codex", "enabled": True, "source": "oauth", "cookieSource": "off"}]}
PLANS = {"guest", "free", "go", "plus", "pro", "prolite", "free_workspace",
         "team", "business", "education", "quorum", "k12", "enterprise", "edu"}


def private_dir(path):
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        pass
    st = path.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o077:
        raise ValueError("unsafe_directory")


def init():
    # Parents are standard user directories, not profile-controlled.
    ROOT.parent.mkdir(parents=True, exist_ok=True)
    private_dir(ROOT)
    private_dir(ROOT / "profiles")


def checked_file(path):
    try:
        st = path.lstat()
    except FileNotFoundError:
        return False
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o077:
        raise ValueError("unsafe_file")
    return True


def auth_generation(p):
    path = p / "auth.json"
    if not checked_file(path):
        return None
    s = path.lstat()
    return [s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def read_index():
    p = ROOT / "index.json"
    if not checked_file(p):
        return []
    with p.open() as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("invalid_inventory")
    for item in data:
        if (not isinstance(item, dict) or not isinstance(item.get("id"), str)
                or not ID.fullmatch(item["id"])
                or not valid_alias(item.get("alias"))):
            raise ValueError("invalid_inventory")
    return data


def valid_alias(alias):
    return (isinstance(alias, str) and 1 <= len(alias) <= 48
            and alias == alias.strip() and not any(ord(c) < 32 or ord(c) == 127 for c in alias))


def write_json(path, obj):
    temporary = path.with_name("." + path.name + "." + secrets.token_hex(8))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(obj, f, ensure_ascii=False)
            f.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def profile(account_id, inventory):
    if not ID.fullmatch(account_id or ""):
        raise ValueError("invalid_id")
    if not any(x["id"] == account_id for x in inventory):
        raise ValueError("unknown_id")
    p = ROOT / "profiles" / account_id
    st = p.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o077:
        raise ValueError("unsafe_profile")
    return p


def account_row(item, inventory):
    p = profile(item["id"], inventory)
    generation = auth_generation(p)
    state = load_state(p, generation)
    after = auth_generation(p)
    return display_row(item, state if generation == after else {}, after)


def empty_row(item, status):
    return {"id": item["id"], "alias": item["alias"], "status": status,
            "source": None, "version": None, "plan": None, "observedAt": None,
            "lastAttemptAt": None, "errorCode": None, "windows": []}


def iso_now(now=None):
    return datetime.datetime.fromtimestamp(time.time() if now is None else now,
                                           datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_date(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        dt = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return None
        return dt.timestamp()
    except (ValueError, OverflowError, OSError):
        return None


def load_state(p, generation):
    path = p / "state.json"
    if not checked_file(path):
        return {}
    try:
        with path.open() as f:
            state = json.load(f)
        if not isinstance(state, dict) or state.get("generation") != generation:
            return {}
        return state
    except (ValueError, OSError):
        return {}


def display_row(item, state, generation, now=None):
    now = time.time() if now is None else now
    if generation is None:
        return empty_row(item, "missing_login")
    row = empty_row(item, state.get("status", "unknown"))
    snapshot = state.get("snapshot")
    if isinstance(snapshot, dict):
        row.update(snapshot)
        row["id"], row["alias"] = item["id"], item["alias"]
        observed = parse_date(row.get("observedAt"))
        resets = [parse_date(w.get("resetsAt")) for w in row["windows"]]
        if (row["status"] == "ok" and
                (observed is None or now - observed > STALE_SECONDS or observed > now + 60
                 or any(x is not None and x <= now for x in resets))):
            row["status"] = "stale"
    row["status"] = state.get("status", row["status"]) if row["status"] != "stale" else "stale"
    if isinstance(snapshot, dict) and state.get("status") not in ("ok", None):
        row["status"] = "stale"
    row["lastAttemptAt"] = state.get("lastAttemptAt")
    row["errorCode"] = state.get("errorCode")
    return row


def normalized(payload):
    if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict):
        raise ValueError("invalid_payload")
    data = payload[0]
    if data.get("provider") != "codex" or data.get("error") is not None:
        raise ValueError("invalid_payload")
    source = data.get("source")
    if source not in ("oauth", "codex-cli"):
        raise ValueError("unexpected_source")
    usage = data.get("usage")
    if not isinstance(usage, dict):
        raise ValueError("invalid_payload")
    identity = usage.get("identity")
    method = usage.get("loginMethod")
    if isinstance(identity, dict):
        method = identity.get("loginMethod", method)
    if isinstance(method, str) and method.lower().replace("_", "").replace(" ", "") in ("apikey", "api"):
        raise ValueError("unsupported_api_key")
    observed = usage.get("updatedAt")
    if parse_date(observed) is None:
        raise ValueError("invalid_payload")
    labels = data.get("rateWindowLabels")
    if not isinstance(labels, dict):
        labels = {}
    windows = []
    for key in ("primary", "secondary", "tertiary"):
        value = usage.get(key)
        if value is None:
            continue
        windows.append(normalized_window(key, value, labels.get(key)))
    extras = usage.get("extraRateWindows", [])
    if extras is None:
        extras = []
    if not isinstance(extras, list) or len(extras) > 32:
        raise ValueError("invalid_payload")
    for i, extra in enumerate(extras):
        if not isinstance(extra, dict) or not isinstance(extra.get("window"), dict):
            raise ValueError("invalid_payload")
        window = normalized_window("extra-" + str(i), extra["window"], None)
        if extra.get("usageKnown", True) is False:
            window["usedPercent"] = None
        windows.append(window)
    if not windows:
        raise ValueError("no_quota")
    plan = None
    po = usage.get("planObservation")
    if isinstance(po, dict) and isinstance(po.get("rawPlan"), str) and po["rawPlan"] in PLANS:
        plan = po["rawPlan"]
    version = data.get("version")
    if not isinstance(version, str) or not re.fullmatch(r"[0-9.]{1,24}", version):
        version = None
    return {"source": source, "version": version, "plan": plan,
            "observedAt": observed, "windows": windows}


def normalized_window(key, value, label):
    if not isinstance(value, dict):
        raise ValueError("invalid_payload")
    used = value.get("usedPercent")
    if isinstance(used, bool) or not isinstance(used, (int, float)) or not math.isfinite(used) or used < 0:
        raise ValueError("invalid_payload")
    duration = value.get("windowMinutes")
    if duration is not None and (isinstance(duration, bool) or not isinstance(duration, int)
                                 or duration <= 0 or duration > 52560000):
        raise ValueError("invalid_payload")
    reset = value.get("resetsAt")
    if reset is not None and parse_date(reset) is None:
        raise ValueError("invalid_payload")
    if value.get("isSyntheticPlaceholder") is True:
        used = None
    if label not in ("Session", "Weekly", "Monthly", "Daily"):
        label = None
    return {"key": key, "label": label, "usedPercent": used,
            "durationMinutes": duration, "resetsAt": reset}


def tool_paths():
    """Resolve executable names without a login shell or configuration reads."""
    search_path = os.pathsep.join(part for part in os.get_exec_path() if os.path.isabs(part))
    codex, node = shutil.which("codex", path=search_path), shutil.which("node", path=search_path)
    if codex:
        adjacent_node = Path(codex).parent / "node"
        if adjacent_node.is_file() and os.access(adjacent_node, os.X_OK):
            node = str(adjacent_node)
    if not codex or not node:
        versions = Path.home() / ".nvm/versions/node"
        try:
            candidates = sorted((x for x in versions.iterdir()
                                 if re.fullmatch(r"v\d+\.\d+\.\d+", x.name)),
                                key=lambda x: tuple(int(y) for y in x.name[1:].split(".")),
                                reverse=True)
        except OSError:
            candidates = []
        for version in candidates:
            c, n = version / "bin/codex", version / "bin/node"
            if c.is_file() and os.access(c, os.X_OK) and n.is_file() and os.access(n, os.X_OK):
                codex, node = str(c), str(n)
                break
    if not codex or not node:
        raise ValueError("codex_or_node_unavailable")
    return os.path.abspath(codex), os.path.abspath(node)


def tool_path(codex, node):
    return os.pathsep.join(dict.fromkeys([os.path.dirname(node), os.path.dirname(codex),
                                         "/usr/local/bin", "/usr/bin", "/bin"]))


def login_plan(p):
    # Resolve Node separately: codex's npm launcher uses /usr/bin/env node.
    codex, node = tool_paths()
    path = tool_path(codex, node)
    env = ["HOME=" + str(Path.home()), "CODEX_HOME=" + str(p), "PATH=" + path]
    for key in ("DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
                "TERM", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "CODEX_CA_CERTIFICATE"):
        if key in os.environ:
            env.append(key + "=" + os.environ[key])
    return {"argv": ["/usr/bin/env", "-i", *env, codex, "login"]}


def collector_environment(p):
    private_dir(p / "collector")
    sandbox = p / "collector"
    for dirname in ("home", "config", "data", "cache"):
        private_dir(sandbox / dirname)
    config = sandbox / "config.json"
    write_json(config, CONFIG)
    try:
        codex, node = tool_paths()
        path = tool_path(codex, node)
    except ValueError:
        path = "/usr/bin:/bin"
    env = {"HOME": str(sandbox / "home"), "CODEX_HOME": str(p),
           "CODEXBAR_CONFIG": str(config), "XDG_CONFIG_HOME": str(sandbox / "config"),
           "XDG_DATA_HOME": str(sandbox / "data"), "XDG_CACHE_HOME": str(sandbox / "cache"),
           "PATH": path, "LANG": "C.UTF-8"}
    # Honor standard system trust/proxy configuration without inheriting credentials.
    for key in ("SSL_CERT_FILE", "SSL_CERT_DIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"):
        if key in os.environ:
            env[key] = os.environ[key]
    return env


def collect(p):
    env = collector_environment(p)
    cmd = [str(COLLECTOR), "usage", "--provider", "codex", "--source", "oauth",
           "--format", "json", "--no-credits", "--json-only"]
    proc = subprocess.Popen(cmd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, start_new_session=True)
    selector = selectors.DefaultSelector()
    buffers = {}
    for stream in (proc.stdout, proc.stderr):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ)
        buffers[stream] = bytearray()
    deadline = time.monotonic() + TIMEOUT
    problem = None
    try:
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                problem = "timeout"
                break
            for key, _ in selector.select(remaining):
                chunk = os.read(key.fileobj.fileno(), 16384)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                buffers[key.fileobj].extend(chunk)
                if sum(map(len, buffers.values())) > OUTPUT_LIMIT:
                    problem = "output_limit"
                    break
            if problem:
                break
        if problem:
            raise ValueError(problem)
        try:
            code = proc.wait(timeout=max(0.01, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            raise ValueError("timeout") from None
        stdout = bytes(buffers[proc.stdout])
        stderr = bytes(buffers[proc.stderr])
        try:
            payload = json.loads(stdout)
        except (ValueError, UnicodeDecodeError):
            payload = None
        if code != 0:
            # Raw diagnostics remain process-local and are never returned or persisted.
            msg = (stdout + stderr).decode("utf-8", "replace").lower()
            if "429" in msg or "rate limit" in msg and "rate limits found" not in msg:
                raise ValueError("rate_limited")
            if "api key" in msg or "api_key" in msg:
                raise ValueError("unsupported_api_key")
            if any(x in msg for x in ("expired", "unauthorized", "reauthenticate", "needs refresh")):
                raise ValueError("expired")
            raise ValueError("collector_failed")
        return normalized(payload)
    finally:
        if problem or proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
        selector.close()
        proc.stdout.close()
        proc.stderr.close()


def refresh_one(item, inventory):
    p = profile(item["id"], inventory)
    before = auth_generation(p)
    if before is None:
        return display_row(item, {}, None)
    state = load_state(p, before)
    now = time.time()
    next_attempt = state.get("nextAttempt", 0)
    if isinstance(next_attempt, (int, float)) and now < next_attempt <= now + 3600:
        return display_row(item, state, before, now)
    state.update({"generation": before, "lastAttemptAt": iso_now(now)})
    try:
        snapshot = collect(p)
        after = auth_generation(p)
        if after != before:
            return display_row(item, {}, after)
        state.update({"snapshot": snapshot, "status": "ok", "errorCode": None,
                      "failures": 0, "nextAttempt": now + INTERVAL})
    except (ValueError, OSError) as exc:
        after = auth_generation(p)
        if after != before:
            return display_row(item, {}, after)
        code = str(exc) if isinstance(exc, ValueError) else "collector_unavailable"
        if code not in {"timeout", "output_limit", "rate_limited", "expired",
                        "unsupported_api_key", "collector_failed", "invalid_payload",
                        "unexpected_source", "no_quota", "collector_unavailable"}:
            code = "collector_failed"
        failures = min(int(state.get("failures", 0)) + 1, 6)
        state.update({"status": code if code in ("rate_limited", "expired", "unsupported_api_key")
                      else "error", "errorCode": code, "failures": failures,
                      "nextAttempt": now + min(3600, INTERVAL * (2 ** (failures - 1)))})
    write_json(p / "state.json", state)
    after = auth_generation(p)
    return display_row(item, state if before == after else {}, after)


def run(args):
    init()
    lock_path = ROOT / "inventory.lock"
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o077:
            raise ValueError("unsafe_lock")
        fcntl.flock(fd, fcntl.LOCK_EX)
        inventory = read_index()
        if args.action == "add":
            if not valid_alias(args.alias):
                raise ValueError("invalid_alias")
            if any(x["alias"].casefold() == args.alias.casefold() for x in inventory):
                raise ValueError("duplicate_alias")
            account_id = secrets.token_hex(16)
            p = ROOT / "profiles" / account_id
            p.mkdir(mode=0o700)
            fd2 = os.open(p / "config.toml", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd2, "w") as f:
                f.write('cli_auth_credentials_store = "file"\n')
            item = {"id": account_id, "alias": args.alias}
            inventory.append(item)
            write_json(ROOT / "index.json", inventory)
            return account_row(item, inventory)
        if args.action == "login-plan":
            return login_plan(profile(args.id, inventory))
        if args.action == "refresh":
            if args.id:
                profile(args.id, inventory)
                selected = [x for x in inventory if x["id"] == args.id]
            else:
                selected = inventory
            rows = [refresh_one(x, inventory) for x in selected]
            return {"accounts": rows}
        return {"accounts": [account_row(item, inventory) for item in inventory]}
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("list")
    add = sub.add_parser("add")
    add.add_argument("--alias", required=True)
    login = sub.add_parser("login-plan")
    login.add_argument("--id", required=True)
    refresh = sub.add_parser("refresh")
    refresh.add_argument("--id")
    args = parser.parse_args()
    try:
        result = run(args)
        print(json.dumps(result, ensure_ascii=False))
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        code = str(exc) if isinstance(exc, ValueError) and re.fullmatch(r"[a-z_]+", str(exc)) else "operation_failed"
        print(json.dumps({"error": code}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
