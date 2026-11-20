#!/usr/bin/env python3
"""Explicit, local hc coordination; see README.md for guarantees and limits."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import secrets
import hashlib
import shlex

ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$")
ADDR = re.compile(r"^t[0-9a-z]+$")
CAP = 3
MAX_REPORT = 16384


def state_dir():
    return Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state") / "herdr-coordination"


def manifest_path(domain, task):
    key = hashlib.sha256((domain + "\0" + task).encode()).hexdigest()
    return state_dir() / (key + ".json")


def atomic_json(path, data):
    raw = json.dumps(data, ensure_ascii=False).encode()
    fd, tmp = tempfile.mkstemp(prefix=".coord-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def report_dir(cwd, domain, task):
    return Path(cwd) / ".herdr-coordination" / domain / task


def open_report_dir(cwd, domain, task):
    # Open each component without following symlinks; retain the final dirfd.
    if not Path(cwd).is_absolute() or Path(cwd).resolve(strict=True) != Path(cwd):
        raise Failure("checkout must be an absolute canonical path without symlinks")
    fd = os.open(cwd, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in (".herdr-coordination", domain, task):
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nxt
            st = os.fstat(fd)
            if st.st_uid != os.getuid() or st.st_mode & 0o022:
                raise Failure("report directories must be owned and not group/world writable")
        return fd
    except BaseException:
        os.close(fd)
        raise


def validate_report(data, domain, task, token):
    if not isinstance(data, dict) or set(data) != {"version", "domain", "task", "token", "status", "findings", "checks", "blocker"}:
        raise Failure("invalid report schema")
    if type(data["version"]) is not int or data["version"] != 1 or data["domain"] != domain or data["task"] != task or data["token"] != token:
        raise Failure("report identity mismatch")
    if data["status"] not in ("done", "blocked") or any(not isinstance(data[k], str) for k in ("findings", "checks", "blocker")):
        raise Failure("invalid report fields")
    return data


def report_file(a):
    data = {"version": 1, "domain": a.domain, "task": a.task, "token": a.token,
            "status": a.status, "findings": a.findings, "checks": a.checks, "blocker": a.blocker}
    raw = json.dumps(data, ensure_ascii=False).encode()
    if len(raw) > MAX_REPORT:
        raise Failure("report exceeds 16384 bytes")
    validate_report(data, a.domain, a.task, a.token)
    fd = open_report_dir(a.cwd, a.domain, a.task)
    name = ".report-" + secrets.token_hex(12)
    try:
        try:
            st = os.stat("report.json", dir_fd=fd, follow_symlinks=False)
            if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid():
                raise Failure("existing report is not an owned regular file")
        except FileNotFoundError:
            pass
        out = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
        with os.fdopen(out, "wb") as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, "report.json", src_dir_fd=fd, dst_dir_fd=fd)
    finally:
        try:
            os.unlink(name, dir_fd=fd)
        except FileNotFoundError:
            pass
        os.close(fd)
    return {"operation": "report-file", "written": True}


def load_manifest(a):
    path = manifest_path(a.domain, a.task)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as f:
        if os.fstat(f.fileno()).st_uid != os.getuid():
            raise Failure("manifest owner mismatch")
        data = json.load(f)
    if data.get("domain") != a.domain or data.get("task") != a.task:
        raise Failure("manifest identity mismatch")
    return data


def collect(a):
    m = load_manifest(a)
    if not m.get("worker"):
        candidates = [t for t in listing() if matching(t, argparse.Namespace(**m))
                      and ADDR.fullmatch(str(t.get("address", "")))]
        if len(candidates) == 1:
            m.update(worker=candidates[0]["address"], launch="reconciled from labels")
            atomic_json(manifest_path(a.domain, a.task), m)
        elif len(candidates) > 1:
            raise Failure("multiple workers match uncertain launch; inspect manually")
    worker = terminal(m["worker"]) if m.get("worker") else None
    if worker and not matching(worker, argparse.Namespace(**m)):
        raise Failure("worker relationship mismatch")
    fd = open_report_dir(m["cwd"], a.domain, a.task)
    try:
        try:
            rfd = os.open("report.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        except FileNotFoundError:
            return {"operation": "collect", "launch": m["launch"], "worker": worker, "report": None, "claim": "pending"}
        with os.fdopen(rfd, "rb") as f:
            st = os.fstat(f.fileno())
            if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid():
                raise Failure("report is not an owned regular file")
            raw = f.read(MAX_REPORT + 1)
        if len(raw) > MAX_REPORT:
            raise Failure("report exceeds 16384 bytes")
        data = validate_report(json.loads(raw), a.domain, a.task, m["token"])
        data.pop("token")
        return {"operation": "collect", "launch": m["launch"], "worker": worker, "report": data,
                "claim": "unverified worker claim; worker may still be working", "verified": False}
    finally:
        os.close(fd)


def wait_collect(a):
    if not 1 <= a.timeout <= 3600:
        raise Failure("wait timeout must be between 1 and 3600 seconds")
    m = load_manifest(a)
    result = hc("wait", "--json", "--children", "any", "--timeout", str(a.timeout), m["parent"])
    collected = collect(a)
    collected["operation"] = "wait"
    collected["wait"] = result
    return collected


class Failure(Exception):
    pass


def verified_core_socket():
    """Read the running session's lock and compare its live core identity to hc."""
    session = os.environ.get("HC_SESSION", "").strip() or "default"
    if session in (".", "..") or any(c in session for c in '/\\:*?"<>|') or any(ord(c) < 32 for c in session):
        raise Failure("invalid HC_SESSION")
    state = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state")
    lock = state / "herdr-core" / session / "core.lock"
    fd = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as f:
        data = f.read(4097)
    if not data or len(data) > 4096:
        raise Failure("invalid core lock endpoint")
    path = Path(os.fsdecode(data))
    if not path.is_absolute() or not stat.S_ISSOCK(path.lstat().st_mode) or path.lstat().st_uid != os.getuid():
        raise Failure("core lock does not name an owned absolute socket")
    status = hc("server", "status", "--json")
    core_id = status.get("core", {}).get("id") if isinstance(status, dict) else None
    if not isinstance(core_id, str) or not core_id:
        raise Failure("cannot identify selected hc core")
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
        s.settimeout(3)
        s.connect(str(path))
        s.sendall(b'{"jsonrpc":"2.0","id":1,"method":"server.status","params":{}}\n')
        with s.makefile("rb") as f:
            response = json.loads(f.readline(65537))
    if response.get("id") != 1 or response.get("result", {}).get("core", {}).get("id") != core_id:
        raise Failure("lock socket and selected hc core identity differ")
    return str(path)


