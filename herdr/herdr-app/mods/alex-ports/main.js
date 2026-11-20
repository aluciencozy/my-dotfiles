import { View, div } from "gpui-kit";
import { appHome, checking, exec, layout, panes, spaces, setShared, shared, terminals, window } from "herdr";

const SNAPSHOT_KEY = "alex.ports.snapshot";
const STATUS_KEY = "alex.ports.status";
const MOD_NAME = "alex-ports";
const BLOCK_ID = "port-observer";
const POLL_MS = 10_000;
const MAX_AGE_MS = 30_000;
const HELPER_LIMIT = 48_000;

function observerBlock(node, visible = true) {
  if (!node || typeof node !== "object") return null;
  visible = visible && !node.hidden;
  if (node.id === BLOCK_ID && node.content?.mod === MOD_NAME) return visible;
  for (const child of node.children ?? []) {
    const found = observerBlock(child, visible && (node.type !== "stack" || child.id === node.active));
    if (found !== null) return found;
  }
  return null;
}

function observerActive() {
  return !checking() && window().active && observerBlock(layout()) === true;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function rootsForLocalTerminals() {
  const roots = [];
  let incompleteRoots = 0;
  const addresses = new Set();

  for (const terminal of terminals()) {
    if (terminal?.state !== "live") continue;
    const address = terminal.address;
    if (typeof address !== "string" || !address || address.includes("/")) continue;
    if (terminal.machine != null && terminal.machine !== "") continue;
    if (/[\x00-\x1f\x7f]/.test(address)) {
      incompleteRoots += 1;
      continue;
    }

    // A foreground PID can be reused independently and is not a stable root.
    // Only a validated terminal process and its descendants may own a badge.
    const pids = [terminal.pid].filter(positiveInteger);
    if (!pids.length || !Number.isSafeInteger(terminal.created_ms) || terminal.created_ms <= 0) {
      incompleteRoots += 1;
      continue;
    }

    addresses.add(address);
    roots.push({ address, pids, created_ms: terminal.created_ms });
  }

  return { roots, incomplete_roots: incompleteRoots, addresses };
}

function validListener(record, addresses, now) {
  return record &&
    ((record.relation === "terminal" && typeof record.terminal === "string" && addresses.has(record.terminal)) ||
     (record.relation === "project" && record.terminal === null && typeof record.project_dir === "string" && record.project_dir.startsWith("/") && !/[\x00-\x1f\x7f]/.test(record.project_dir))) &&
    positiveInteger(record.pid) &&
    positiveInteger(record.start_time) &&
    typeof record.address === "string" && record.address.length > 0 &&
    !/[\x00-\x1f\x7f]/.test(record.address) &&
    Number.isInteger(record.port) && record.port >= 1 && record.port <= 65535 &&
    (record.family === "ipv4" || record.family === "ipv6") &&
    (record.machine === null || record.machine === "") &&
    record.status === "ok" &&
    Number.isSafeInteger(record.observed_at) &&
    record.observed_at <= now && now - record.observed_at <= MAX_AGE_MS;
}

function currentSnapshot(records, addresses, now) {
  const unique = new Map();
  for (const record of records) {
    if (!validListener(record, addresses, now)) continue;
    const normalized = {
      terminal: record.terminal,
      pid: record.pid,
      start_time: record.start_time,
      address: record.address,
      family: record.family,
      port: record.port,
      status: "ok",
      machine: null,
      relation: record.relation,
      ...(record.relation === "project" ? { project_dir: record.project_dir } : {}),
      observed_at: record.observed_at,
    };
    const key = [normalized.terminal, normalized.pid, normalized.start_time, normalized.address, normalized.family, normalized.port].join("\0");
    unique.set(key, normalized);
  }
  return [...unique.values()].sort((a, b) =>
    String(a.terminal ?? a.project_dir).localeCompare(String(b.terminal ?? b.project_dir)) ||
    a.port - b.port ||
    a.address.localeCompare(b.address) ||
    a.pid - b.pid
  );
}

function setIfChanged(key, value) {
  if (JSON.stringify(shared(key) ?? null) !== JSON.stringify(value)) setShared(key, value);
}

function sanitizedStatus(result, fallbackState = "error") {
  const state = ["ok", "partial", "error"].includes(result?.state) ? result.state : fallbackState;
  const allowed = new Set([
    "listener scanner unavailable",
    "listener scan failed",
    "some listener or process metadata was unavailable",
    "invalid observer input",
  ]);
  return {
    version: 1,
    checked_at: Number.isSafeInteger(result?.checked_at) ? result.checked_at : Date.now(),
    state,
    error: typeof result?.error === "string" && allowed.has(result.error) ? result.error : null,
  };
}

export default class PortObserver extends View {
  init(_props, cx) {
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        if (observerActive()) {
          await this.poll();
        }
        await cx.sleep(POLL_MS);
      }
    });
  }

  async poll() {
    try {
      const { roots, incomplete_roots, addresses } = rootsForLocalTerminals();
      const localTabs = new Set(spaces().filter(s => !s.machine).flatMap(s => (s.tabs ?? []).map(t => t.id)));
      const projects = [...new Set(panes().filter(p => localTabs.has(p.tab) && typeof p.cwd === "string" && p.cwd.startsWith("/")).map(p => p.cwd))];
      const input = JSON.stringify({ roots, incomplete_roots, projects });
      if (input.length > HELPER_LIMIT) {
        this.publish([], { version: 1, checked_at: Date.now(), state: "error", error: "invalid observer input" });
        return;
      }

      const result = await exec(
        "python3",
        ["-I", `${appHome()}/mods/alex-ports/ports.py`, input],
        { timeout: 15_000 },
      );
      if (result.code !== 0) throw new Error("helper failed");
      const parsed = JSON.parse(result.stdout);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.listeners)) throw new Error("helper response invalid");
      if (!observerActive()) return;
      const status = sanitizedStatus(parsed);
      const records = status.state === "error" ? [] : currentSnapshot(parsed.listeners, addresses, Date.now());
      this.publish(records, status);
    } catch {
      if (observerActive()) {
        this.publish([], { version: 1, checked_at: Date.now(), state: "error", error: "listener scan failed" });
      }
    }
  }

  publish(records, status) {
    setIfChanged(SNAPSHOT_KEY, records);
    setIfChanged(STATUS_KEY, status);
  }

  render() {
    return div().id("alex-ports-observer").w(0).h(0).flex_none();
  }
}
