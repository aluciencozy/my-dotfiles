const STATUSES = new Set([
  "missing_login", "unknown", "ok", "stale", "expired",
  "rate_limited", "unsupported_api_key", "error"
]);

const ERROR_LABELS = {
  expired: "Sign-in expired",
  rate_limited: "Rate limited",
  unsupported_api_key: "API-key quota unsupported",
  timeout: "Collector timed out",
  output_limit: "Collector output limit",
  invalid_payload: "Invalid usage response",
  unexpected_source: "Unexpected usage source",
  no_quota: "No quota reported",
  collector_failed: "Collector failed",
  collector_unavailable: "Collector unavailable",
  operation_failed: "Account operation failed",
  invalid_alias: "Use an alias of 1–48 characters",
  duplicate_alias: "That alias is already in use",
  invalid_id: "Account reference is invalid",
  unknown_id: "Account is no longer available",
  unsafe_file: "Profile file permissions are unsafe; make auth.json owner-only (0600)",
  codex_or_node_unavailable: "Codex sign-in tools are unavailable"
};

function safeText(value, max = 80) {
  if (typeof value !== "string") return "";
  return [...value.replace(/[\u0000-\u001f\u007f]/g, "").trim()].slice(0, max).join("");
}

function timestampSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 100000000000 ? value / 1000 : value;
  }
  if (typeof value !== "string" || value.length > 48) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

function normalizedStatus(value) {
  const status = typeof value === "string" ? value.toLowerCase() : "";
  if (STATUSES.has(status)) return status;
  if (status === "needs_login" || status === "no_login") return "missing_login";
  if (status === "ready" || status === "current") return "ok";
  return "unknown";
}

function normalizedWindow(value) {
  if (!value || typeof value !== "object") return null;
  const rawPercent = value.usedPercent;
  const usedPercent = rawPercent == null
    ? null
    : typeof rawPercent === "number" && Number.isFinite(rawPercent) && rawPercent >= 0
      ? rawPercent
      : null;
  const rawDuration = value.durationMinutes;
  const durationMinutes = Number.isInteger(rawDuration) && rawDuration > 0
    ? rawDuration
    : null;
  return {
    key: safeText(value.key, 40),
    label: safeText(value.label, 40),
    usedPercent,
    durationMinutes,
    resetsAt: timestampSeconds(value.resetsAt)
  };
}

export function normalizeAccountRow(row) {
  if (!row || typeof row !== "object" || typeof row.id !== "string" || !row.id) return null;
  const status = normalizedStatus(row.status);
  const alias = safeText(row.alias, 48) || "Codex account";
  const rawWindows = Array.isArray(row.windows) ? row.windows : [];
  // A profile without a verified login must not inherit an older profile's display.
  const windows = status === "ok" || status === "stale"
    ? rawWindows.map((window, index) => {
        const normalized = normalizedWindow(window);
        return normalized && !normalized.key
          ? { ...normalized, key: `window-${index + 1}` }
          : normalized;
      }).filter(Boolean)
    : [];
  const errorCode = safeText(row.errorCode, 48).toLowerCase();
  return {
    id: row.id,
    alias,
    status,
    source: row.source === "oauth" || row.source === "codex-cli" ? row.source : null,
    version: safeText(row.version, 24) || null,
    plan: safeText(row.plan, 32) || null,
    observedAt: timestampSeconds(row.observedAt),
    lastAttemptAt: timestampSeconds(row.lastAttemptAt),
    errorCode: Object.prototype.hasOwnProperty.call(ERROR_LABELS, errorCode) ? errorCode : null,
    windows
  };
}

export function normalizeAccountsPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.accounts)) {
    return { ok: false, accounts: [] };
  }
  const accounts = payload.accounts.map(normalizeAccountRow);
  if (accounts.some((account) => account == null)
      || new Set(accounts.map((account) => account.id)).size !== accounts.length) {
    return { ok: false, accounts: [] };
  }
  return { ok: true, accounts };
}