def launch_selection():
    codex = shutil.which("codex")
    if not codex:
        raise Failure("codex not found in caller PATH; invoke from an environment where codex is installed")
    codex = os.path.abspath(codex)
    with open(codex, "rb") as f:
        header = f.readline(256)
    env = {}
    if header.startswith(b"#!"):
        if header.strip() != b"#!/usr/bin/env node":
            raise Failure("unsupported codex interpreter; use a native codex or a #!/usr/bin/env node installation")
        node = shutil.which("node")
        if not node:
            raise Failure("codex requires node, but node is not executable in caller PATH")
        node = os.path.abspath(node)
        with open(node, "rb") as f:
            if f.read(2) == b"#!":
                raise Failure("node is a script wrapper; install an executable Node runtime in caller PATH")
        if not os.path.isfile("/usr/bin/env") or not os.access("/usr/bin/env", os.X_OK):
            raise Failure("codex requires executable /usr/bin/env")
        hc_path = shutil.which("hc")
        if not hc_path:
            raise Failure("hc not found in caller PATH")
        dirs = [os.path.dirname(node), os.path.dirname(os.path.abspath(hc_path)), "/usr/bin", "/bin"]
        if any(":" in d for d in dirs):
            raise Failure("node or hc directory contains ':' and cannot be represented safely in PATH")
        env["PATH"] = ":".join(dict.fromkeys(dirs))
    return codex, env


