# Herdr coordination

Use only for explicitly authorized delegation. Default independent Codex workers
return a **pull-based file**, not a Herdr message. No worker socket, network,
approval, model, trust or sandbox override is requested. The configured sandbox
still applies; if it denies the report write, the worker must stop and surface
the blocker, not bypass review. This does not disable capabilities already
available under a broader existing configuration.

Prepare a dedicated existing checkout and a live local parent. Authorize the
task's ordinary source permissions and the additional report directory shown
in preview. The helper creates `.herdr-coordination/<domain>/<task>/report.json`
inside that checkout; it may appear in Git status. No `.gitignore` is changed.
Workers publish atomically using a temporary file in that same directory.
Do not put secrets in scope, prompts, arguments or reports: argv, terminal
metadata, output and files may be visible to other same-user processes.

```sh
python3 coord.py start --parent t7 --domain project-a --task fix-42 --cwd /existing/dedicated-checkout --scope 'Read src/a.py; do not edit source.' --dry-run
python3 coord.py start --parent t7 --domain project-a --task fix-42 --cwd /existing/dedicated-checkout --scope 'Read src/a.py; do not edit source.'
python3 coord.py wait --domain project-a --task fix-42 --timeout 180
python3 coord.py collect --domain project-a --task fix-42
python3 coord.py status --domain project-a
python3 coord.py send --parent t7 --worker t8 --domain project-a --task fix-42 --message 'Please include the test result.'
```

Preview performs read-only hc calls, which may start its core; it writes no
files and takes no lock. Start uses absolute Codex and selected Node PATH,
`--no-daemon`, real hc parent and `coord.*` v1 labels, without shell execution.
The report helper is named in the startup prompt with task identity and a
random task token; it makes no hc calls. It accepts `report-file --cwd ...
--domain ... --task ... --token ... --status done|blocked --findings ...
--checks ... --blocker ...`. Its maximum JSON size is 16384 bytes. Direct
legacy `report` remains available for a manager already using hc; it is not
included in worker instructions. The previously rejected
`--allow-worker-network` option is no longer accepted.

`wait` calls the installed `hc wait --children any` once and then collects;
it does not poll or watch. Herdr child turn/status news or a parent message
can wake it; an artifact alone does not send an event. `collect` validates
the schema, task token, ownership and paths without following report-path
symlinks. Missing report is pending. A report, including one from a still
working process, is an **unverified claim**, never approval or proof that
checks passed. Terminal status, launch, or a successful send is not completion.
Inspect results and independently verify. Send is parent-side only, uses
`hc send --if idle`, never force or automatic resend.

Manager-only manifests live under `~/.local/state/herdr-coordination` (or
`$XDG_STATE_HOME`) and reserve both task and checkout. A manifest is written
before launch with an uncertain state, then updated with the real terminal
address on success. Failure, timeout, crash or malformed response can leave
uncertain state: `collect` reconciles only a unique matching hc parent and
label set; otherwise inspect manually before any retry. Labels are mutable,
so inspect the result. No automatic duplicate launch or removal occurs. Existing manifests
also reserve completed checkouts; manual reconciliation and deliberate
archival are required before reuse. Locks cover cooperating local starts only;
they do not control direct hc users or other hosts. Mutable labels and tokens
are correlation, not authentication against same-user processes. A parent
ending normally ends children; adoption labels can enable Herdr keep, which
recovers a shell, not the worker.

The report mechanism is not a sandbox: file access is subject to configured
Codex permissions and the worker's task instructions. Path validation protects
against accidental traversal and symlinks, not a hostile same-UID process
concurrently replacing checkout ancestors. Caller must verify dedicated
checkouts and nonoverlapping scopes. Launch success does not prove that Codex
consumed the initial prompt; inspect startup/trust dialogs without bypassing
them. A restricted-network standalone `:workspace` sandbox probe could write
a fixture report and was denied connecting to the existing Herdr Unix socket;
this alone is not proof of a real worker's configured policy or report delivery.