export function errorLabel(code) {
  return ERROR_LABELS[safeText(code, 48).toLowerCase()] ?? "Refresh failed";
}

export function statusLabel(account) {
  switch (account?.status) {
    case "missing_login": return "Sign in needed";
    case "unknown": return "Not checked";
    case "ok": return "Reported";
    case "stale": return "Stale · last report retained";
    case "expired": return "Sign-in expired";
    case "rate_limited": return "Rate limited";
    case "unsupported_api_key": return "Subscription quota unsupported";
    default: return "Unavailable";
  }
}

export function statusHasIssue(account) {
  return !account || !["ok"].includes(account.status);
}

export function shouldRefreshSelected(account, selected, now, next, busy) {
  return Boolean(account && account.id === selected && account.status === "unknown"
    && !busy && now >= next);
}

export function railSummary(accounts, loadError = false) {
  const rows = Array.isArray(accounts) ? accounts : [];
  return {
    count: rows.length,
    hasIssue: Boolean(loadError || rows.some(statusHasIssue))
  };
}

export function windowTitle(window) {
  if (!window || window.durationMinutes == null) return "Usage window";
  if (window.durationMinutes === 300) return "5h";
  if (window.durationMinutes === 10080) return "Week";
  return window.label || `${window.durationMinutes}m`;
}

export function panelHeight(open, accounts, expandedIds = new Set()) {
  if (!open) return 34;
  const rows = Array.isArray(accounts) ? accounts : [];
  const contentHeight = rows.length
    ? rows.reduce((height, account) => {
        if (!expandedIds.has(account.id)) return height + 34;
        return height + 34 + 24 + Math.max(1, account.windows?.length ?? 0) * 26;
      }, 0)
    : 44;
  return Math.min(280, 76 + Math.max(44, Math.min(196, contentHeight)));
}

function validLoginArgv(argv) {
  return Array.isArray(argv)
    && argv.length >= 5
    && argv.length <= 32
    && argv.every((part) => typeof part === "string" && part.length > 0 && !/[\u0000\r\n]/.test(part))
    && argv[0] === "/usr/bin/env"
    && argv[1] === "-i"
    && argv.some((part) => part.startsWith("CODEX_HOME=/"))
    && argv.some((part) => part.startsWith("PATH="))
    && argv.at(-2).startsWith("/")
    && argv.at(-1) === "login";
}

export function makeSignInClick({ account, getSpace, getPlan, selectAccount, dismiss, run }) {
  // The private argv exists only in this click's local stack; never store or render it.
  return async function signInClick() {
    const space = getSpace();
    if (!space || space.machine !== null) throw new Error("local_space_required");
    const plan = await getPlan(account.id);
    if (!validLoginArgv(plan?.argv)) throw new Error("invalid_login_plan");
    selectAccount(account.id);
    dismiss();
    run("tab.new", {
      space: space.id,
      name: `Sign in: ${account.alias}`,
      argv: plan.argv
    });
  };
}

function assertFixture(condition, message) {
  if (!condition) throw new Error(`Account UI fixture failed: ${message}`);
}