def hc_run(params):
    request = {"jsonrpc": "2.0", "id": 1, "method": "terminal.run", "params": params}
    try:
        p = subprocess.run(["hc", "connect"], input=json.dumps(request) + "\n",
                           capture_output=True, text=True, timeout=90)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Failure(f"hc connect failed or timed out: {e}; outcome may be unknown; inspect before retry") from e
    try:
        response = json.loads(p.stdout)
        if p.returncode or response.get("id") != 1 or "error" in response:
            raise Failure(f"hc terminal.run failed: {response.get('error', 'invalid response')}; inspect before retry")
        return response["result"]
    except (ValueError, KeyError, AttributeError) as e:
        raise Failure("invalid hc terminal.run response; outcome may be unknown; inspect before retry") from e


def hc(*args):
    try:
        limit = int(args[args.index("--timeout") + 1]) + 15 if args and args[0] == "wait" and "--timeout" in args else 90
        p = subprocess.run(["hc", *args], capture_output=True, text=True, timeout=limit)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Failure(f"hc failed or timed out: {e}; outcome may be unknown; inspect before retry") from e
    if p.returncode:
        raise Failure(f"hc exit {p.returncode}: {p.stderr.strip() or p.stdout.strip()}; inspect before retry")
    try:
        return json.loads(p.stdout)
    except ValueError as e:
        raise Failure("hc returned invalid JSON; outcome may be unknown; inspect before retry") from e


def identifier(value):
    if not ID.fullmatch(value):
        raise argparse.ArgumentTypeError("use 1-64 letters, digits, dot, underscore or hyphen; start alphanumeric")
    return value


def address(value):
    if not ADDR.fullmatch(value):
        raise argparse.ArgumentTypeError("use a local canonical hc address such as t7")
    return value


def text(value):
    if not value.strip() or len(value.encode()) > 4096 or "\x00" in value:
        raise argparse.ArgumentTypeError("text must be nonempty and at most 4096 UTF-8 bytes")
    return value


def listing():
    data = hc("ls", "--json", "--label", "coord.version=1")
    if not isinstance(data, dict) or not isinstance(data.get("terminals"), list):
        raise Failure("unexpected hc ls response; refusing operation")
    if any(not isinstance(t, dict) or not isinstance(t.get("labels"), dict) for t in data["terminals"]):
        raise Failure("unexpected hc terminal or labels; refusing operation")
    return data["terminals"]


def terminal(addr):
    data = hc("get", "--json", addr)
    if not isinstance(data, dict) or data.get("address") != addr:
        raise Failure("unexpected hc get response or address; refusing operation")
    return data


def matching(t, a):
    labels = t.get("labels", {})
    return (isinstance(labels, dict) and labels.get("coord.version") == "1"
            and labels.get("coord.role") == "worker" and labels.get("coord.domain") == a.domain
            and labels.get("coord.task") == a.task and labels.get("coord.parent") == a.parent
            and t.get("parent") == a.parent)


