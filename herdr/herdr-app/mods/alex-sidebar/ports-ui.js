// Only show a fresh, verified observation owned by this exact local terminal.
// No URL is generated: listening does not establish HTTP or reachability.
export function portsFor(snapshot, terminal, now = Date.now()) {
  if (!Array.isArray(snapshot) || typeof terminal !== "string" || !terminal || terminal.includes("/")) return [];
  const ports = new Map();
  for (const item of snapshot) {
    if (!item || item.terminal !== terminal || item.status !== "ok" || item.machine != null && item.machine !== "" ||
        !Number.isInteger(item.pid) || item.pid <= 0 || !Number.isFinite(item.start_time) || item.start_time <= 0 ||
        !Number.isInteger(item.port) || item.port < 1 || item.port > 65535 || typeof item.address !== "string" || !item.address ||
        !Number.isFinite(item.observed_at) || item.observed_at > now || now - item.observed_at > 30000) continue;
    ports.set(item.port, item);
  }
  return [...ports.values()].sort((a, b) => a.port - b.port);
}

// Outside listeners belong to a uniquely represented local directory, not a
// terminal. Duplicate roots across spaces are intentionally ambiguous.
export function projectPortsFor(snapshot, group, grouped, now = Date.now()) {
  if (!Array.isArray(snapshot) || !group || !Array.isArray(grouped)) return [];
  const matches = grouped.flatMap(({space, dirs}) => space.machine ? [] : dirs.filter(d => d.dir === group.dir));
  if (matches.length !== 1) return [];
  const ports = new Map();
  for (const item of snapshot) {
    if (!item || item.relation !== "project" || item.terminal !== null || item.project_dir !== group.dir ||
        item.status !== "ok" || (item.machine != null && item.machine !== "") ||
        !Number.isInteger(item.pid) || item.pid <= 0 || !Number.isFinite(item.start_time) || item.start_time <= 0 ||
        !Number.isInteger(item.port) || item.port < 1 || item.port > 65535 || typeof item.address !== "string" || !item.address ||
        !Number.isFinite(item.observed_at) || item.observed_at > now || now - item.observed_at > 30000) continue;
    ports.set(item.port, item);
  }
  return [...ports.values()].sort((a,b) => a.port-b.port);
}