export async function runModelFixtures() {
  const zero = normalizeAccountsPayload({
    accounts: [{
      id: "fixture-id",
      alias: "Personal",
      status: "ok",
      observedAt: "2026-11-19T12:00:00Z",
      windows: [{ key: "primary", label: "Session", usedPercent: 0, durationMinutes: 300, resetsAt: null }]
    }]
  });
  assertFixture(zero.ok && zero.accounts[0].windows[0].usedPercent === 0, "reported zero is retained");
  const unknown = normalizeAccountsPayload({ accounts: [{
    id: "fixture-unknown-window", alias: "Test", status: "ok",
    windows: [{ usedPercent: null, resetsAt: "2030-01-01T00:00:00Z" }]
  }] });
  assertFixture(unknown.accounts[0].windows[0].usedPercent === null
    && unknown.accounts[0].windows[0].resetsAt !== null, "unknown usage retains reset without becoming zero");
  assertFixture(windowTitle(zero.accounts[0].windows[0]) === "5h", "5h needs a reported duration");
  assertFixture(windowTitle({ label: "Weekly", durationMinutes: null }) === "Usage window", "cadence is not inferred");

  const missing = normalizeAccountsPayload({
    accounts: [{
      id: "fixture-missing",
      alias: "Work",
      status: "missing_login",
      windows: [{ key: "old", usedPercent: 91, durationMinutes: 300 }]
    }]
  });
  assertFixture(missing.accounts[0].windows.length === 0, "missing login cannot show old usage");
  assertFixture(railSummary(missing.accounts).count === 1 && railSummary(missing.accounts).hasIssue, "rail shows count and issue, not an aggregate");
  const stale = normalizeAccountsPayload({
    accounts: [{ id: "fixture-stale", alias: "Work", status: "stale", windows: [{ usedPercent: 42, durationMinutes: 300 }] }]
  });
  const failed = normalizeAccountsPayload({
    accounts: [{ id: "fixture-error", alias: "Work", status: "error", windows: [{ usedPercent: 99, durationMinutes: 300 }] }]
  });
  assertFixture(stale.accounts[0].windows[0].usedPercent === 42, "same-generation stale snapshot stays visibly stale");
  assertFixture(failed.accounts[0].windows.length === 0, "error without a stale status cannot show old usage");
  assertFixture(!normalizeAccountsPayload({ accounts: [null] }).ok, "invalid rows fail closed");
  assertFixture(panelHeight(false, []) === 34 && panelHeight(true, Array(30).fill({ id: "x", windows: [] })) === 272, "usage height is capped");
  assertFixture(statusLabel({ status: "stale" }).startsWith("Stale"), "stale state is explicit");
  assertFixture(!shouldRefreshSelected({id: "x", status: "missing_login"}, "x", 10, 0, false),
    "pending login never starts a fetch");
  assertFixture(shouldRefreshSelected({id: "x", status: "unknown"}, "x", 10, 0, false),
    "newly detected login permits an initial fetch");
  assertFixture(!shouldRefreshSelected({id: "x", status: "error"}, "x", 10, 0, false)
    && !shouldRefreshSelected({id: "x", status: "unknown"}, "x", 10, 11, false),
    "errors and backoff do not cause repeated fetches");

  let plans = 0;
  const launches = [];
  const order = [];
  const click = makeSignInClick({
    account: { id: "fixture-id", alias: "Personal" },
    getSpace: () => ({ id: "fixture-space", machine: null }),
    getPlan: async () => {
      plans += 1;
      return { argv: ["/usr/bin/env", "-i", "CODEX_HOME=/fixture-private", "PATH=/fixture-bin", "/fixture/codex", "login"] };
    },
    selectAccount: () => order.push("select"),
    dismiss: () => order.push("dismiss"),
    run: (name, args) => { order.push("launch"); launches.push({ name, args }); }
  });
  assertFixture(plans === 0 && launches.length === 0, "constructing a control does not sign in");
  await click();
  assertFixture(plans === 1 && launches.length === 1, "the explicit click callback launches once");
  assertFixture(order.join(",") === "select,dismiss,launch", "dismiss before opening the sign-in tab");
  assertFixture(
    launches[0].name === "tab.new"
      && launches[0].args.space === "fixture-space"
      && launches[0].args.name === "Sign in: Personal"
      && launches[0].args.argv.at(-1) === "login",
    "sign-in tab uses only the current local space and exact plan argv"
  );
  const invalidOrder = [];
  const invalidClick = makeSignInClick({
    account: { id: "x", alias: "Test" },
    getSpace: () => ({ id: "s", machine: null }),
    getPlan: async () => ({ argv: [] }),
    selectAccount: () => invalidOrder.push("select"),
    dismiss: () => invalidOrder.push("dismiss"),
    run: () => invalidOrder.push("launch")
  });
  try { await invalidClick(); } catch (_) { /* expected */ }
  assertFixture(invalidOrder.length === 0, "invalid plan leaves the manager open");
}
