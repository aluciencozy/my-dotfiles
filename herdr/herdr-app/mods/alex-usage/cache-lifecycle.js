// Cache reads are independent of focus; provider refreshes are not.
export async function readCached(read, normalize) {
  try {
    const result = normalize(await read());
    return result.ok ? result : { ok: false, accounts: [] };
  } catch {
    return { ok: false, accounts: [] };
  }
}

export function refreshDue(now, next, active, hasProfiles) {
  return Boolean(active && hasProfiles && now >= next);
}
