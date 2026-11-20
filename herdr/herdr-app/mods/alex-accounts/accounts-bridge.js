import { appHome, checking, exec, shared, setShared } from "herdr";

const SCRIPT = () => `${appHome().replace(/\\/g, "/")}/mods/alex-accounts/accounts.py`;
const REFRESH_LEASE = "alex.codex-accounts.refresh-lease.v1";

function assertNotChecking() {
  if (checking()) throw new Error("Account adapter is disabled during checks");
}

function parseOutput(result) {
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error("invalid_payload");
  }
  if (result.code !== 0 || value?.error) {
    const error = new Error(
      typeof value?.error === "string" && /^[a-z_]+$/.test(value.error)
        ? value.error
        : "operation_failed"
    );
    error.code = typeof value?.error === "string" && /^[a-z_]+$/.test(value.error)
      ? value.error
      : "operation_failed";
    throw error;
  }
  return value;
}

async function invoke(args, timeout) {
  assertNotChecking();
  const result = await exec("/usr/bin/python3", [SCRIPT(), ...args], { timeout });
  return parseOutput(result);
}

/** Cheap inventory read; does not invoke CodexBar or inspect login secrets. */
export function readAccounts() {
  return invoke(["list"], 10000);
}

/** Create an empty dedicated profile only after the user presses Add account. */
export function createAccount(alias) {
  return invoke(["add", "--alias", alias], 10000);
}

/**
 * Return a private launch plan to the explicit Sign in click handler only.
 * Callers must not store, render, log, or put the result in shared state.
 */
export function loginPlan(id) {
  return invoke(["login-plan", "--id", id], 10000);
}

/** One profile per call keeps each collector deadline bounded and sequential. */
export function refreshAccounts(id) {
  return invoke(["refresh", "--id", id], 60000);
}

/** Best-effort cross-mod UI coordination; backend locking remains authoritative. */
export function acquireRefreshLease(owner, ttlMs) {
  assertNotChecking();
  const now = Date.now();
  const current = shared(REFRESH_LEASE);
  if (current && typeof current === "object" && current.until > now && current.owner !== owner) return false;
  setShared(REFRESH_LEASE, { owner, until: now + Math.min(600000, Math.max(60000, ttlMs)) });
  return true;
}

export function releaseRefreshLease(owner) {
  if (checking()) return;
  const current = shared(REFRESH_LEASE);
  if (current?.owner === owner) setShared(REFRESH_LEASE, null);
}