def start(a):
    cwd = Path(a.cwd).expanduser().resolve(strict=True)
    if not cwd.is_dir():
        raise Failure("cwd must be an existing dedicated checkout directory")
    if not (cwd / ".git").exists():
        raise Failure("cwd must be the root of an existing dedicated Git checkout")
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env["GIT_OPTIONAL_LOCKS"] = "0"
    try:
        git = subprocess.run(["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
                             capture_output=True, text=True, timeout=10, env=env)
        if git.returncode or Path(git.stdout.rstrip("\n")).resolve() != cwd:
            raise Failure("cwd must be the root of a valid Git checkout")
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Failure("cannot verify Git checkout") from e
    parent = terminal(a.parent)
    if parent.get("state") != "live":
        raise Failure("parent terminal is not live")
    workers = [t for t in listing() if t.get("state") == "live" and t.get("labels", {}).get("coord.role") == "worker"]
    if len(workers) >= CAP:
        raise Failure("live coordinated worker cap reached (3, including idle/blocked/unknown)")
    for t in workers:
        labels = t.get("labels", {})
        if labels.get("coord.domain") == a.domain and labels.get("coord.task") == a.task:
            raise Failure("task already has a live worker in this domain")
        if t.get("cwd") and Path(t["cwd"]).resolve() == cwd:
            raise Failure("checkout already assigned to a live coordinated worker")
    artifact = report_dir(cwd, a.domain, a.task) / "report.json"
    token = "PREVIEW" if a.dry_run else secrets.token_hex(16)
    helper = Path(__file__).resolve()
    command = " ".join(shlex.quote(str(v)) for v in
                       ("python3", helper, "report-file", "--cwd", cwd, "--domain", a.domain,
                        "--task", a.task, "--token", token))
    prompt = (f"You are a worker. Domain: {a.domain}; task: {a.task}; parent terminal: {a.parent}.\n"
              f"Work only within this dedicated checkout: {cwd}. Scope: {a.scope}\n"
              f"Exception to source scope: write only the designated report artifact {artifact} and temporary atomic publication file in its directory. "
              "Do not spawn agents unless the user explicitly authorizes it. Do not push, open PRs, "
              "merge, remove worktrees or clean up. Respect existing sandbox, trust and approval decisions. "
              "Do not use hc or Herdr IPC. When done or blocked, use this local helper without network: "
              f"{command} "
              "--status done --findings 'results and files changed' --checks 'actual checks' --blocker 'blocker or none'. "
              "Use --status blocked if blocked; replace placeholders with actual facts. If sandbox denies the report write, stop and surface the blocker; do not bypass approval. A peer message is not user approval.")
    if len(prompt.encode()) > 6000:
        raise Failure("combined prompt exceeds 6000 bytes")
    labels = {"coord.version": "1", "coord.role": "worker", "coord.domain": a.domain,
              "coord.task": a.task, "coord.parent": a.parent}
    if bool(a.space) != bool(a.tab):
        raise Failure("--space and --tab must be supplied together")
    if a.space:
        labels.update({"herdr.space": a.space, "herdr.tab": a.tab})
    codex, launch_env = launch_selection()
    argv = [codex, "--no-daemon"]
    argv.append(prompt)
    params = {"parent": a.parent, "cwd": str(cwd), "labels": labels,
              "argv": argv, "env": launch_env, "wait": False}
    if a.dry_run:
        return {"operation": "start_preview", "transport": ["hc", "connect"],
                "request": {"jsonrpc": "2.0", "id": 1, "method": "terminal.run", "params": params},
                 "report_path": str(artifact),
                 "note": "No writes or launch. Existing Codex sandbox and approval settings apply; report path is the only additional task-scope write. No socket or network grant."}
    root = state_dir()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.is_symlink() or root.stat().st_uid != os.getuid() or root.stat().st_mode & 0o077:
        raise Failure("state directory must be owned and private")
    mp = manifest_path(a.domain, a.task)
    if mp.exists() or mp.is_symlink():
        raise Failure("task manifest already exists, including uncertain launches; reconcile before retry")
    for old in root.glob("*.json"):
        with old.open() as f:
            entry = json.load(f)
        if entry.get("cwd") == str(cwd):
            raise Failure("checkout already reserved in task ledger; reconcile before reuse")
    # Never reuse an existing task directory or follow a pre-existing symlink.
    fd = os.open(cwd, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in (".herdr-coordination", a.domain):
            try:
                os.mkdir(part, 0o700, dir_fd=fd)
            except FileExistsError:
                pass
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nxt
            st = os.fstat(fd)
            if st.st_uid != os.getuid() or st.st_mode & 0o022:
                raise Failure("report directories must be owned and not group/world writable")
        os.mkdir(a.task, 0o700, dir_fd=fd)
    finally:
        os.close(fd)
    manifest = {"domain": a.domain, "task": a.task, "parent": a.parent, "cwd": str(cwd),
                "report_path": str(artifact), "token": token, "worker": None, "launch": "uncertain"}
    atomic_json(mp, manifest)
    result = hc_run(params)
    if not isinstance(result, dict) or not ADDR.fullmatch(str(result.get("address", ""))):
        raise Failure("unexpected hc run response; launch outcome unknown; inspect hc ls before retry")
    manifest.update(worker=result["address"], launch="started")
    atomic_json(mp, manifest)
    return {"operation": "start", "terminal": result, "report_path": str(artifact), "delivery": "unknown: direct Codex prompt; inspect terminal", "completed": False}


def status(a):
    records = []
    if state_dir().exists():
        for path in state_dir().glob("*.json"):
            with path.open() as f:
                m = json.load(f)
            if m.get("domain") == a.domain:
                records.append({k: m.get(k) for k in ("domain", "task", "parent", "cwd", "worker", "launch", "report_path")})
    return {"operation": "status", "workers": [t for t in listing() if t.get("labels", {}).get("coord.domain") == a.domain and t.get("labels", {}).get("coord.role") == "worker"], "tasks": records, "note": "Observed terminal state is not proof of task completion."}


def send(a):
    worker = terminal(a.worker)
    if not matching(worker, a) or worker.get("state") != "live":
        raise Failure("worker identity, parent, domain, task or live state mismatch")
    target = a.parent if a.report else a.worker
    recipient = terminal(target) if a.report else worker
    if recipient.get("state") != "live":
        raise Failure("recipient is not live")
    # hc performs the decisive atomic idle check and rejects blocked recipients.
    message = f"[coord domain={a.domain} task={a.task} {'report' if a.report else 'message'}] {a.message}"
    result = hc("send", "--json", "--if", "idle", target, message)
    return {"operation": "report" if a.report else "send", "recipient": target, "hc": result,
            "note": "Delivery does not prove the recipient processed the message or completed work."}


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("start")
    s.add_argument("--parent", type=address, required=True)
    s.add_argument("--domain", type=identifier, required=True)
    s.add_argument("--task", type=identifier, required=True)
    s.add_argument("--cwd", required=True)
    s.add_argument("--scope", type=text, required=True)
    s.add_argument("--space", type=identifier)
    s.add_argument("--tab", type=identifier)
    s.add_argument("--dry-run", action="store_true")
    s.set_defaults(action=start)
    s = sub.add_parser("status")
    s.add_argument("--domain", type=identifier, required=True)
    s.set_defaults(action=status)
    for name, action in (("collect", collect), ("wait", wait_collect)):
        s = sub.add_parser(name)
        s.add_argument("--domain", type=identifier, required=True)
        s.add_argument("--task", type=identifier, required=True)
        if name == "wait":
            s.add_argument("--timeout", type=int, default=180)
        s.set_defaults(action=action)
    s = sub.add_parser("report-file")
    s.add_argument("--cwd", required=True)
    s.add_argument("--domain", type=identifier, required=True)
    s.add_argument("--task", type=identifier, required=True)
    s.add_argument("--token", required=True)
    s.add_argument("--status", choices=("done", "blocked"), required=True)
    for field in ("findings", "checks", "blocker"):
        s.add_argument("--" + field, required=True)
    s.set_defaults(action=report_file)
    for name in ("send", "report"):
        s = sub.add_parser(name)
        s.add_argument("--parent", type=address, required=True)
        s.add_argument("--worker", type=address, required=True)
        s.add_argument("--domain", type=identifier, required=True)
        s.add_argument("--task", type=identifier, required=True)
        s.add_argument("--message", type=text, required=True)
        s.set_defaults(action=send, report=name == "report")
    return p


def main():
    a = parser().parse_args()
    try:
        if a.command == "start" and not a.dry_run:
            # Serialize cooperative helper launches on this host, not arbitrary hc users.
            path = os.path.join(tempfile.gettempdir(), f"herdr-coordination-{os.getuid()}.lock")
            fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "r+") as lock:
                if os.fstat(lock.fileno()).st_uid != os.getuid():
                    raise Failure("lock file owner mismatch")
                fcntl.flock(lock, fcntl.LOCK_EX)
                result = a.action(a)
        else:
            result = a.action(a)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (Failure, OSError, RuntimeError, ValueError) as e:
        print(json.dumps({"error": str(e), "operation": a.command}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
