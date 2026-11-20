// Islands only. Pane ownership is authoritative; pane-less children inherit
// their nearest displayed ancestor, never the other way around.
export function groupSpaces(spaces, panes, agents, terminals, tops, filter) {
  const owners = new Map(spaces.flatMap((space) => space.tabs.map((tab) => [tab.id, { space, tab }])));
  const agentMap = new Map(agents.map((agent) => [agent.address, agent]));
  const groups = spaces.map((space) => ({ space, dirs: [] }));
  const bySpace = new Map(groups.map((group) => [group.space.id, group]));
  const assigned = new Map();
  for (const pane of panes) {
    const owner = owners.get(pane.tab);
    if (!owner || !pane.terminal || assigned.has(pane.terminal)) continue;
    const cwd = pane.cwd || owner.space.folder || "";
    const root = (!owner.space.machine && tops[cwd]) || cwd;
    const dir = root ? root.replace(/\/+$/, "") || "/" : "";
    const spaceGroup = bySpace.get(owner.space.id);
    let group = spaceGroup.dirs.find((item) => item.dir === dir);
    if (!group) {
      group = { dir, entries: [], nodes: [], key: JSON.stringify([owner.space.machine ?? "", owner.space.id, dir]) };
      spaceGroup.dirs.push(group);
    }
    const entry = { pane, agent: agentMap.get(pane.terminal), ...owner };
    group.entries.push(entry);
    assigned.set(pane.terminal, group);
  }
  const terminalMap = new Map(terminals.map((terminal) => [terminal.address, terminal]));
  // Iteration reaches pane-less descendants even if they precede their parent.
  for (const terminal of terminals) {
    if (terminal.state !== "live" || !terminal.address || assigned.has(terminal.address)) continue;
    let current = terminal, group = null;
    const seen = new Set([terminal.address]);
    while (current?.parent && !seen.has(current.parent)) {
      seen.add(current.parent);
      if (assigned.has(current.parent)) { group = assigned.get(current.parent); break; }
      current = terminalMap.get(current.parent);
    }
    if (group) assigned.set(terminal.address, group);
  }
  for (const [address, group] of assigned) {
    const entry = group.entries.find((item) => item.pane.terminal === address);
    if (filter === "agents" && !agentMap.has(address)) continue;
    group.nodes.push({ address, entry, terminal: terminalMap.get(address), agent: agentMap.get(address) });
  }
  for (const spaceGroup of groups) {
    for (const group of spaceGroup.dirs) {
      const nodes = new Map(group.nodes.map((node) => [node.address, node]));
      for (const node of group.nodes) {
        const parent = node.terminal?.parent;
        // Do not make an edge if it would create a cycle.
        let current = parent, cycle = false;
        const seen = new Set([node.address]);
        while (current && nodes.has(current)) {
          if (seen.has(current)) { cycle = true; break; }
          seen.add(current);
          current = nodes.get(current).terminal?.parent;
        }
        node.parent = !cycle && nodes.has(parent) ? parent : null;
        node.externalParent = parent && !node.parent ? parent : null;
      }
    }
    spaceGroup.dirs = spaceGroup.dirs.filter((group) => group.nodes.length);
  }
  return groups;
}

export function spaceRail(spaces) {
  return spaces.map((space) => ({ id: space.id, name: space.name, active: space.active, folder: space.folder }));
}
