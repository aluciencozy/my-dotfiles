import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  agents, terminals, panes, spaces, focused, theme, run, shared, setShared,
  setAgentOrder, openOverlay, props, layout, checking, exec, window, machines, appHome
} from "herdr";
import { githubUrl } from "./github.js";
import { codexTitle } from "./codex-title.js";
import { groupSpaces, spaceRail } from "./spaces-grouping.js";
import { islandsRadius, chevron } from "./islands-ui.js";
import { portsFor, projectPortsFor } from "./ports-ui.js";

const FILTER_KEY = "alex.sidebar.filter";
const DENSITY_KEY = "alex.sidebar.density";
const METADATA_KEY = "alex.sidebar.metadata";
const MAX_TREE_DEPTH = 16;
const PROJECT_COLORS = ["#22a99a", "#e3814f", "#5b8def", "#8b7cf6", "#3fae6a", "#d9649a"];
function projectColor(name) {
  let hash = 0;
  for (const c of name ?? "") hash = (hash * 31 + c.codePointAt(0)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function isNarrow() {
  return (findNode(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
}

function isIslandsRail() {
  return shared("layout") === "alex-islands" && isNarrow();
}

function programIcon(program, size, color) {
  if (!program?.icon) return null;
  if (program.key === "opencode") return svg("icons/opencode.svg").size(size).flex_none().text_color(color);
  return program.tint
    ? svg(program.icon).size(size).flex_none().text_color(color)
    : image(program.icon).w(size).h(size).flex_none();
}

function mark(status, t) {
  if (status === "working") {
    return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
  }
  if (status === "blocked") return div().size(8).flex_none().rounded_full().bg(t.blocked);
  if (status === "done") return div().size(7).flex_none().rounded_full().bg(t.done);
  return div().size(7).flex_none();
}

function normalizedStatus(status) {
  if (status === "error") return "blocked";
  if (status === "working" || status === "blocked" || status === "done" || status === "idle") return status;
  return null;
}

function usefulTitle(value, address, program) {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title) return false;
  const lower = title.toLowerCase();
  return lower !== String(address ?? "").toLowerCase()
    && lower !== String(program?.key ?? "").toLowerCase()
    && lower !== String(program?.name ?? "").toLowerCase()
    && !/^\d+$/.test(lower)
    && !title.startsWith("/")
    && !title.startsWith("~/");
}

function agentTitle(agent, terminal, tab) {
  if (tab?.named && usefulTitle(tab.name, agent.address, agent.program)) return tab.name;
  const parsed = codexDetails(agent);
  if (parsed.task) return parsed.task;
  for (const candidate of [agent.title, terminal?.title, terminal?.name, terminal?.template]) {
    if (usefulTitle(candidate, agent.address, agent.program)) return candidate.trim();
  }
  if (usefulTitle(tab?.name, agent.address, agent.program)) return tab.name;
  return agent.program?.name || agent.app || "Agent";
}

// Adapted from Over9k agent-name.js, MIT © 2026 the Over9k authors.
function codexDetails(agent) {
  return agent.app === "codex" || agent.program?.key === "codex" ? codexTitle(agent.title) : {};
}

function labelEntries(terminal) {
  const labels = terminal?.labels;
  if (!labels || typeof labels !== "object") return [];
  return Object.entries(labels)
    .filter(([key, value]) => key.startsWith("fleet.") && value != null && String(value).trim())
    .slice(0, 3)
    .map(([key, value]) => `${key.slice(6)}: ${String(value)}`);
}

function childTitle(terminal, listedAgent) {
  if (listedAgent) return agentTitle(listedAgent, terminal, null);
  const labels = terminal?.labels ?? {};
  const task = labels["fleet.task"] ?? labels.task ?? labels["herdr.task"];
  if (task && String(task).trim()) return String(task).trim();
  return terminal?.name || terminal?.template || terminal?.program?.name || terminal?.address || "Terminal";
}

function liveChildrenByParent(all) {
  const byParent = new Map();
  for (const terminal of all) {
    if (terminal?.state !== "live" || typeof terminal.parent !== "string") continue;
    const list = byParent.get(terminal.parent) ?? [];
    list.push(terminal);
    byParent.set(terminal.parent, list);
  }
  return byParent;
}

function descendants(byParent, address, path = new Set([address]), depth = 0) {
  if (depth >= MAX_TREE_DEPTH) return [];
  const result = [];
  for (const child of byParent.get(address) ?? []) {
    if (path.has(child.address)) continue;
    const nextPath = new Set(path);
    nextPath.add(child.address);
    result.push({ terminal: child, depth });
    result.push(...descendants(byParent, child.address, nextPath, depth + 1));
  }
  return result;
}

function hasListedAgentAncestor(agent, listed, terminalByAddress) {
  let current = terminalByAddress.get(agent.address);
  const seen = new Set([agent.address]);
  for (let depth = 0; depth < MAX_TREE_DEPTH && current?.parent; depth++) {
    const parent = current.parent;
    if (seen.has(parent)) return false;
    if (listed.has(parent)) return true;
    seen.add(parent);
    current = terminalByAddress.get(parent);
  }
  return false;
}

function openLauncher(space) {
  openOverlay({
    mod: "alex-options",
    kind: "popup",
    width: 340,
    height: 330,
    props: { page: "launcher", space: space?.id, machine: space?.machine ?? null }
  });
}

export default class AlexSidebar extends View {
  init(_props, cx) {
    this.tops = {};
    this.native = {};
    this.folded = new Set();
    if (checking() || props()?.footer) return;
    this.resolveProjects(cx);
    this.resolveCodex(cx);
    cx.timer.every(60000, (cx) => this.resolveProjects(cx));
    cx.timer.every(30000, (cx) => this.resolveCodex(cx));
  }

  resolveCodex(cx) {
    const sidebar = findNode(layout(), "sidebar");
    if (this.readingCodex || !window()?.active || !sidebar || sidebar.hidden || shared(METADATA_KEY) === false) return;
    const localTabs = new Set(spaces().filter((s) => !s.machine).flatMap((s) => s.tabs.map((tab) => tab.id)));
    const local = new Set(panes().filter((p) => localTabs.has(p.tab)).map((p) => p.terminal));
    const termByAddress = new Map(terminals().map((terminal) => [terminal.address, terminal]));
    const addresses = agents().filter((a) => local.has(a.address) && (a.app === "codex" || a.program?.key === "codex")).map((a) => {
      const ids = new Set([codexDetails(a).id, codexTitle(termByAddress.get(a.address)?.title).id].filter(Boolean));
      if (ids.size > 1) return null;
      const titleId = [...ids][0];
      return titleId ? `${a.address}=${titleId}` : a.address;
    }).filter(Boolean);
    if (!addresses.length) { this.native = {}; return; }
    this.readingCodex = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", [`${appHome()}/mods/alex-sidebar/reader.py`, ...addresses], { timeout: 10000 });
        this.native = r.code === 0 ? JSON.parse(r.stdout) : {};
      } catch { this.native = {}; }
      finally { this.readingCodex = false; cx.notify(); }
    });
  }

  resolveProjects(cx) {
    const sidebar = findNode(layout(), "sidebar");
    if (this.resolving || !window()?.active || !sidebar || sidebar.hidden) return;
    const localTabs = new Set(spaces().filter((s) => !s.machine).flatMap((s) => s.tabs.map((tab) => tab.id)));
    const dirs = [...new Set(panes().filter((p) => p.terminal && localTabs.has(p.tab) && p.cwd).map((p) => p.cwd))];
    this.resolving = true;
    cx.spawn(async (cx) => {
      try {
        const next = {}, repoInfo = {};
        for (const dir of dirs) {
          const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "rev-parse", "--show-toplevel"], { cwd: dir, timeout: 3000 }).catch(() => null);
          next[dir] = r?.code === 0 ? r.stdout.trim() : dir;
          const root = r?.code === 0 ? r.stdout.trim() : null;
          if (!root || repoInfo[root]) continue;
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "diff.external=", "-c", "submodule.recurse=false", "-c", "status.submoduleSummary=false", "status", "--porcelain=v2", "--branch", "--untracked-files=normal"], { cwd: root, timeout: 5000 }).catch(() => null);
          if (status?.code !== 0) continue;
          let dirty = 0, ahead = 0, behind = 0, branch = null;
          for (const line of status.stdout.split("\n")) {
            if (line.startsWith("# branch.head ")) branch = line.slice(14);
            else if (line.startsWith("# branch.ab ")) {
              const match = /^# branch\.ab \+(\d+) -(\d+)/.exec(line);
              if (match) { ahead = Number(match[1]); behind = Number(match[2]); }
            } else if (line && !line.startsWith("#")) dirty++;
          }
          const remote = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "remote", "-v"], { cwd: root, timeout: 3000 }).catch(() => null);
          const urls = (remote?.stdout ?? "").split("\n").map((line) => line.trim().split(/\s+/))
            .filter((parts) => parts[2] === "(fetch)").sort((a, b) => Number(b[0] === "origin") - Number(a[0] === "origin"));
          const web = urls.map((parts) => githubUrl(parts[1])).find(Boolean) ?? null;
          repoInfo[root] = { dirty, ahead, behind, web, branch: branch === "(detached)" ? null : branch };
        }
        this.tops = next;
        this.repoInfo = repoInfo;
      } finally { this.resolving = false; cx.notify(); }
    });
  }

  focusTerminal(address) {
    const pane = panes().find((item) => item.terminal === address);
    if (!pane) return run("terminal.peek", { terminal: address });
    const space = spaces().find((s) => s.tabs.some((tab) => tab.id === pane.tab));
    if (!space) return;
    if (!space.active) run("space.select", { id: space.id });
    const tab = space.tabs.find((item) => item.id === pane.tab);
    if (!tab?.active) run("tab.select", { id: pane.tab });
    run("pane.focus", { pane: pane.pane });
  }

  filterRow(t, filter, count, narrow) {
    const option = (id, label, selected, action) => h_flex()
      .id(`filter-${id}`)
      .h(20)
      .px(narrow ? 5 : 9)
      .rounded(islandsRadius(shared("layout") === "alex-islands", 6))
      .items_center()
      .justify_center()
      .text_size(11.5)
      .text_color(selected ? t.foreground : t.muted)
      .when(selected, (el) => el.bg(t.raised))
      .hover((el) => el.bg(t.hover))
      .tooltip(label)
      .on_click(action)
      .child(narrow ? (id === "all" ? "A" : "●") : id === "agents" ? `${label} ${count}` : label);

    return h_flex().h(30).flex_none().px(narrow ? 5 : 8).gap(4).items_center()
      .children([
        option("all", "All", filter === "all", () => setShared(FILTER_KEY, "all")),
        option("agents", "Agents", filter === "agents", () => setShared(FILTER_KEY, "agents"))
      ]);
  }

  machineHeader(t, name, narrow, firstSpace) {
    return h_flex()
      .id(`machine-${name || "local"}`)
      .h(31)
      .flex_none()
      .px(narrow ? 7 : 11)
      .gap(7)
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(!narrow, (el) => el.child(svg(name ? "mods/workspace-chrome/server.svg" : "mods/workspace-chrome/monitor.svg").size(14).flex_none()))
      .when(!narrow, (el) => el.child(div().min_w(0).truncate().child(name || "This computer")))
      .when(!narrow, (el) => el.child(div().size(6).rounded_full().bg(!name || machines().find((m) => m.name === name)?.layout === "ready" ? t.ansi2 : t.dim)))
      .when(!narrow, (el) => el.child(div().flex_1()))
      .when(narrow, (el) => el.child(div().flex_1()))
      .child(div().id(`new-on-${name || "local"}`).size(21).flex_none().rounded(5).flex().items_center().justify_center()
        .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("New shell, Codex or OpenCode session")
        .on_click(() => openLauncher(firstSpace))
        .child(svg("mods/workspace-chrome/plus.svg").size(13)));
  }

  projectRow(t, space, narrow, target = null, key = space.id, git = null, ambiguous = false) {
    const active = space.active;
    return h_flex()
      .id(`space-${key}`)
      .h(30)
      .flex_none()
      .mx(7)
      .px(8)
      .gap(7)
      .rounded(7)
      .items_center()
      .text_size(13)
      .text_color(projectColor(space.name))
      .when(active, (el) => el.bg(t.selected))
      .hover((el) => el.bg(t.hover))
      .tooltip(`${space.where || space.name}${space.branch ? ` · ${space.branch}` : ""}${ambiguous ? " · multiple Herdr spaces; choose a terminal row" : ""}`)
      .on_click(() => { if (!ambiguous) target ? this.focusTerminal(target) : run("space.select", { id: space.id }); })
      .when(narrow, (el) => el.child((space.name || "?").slice(0, 1).toUpperCase()))
      .when(!narrow, (el) => el.child(div().flex_1().truncate().child(space.name)))
      .when(!narrow && Boolean(git?.web), (el) => el.child(div().id(`github-${key}`).size(18).flex_none().rounded(4).flex().items_center().justify_center()
        .text_color(t.muted).hover((s) => s.bg(t.raised).text_color(t.foreground))
        .tooltip(`Open ${git.web} in browser`)
        .on_click((_event, cx) => { cx.stop_propagation(); exec("xdg-open", [git.web]).catch(() => null); })
        .child(svg("mods/alex-sidebar/github.svg").size(13))))
      .when(!narrow && Boolean(space.branch), (el) => el.child(h_flex().gap(3).items_center().flex_none()
        .text_size(9.5).text_color(t.dim)
        .child(svg("mods/workspace-chrome/branch.svg").size(11).flex_none())
        .child(div().max_w(72).truncate().child(space.branch))))
      .when(!narrow && Boolean(git?.dirty), (el) => el.child(div().id(`dirty-${key}`).text_size(11.5).text_color(t.ansi3)
        .tooltip(ambiguous ? "Locally changed entries; choose a space to open Changes" : "Open Changes · locally changed entries")
        .on_click((_event, cx) => { cx.stop_propagation(); if (ambiguous) return; if (!space.active) run("space.select", { id: space.id }); setShared(`alex.panels.${space.id}`, { panel: "changes", open: true }); })
        .child(String(git.dirty))))
      .when(!narrow && Boolean(git?.ahead), (el) => el.child(div().text_size(11.5).text_color(t.ansi2).tooltip("Commits ahead of local tracking ref").child(`↑${git.ahead}`)))
      .when(!narrow && Boolean(git?.behind), (el) => el.child(div().text_size(11.5).text_color(t.ansi1).tooltip("Commits behind local tracking ref").child(`↓${git.behind}`)));
  }

  agentRow(t, agent, terminal, tab, density, metadata, narrow, childCount) {
    const title = agentTitle(agent, terminal, tab);
    const titleInfo = { ...codexDetails({ ...agent, title: terminal?.title }), ...codexDetails(agent) };
    const info = { ...(this.native?.[agent.address] ?? {}), ...titleInfo };
    const observed = titleInfo.context == null && info.observed ? Date.parse(info.observed) : NaN;
    const ageMinutes = Number.isFinite(observed) ? Math.floor((Date.now() - observed) / 60000) : null;
    const freshness = ageMinutes == null ? null : ageMinutes < 0 ? "future timestamp" : ageMinutes < 1 ? "<1m ago" : ageMinutes < 60 ? `${ageMinutes}m ago` : `${Math.floor(ageMinutes / 60)}h ago`;
    const extra = metadata ? [info.model, info.effort === "medium" ? "med" : info.effort, info.context != null ? `${info.context}%` : null, freshness, ...labelEntries(terminal)].filter(Boolean) : [];
    const expanded = density === "expanded" && !narrow && extra.length > 0;
    const isFocused = shared("layout") === "alex-islands" ? focused()?.terminal === agent.address : agent.focused;
    const row = h_flex()
      .id(`agent-${agent.address}`)
      .h(expanded ? 36 : 26)
      .px(narrow ? 7 : 4)
      .gap(8)
      .items_center()
      .text_size(12.5)
      .rounded(islandsRadius(shared("layout") === "alex-islands", 7))
      .when(isFocused && shared("layout") !== "alex-islands", (el) => el.bg(t.raised))
      .when(agent.pinned, (el) => el.border_l(2).border_color(t.accent))
      .hover((el) => el.bg(t.hover))
      .on_hover((on, cx) => { if (on) this.hoverAgent = agent.address; else if (this.hoverAgent === agent.address) this.hoverAgent = null; cx.notify(); })
      .tooltip(`${title}${info.updated ? ` · Codex session updated ${new Date(info.updated * 1000).toLocaleString()}` : ""}${info.observed && titleInfo.context == null ? ` · Context observed ${info.observed}` : ""}`)
      .on_click(() => this.focusTerminal(agent.address))
      .child(h_flex().w(16).flex_none().justify_center().child(mark(normalizedStatus(agent.status), t)))
      .when(Boolean(programIcon(agent.program, 14, t.foreground)), (el) => el.child(programIcon(agent.program, 14, t.foreground)))
      .when(!programIcon(agent.program, 14, t.foreground), (el) => el.child(div().size(14).flex_none().rounded(4).bg(t.raised).flex().items_center().justify_center().text_size(8).text_color(t.accent).child(agent.program?.key === "opencode" ? "O" : "C")))
      .when(!narrow, (el) => el.child(v_flex().flex_1().min_w(0)
        .child(div().truncate().line_height("15px").text_color(agent.status === "idle" ? t.muted : t.foreground).child(title))
        .when(expanded, (v) => v.child(div().truncate().line_height("13px").text_size(11).text_color(t.dim).child(extra.join(" · "))))))
      .when(narrow, (el) => el.tooltip(`${agent.program?.name || "Agent"}: ${title}`))
      .when(childCount > 0 && !narrow, (el) => el.child(div().id(`children-${agent.address}`).px(5).h(20).flex_none().rounded(4).bg(t.raised).flex().items_center().gap(3).text_size(10.5).text_color(t.muted)
        .tooltip(`${this.folded.has(agent.address) ? "Expand" : "Collapse"} ${childCount} children`)
        .on_click((_event, cx) => { cx.stop_propagation(); this.folded.has(agent.address) ? this.folded.delete(agent.address) : this.folded.add(agent.address); cx.notify(); })
        .child(shared("layout") === "alex-islands"
          ? h_flex().items_center().gap(2).child(String(childCount)).child(chevron(!this.folded.has(agent.address), t.muted))
          : `${childCount} ${this.folded.has(agent.address) ? "▸" : "▾"}`)))
      .when(agent.pinned || this.hoverAgent === agent.address, (el) => el.child(div().id(`pin-${agent.address}`).size(19).flex_none().rounded(5).flex().items_center().justify_center()
        .text_color(agent.pinned ? t.accent : t.dim)
        .hover((el) => el.bg(t.hover).text_color(t.foreground))
        .tooltip(agent.pinned ? "Unpin agent" : "Pin agent")
        .on_click((_event, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: agent.address, pinned: !agent.pinned });
        })
        .child(svg(agent.pinned ? "mods/workspace-chrome/pin.svg" : "mods/workspace-chrome/pin-off.svg").size(12))));
    return row;
  }

  nativeRow(t, agent, child, rails, last, narrow) {
    const title = child.name || "Codex subagent";
    const age = child.created && child.created <= Date.now() / 1000 ? Math.floor((Date.now() / 1000 - child.created) / 60) : null;
    return h_flex().id(`native-${child.id}`).relative().h(22).flex_none().pl(10 + (narrow ? 0 : child.depth * 16)).pr(8).gap(3).items_center().rounded(6)
      .text_size(12).text_color(t.muted).tooltip(`Codex ${child.role || "subagent"} · ${child.status} · no separate terminal${child.updated ? ` · model recorded ${new Date(child.updated * 1000).toLocaleString()}` : ""}`)
      .children(rails.map((x) => div().absolute().left(x).top(0).bottom(0).w(1.5).bg(t.input)))
      .child(div().w(12).flex_none())
      .child(v_flex().w(12).h(22).flex_none().items_center()
        .child(div().w(1.5).h(11).bg(t.input))
        .child(div().w(1.5).flex_1().when(!last, (el) => el.bg(t.input))))
      .child(child.role === "command" ? svg("icons/shell.svg").size(13).flex_none() : (programIcon(agent.program, 13, t.muted) || svg("icons/codex.svg").size(13).flex_none()))
      .child(div().flex_1().truncate().child(title))
      .when(Boolean(child.model), (el) => el.child(div().max_w(90).truncate().text_size(10.5).text_color(t.dim).child(child.model)))
      .when(age != null && !narrow, (el) => el.child(div().text_size(10.5).text_color(t.dim).child(age < 1 ? "<1m" : age < 60 ? `${age}m` : `${Math.floor(age / 60)}h`)));
  }

  childRow(t, terminal, listedAgent, depth, rails, last, narrow) {
    const title = childTitle(terminal, listedAgent);
    const status = normalizedStatus(listedAgent?.status ?? terminal.status);
    const indent = narrow ? 0 : depth * 16;
    const row = h_flex().relative()
      .id(`child-${terminal.address}`)
      .h(22)
      .flex_none()
      .pl(10 + indent)
      .pr(8)
      .gap(3)
      .items_center()
      .rounded(islandsRadius(shared("layout") === "alex-islands", 6))
      .text_size(12)
      .text_color(t.muted)
      .hover((el) => el.bg(t.hover))
      .tooltip(title)
      .on_click(() => this.focusTerminal(terminal.address))
      .children(rails.map((x) => div().absolute().left(x).top(0).bottom(0).w(1.5).bg(t.input)))
      .child(h_flex().w(12).flex_none().justify_center().child(mark(status, t)))
      .child(v_flex().w(12).h(22).flex_none().items_center()
        .child(div().w(1.5).h(11).bg(t.input))
        .child(div().w(1.5).flex_1().when(!last, (el) => el.bg(t.input))))
      .when(Boolean(programIcon(terminal.program, 13, t.muted)), (el) => el.child(programIcon(terminal.program, 13, t.muted)))
      .when(!programIcon(terminal.program, 13, t.muted), (el) => el.child(div().size(13).flex_none().rounded(3).bg(t.raised)))
      .child(div().flex_1().truncate().child(title));

    return row;
  }

  terminalRow(t, pane, terminal, tab, narrow) {
    const title = (tab?.named && tab.name) || (usefulTitle(pane.title, pane.terminal, pane.program) && pane.title) || terminal?.name || pane.program?.name || "Terminal";
    return h_flex().id(`terminal-${pane.terminal}`).h(26).flex_none().px(4).gap(8).items_center().rounded(islandsRadius(shared("layout") === "alex-islands", 7))
      .text_size(12.5).text_color(t.muted)
      .when(shared("layout") !== "alex-islands" && pane.focused, (el) => el.bg(t.hover))
      .hover((el) => el.bg(t.hover))
      .tooltip(title)
      .on_click(() => this.focusTerminal(pane.terminal))
      .child(div().w(16).flex_none())
      .child(programIcon(pane.program, 14, t.foreground) || svg("icons/shell.svg").size(14).flex_none().text_color(t.foreground))
      .when(!narrow, (el) => el.child(div().flex_1().min_w(0).truncate().child(title)));
  }

  islandsRail(t) {
    const allSpaces = spaceRail(spaces());
    const allAgents = agents();
    const items = [];
    setAgentOrder(allAgents.map((agent) => agent.address));

    for (const space of allSpaces) {
      const name = space.name || "?";
      const tile = svg("mods/alex-sidebar/workspace-grid.svg").size(14).flex_none().text_color(projectColor(name));
      items.push(h_flex().id(`rail-space-${space.id}`).size(38).flex_none().rounded(8)
        .items_center().justify_center()
        .hover((el) => el.bg(t.hover))
        .tooltip(space.name || space.folder || "Space")
        .on_click(() => run("space.select", { id: space.id }))
        .child(tile));
    }

    return v_flex().id("islands-icon-rail").size_full().min_h(0).bg(t.chrome)
      .items_center().gap(4).py(6).overflow_y_scroll().children(items);
  }

  islandsList(t) {
    const allSpaces = spaces(), allAgents = agents(), allTerminals = terminals();
    const filter = shared(FILTER_KEY) === "agents" ? "agents" : "all";
    const density = shared(DENSITY_KEY) === "compact" ? "compact" : "expanded";
    const metadata = shared(METADATA_KEY) !== false;
    const grouped = groupSpaces(allSpaces, panes(), allAgents, allTerminals, this.tops ?? {}, filter);
    const allGrouped = filter === "all" ? grouped : groupSpaces(allSpaces, panes(), allAgents, allTerminals, this.tops ?? {}, "all");
    const views = [], order = [], machinesShown = new Set();
    const manyMachines = new Set(allSpaces.map((s) => s.machine ?? "")).size > 1;
    for (const { space, dirs } of grouped) {
      const machine = space.machine ?? "";
      if (manyMachines && !machinesShown.has(machine)) {
        machinesShown.add(machine);
        views.push(this.machineHeader(t, machine, false, space));
      }
      const foldKey = `space:${space.id}`;
      const folded = this.folded.has(foldKey);
      const single = dirs.length === 1 ? dirs[0] : null;
      const singleGit = single && !machine ? this.repoInfo?.[single.dir] : null;
      const branch = singleGit?.branch || single?.entries.find((e) => e.pane.branch)?.pane.branch;
      views.push(h_flex().id(`islands-space-${space.id}`).h(32).flex_none().mx(2).px(4).gap(6).items_center().rounded(0)
        .hover((el) => el.bg(t.hover))
        .tooltip(`${space.name || "Space"}${single?.dir ? ` · ${single.dir}` : ""}`)
        .on_click(() => run("space.select", { id: space.id }))
        .child(svg("mods/alex-sidebar/workspace-grid.svg").size(14).flex_none().text_color(projectColor(space.name)))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(projectColor(space.name)).child(space.name || "Space"))
        .when(Boolean(branch), (el) => el.child(div().max_w(65).truncate().text_size(9.5).text_color(t.dim).child(branch)))
        .when(Boolean(singleGit?.web), (el) => el.child(div().id(`space-github-${space.id}`).size(18).flex_none().flex().items_center().justify_center()
          .text_color(t.muted).tooltip(`Open ${singleGit.web} in browser`)
          .on_click((_event, cx) => { cx.stop_propagation(); exec("xdg-open", [singleGit.web]).catch(() => null); })
          .child(svg("mods/alex-sidebar/github.svg").size(13))))
        .when(Boolean(singleGit?.dirty), (el) => el.child(div().text_size(11).text_color(t.ansi3).tooltip("Open Changes · locally changed entries")
          .on_click((_event, cx) => { cx.stop_propagation(); if (!space.active) run("space.select", { id: space.id }); setShared(`alex.islands.needs-me.${space.id}`, { selected: false }); setShared(`alex.panels.${space.id}`, { panel: "changes", open: true }); })
          .child(String(singleGit.dirty))))
        .when(Boolean(singleGit?.ahead), (el) => el.child(div().text_size(10).text_color(t.ansi2).tooltip("Commits ahead of local tracking ref").child(`↑${singleGit.ahead}`)))
        .when(Boolean(singleGit?.behind), (el) => el.child(div().text_size(10).text_color(t.ansi1).tooltip("Commits behind local tracking ref").child(`↓${singleGit.behind}`)))
        .child(div().id(`new-tab-${space.id}`).size(20).flex_none().flex().items_center().justify_center().rounded(5)
          .text_color(t.dim).hover((el) => el.bg(t.raised).text_color(t.foreground))
          .tooltip("New session in this space")
          .on_click((_event, cx) => { cx.stop_propagation(); openLauncher(space); })
          .child(svg("mods/workspace-chrome/plus.svg").size(13)))
        .child(div().id(`fold-${space.id}`).size(22).flex_none().flex().items_center().justify_center()
          .text_color(t.dim).tooltip(folded ? "Expand space" : "Collapse space")
          .on_click((_event, cx) => { cx.stop_propagation(); folded ? this.folded.delete(foldKey) : this.folded.add(foldKey); cx.notify(); })
          .child(chevron(!folded, t.muted))));
      if (folded) continue;
      if (!dirs.length) {
        views.push(div().px(30).py(3).text_size(10.5).text_color(t.dim)
          .child(filter === "agents" ? "No agents" : "No terminal panes"));
      }
      for (const group of dirs) {
        const git = !machine ? this.repoInfo?.[group.dir] : null;
        const dirKey = `dir:${group.key}`;
        const dirFolded = this.folded.has(dirKey);
        const name = group.dir.split("/").filter(Boolean).pop() || space.name || "Directory";
        const groupBranch = git?.branch || group.entries.find((e) => e.pane.branch)?.pane.branch;
        const projectPorts = !machine ? projectPortsFor(shared("alex.ports.snapshot"), group, allGrouped) : [];
        views.push(h_flex().id(`directory-${group.key}`).h(28).flex_none().pl(18).pr(7).gap(6).items_center().rounded(0)
          .hover((el) => el.bg(t.hover)).tooltip(group.dir || name)
          .child(div().id(`fold-dir-${group.key}`).size(20).flex_none().flex().items_center().justify_center()
            .tooltip(dirFolded ? "Expand directory" : "Collapse directory")
            .on_click((_event, cx) => { cx.stop_propagation(); dirFolded ? this.folded.delete(dirKey) : this.folded.add(dirKey); cx.notify(); })
            .child(chevron(!dirFolded, t.muted)))
          .child(svg("mods/alex-sidebar/relevo-folder.svg").size(14).flex_none().text_color(projectColor(group.dir || name)))
          .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(projectColor(group.dir || name)).child(name))
          .when(projectPorts.length > 0, el => el.child(div().flex_none().text_size(10).text_color(t.dim)
            .tooltip("Project-associated TCP listener; terminal ownership and reachability unverified")
            .child(`:${projectPorts[0].port}${projectPorts.length > 1 ? ` +${projectPorts.length - 1}` : ""}`)))
          .when(Boolean(groupBranch && dirs.length > 1), (el) => el.child(div().max_w(65).truncate().text_size(10).text_color(t.dim).child(groupBranch)))
          .when(Boolean(git?.web && dirs.length > 1), (el) => el.child(div().id(`dir-github-${group.key}`).size(18).flex_none().flex().items_center().justify_center()
            .text_color(t.muted).tooltip(`Open ${git.web} in browser`)
            .on_click((_event, cx) => { cx.stop_propagation(); exec("xdg-open", [git.web]).catch(() => null); })
            .child(svg("mods/alex-sidebar/github.svg").size(13))))
          .when(Boolean(git?.dirty && dirs.length > 1), (el) => el.child(div().id(`dir-dirty-${group.key}`).text_size(11).text_color(t.ansi3).tooltip("Open Changes · locally changed entries")
            .on_click((_event, cx) => { cx.stop_propagation(); if (!space.active) run("space.select", { id: space.id }); setShared(`alex.islands.needs-me.${space.id}`, { selected: false }); setShared(`alex.panels.${space.id}`, { panel: "changes", open: true }); })
            .child(String(git.dirty))))
          .when(Boolean(git?.ahead && dirs.length > 1), (el) => el.child(div().text_size(10).text_color(t.ansi2).child(`↑${git.ahead}`)))
          .when(Boolean(git?.behind && dirs.length > 1), (el) => el.child(div().text_size(10).text_color(t.ansi1).child(`↓${git.behind}`))));
        if (dirFolded) continue;
        const children = new Map();
        for (const node of group.nodes) {
          const list = children.get(node.parent) ?? [];
          list.push(node); children.set(node.parent, list);
        }
        const draw = (node, depth, rails, last, path) => {
          if (path.has(node.address)) return;
          const next = new Set(path); next.add(node.address);
          const kids = children.get(node.address) ?? [];
          const native = node.agent && metadata ? (this.native?.[node.address]?.children ?? []) : [];
          const count = (address, seen) => (children.get(address) ?? []).reduce((sum, child) => {
            if (seen.has(child.address)) return sum;
            const visited = new Set(seen); visited.add(child.address);
            return sum + 1 + count(child.address, visited);
          }, 0);
          const childCount = count(node.address, next) + native.length;
          let row;
          if (depth === 0 && node.agent) {
            order.push(node.address);
            row = this.agentRow(t, node.agent, node.terminal, node.entry?.tab, density, metadata, false, childCount);
          } else if (depth === 0 && node.entry) {
            row = this.terminalRow(t, node.entry.pane, node.terminal, node.entry.tab, false);
          } else {
            if (node.agent) order.push(node.address);
            row = this.childRow(t, node.terminal ?? { address: node.address }, node.agent, Math.max(0, depth - 1), rails, last, false);
          }
          if (node.externalParent) row = row.tooltip(`Coordinator: ${node.externalParent} · shown in its own space or directory`);
          const ports = portsFor(shared("alex.ports.snapshot"), node.address);
          if (ports.length) row = row.child(div().flex_none().text_size(10).text_color(t.dim)
            .tooltip("TCP listening; protocol and reachability unverified").child(`:${ports[0].port}${ports.length > 1 ? ` +${ports.length - 1}` : ""}`));
          views.push(div().w_full().flex_none().rounded(0)
            .when(focused()?.terminal === node.address, el => el.bg(t.raised))
            .child(div().w_full().pl(38).child(row)));
          if (this.folded.has(node.address)) return;
          if (depth === 0 && node.agent && native.length) {
            const byParent = new Map();
            for (const child of native) {
              const list = byParent.get(child.parent) ?? [];
              list.push(child); byParent.set(child.parent, list);
            }
            const root = native.find((child) => child.depth === 0)?.parent;
            const drawNative = (parent, nativeRails, seen) => {
              const items = byParent.get(parent) ?? [];
              items.forEach((child, i) => {
                if (seen.has(child.id)) return;
                const isLast = i === items.length - 1 && (child.depth > 0 || kids.length === 0);
                views.push(div().pl(38).child(this.nativeRow(t, node.agent, child, nativeRails, isLast, false)));
                const nextSeen = new Set(seen); nextSeen.add(child.id);
                drawNative(child.id, isLast ? nativeRails : [...nativeRails, 30.25 + child.depth * 16], nextSeen);
              });
            };
            if (root) drawNative(root, [], new Set([root]));
          }
          kids.forEach((child, index) => {
            const isLast = index === kids.length - 1;
            draw(child, depth + 1, isLast ? rails : [...rails, 31 + Math.max(0, depth - 1) * 16 - 0.75], isLast, next);
          });
        };
        for (const node of children.get(null) ?? []) draw(node, 0, [], true, new Set());
      }
    }
    setAgentOrder(order);
    return v_flex().flex_1().min_h(0).overflow_y_scrollbar().gap(1).children(views);
  }

  listContent(t, narrow) {
    if (isIslandsRail()) return this.islandsRail(t);
    if (shared("layout") === "alex-islands") return this.islandsList(t);
    const allSpaces = spaces();
    const allAgents = agents();
    const allTerminals = terminals();
    const allPanes = panes();
    const terminalByAddress = new Map(allTerminals.map((terminal) => [terminal.address, terminal]));
    const byParent = liveChildrenByParent(allTerminals);
    const agentByAddress = new Map(allAgents.map((agent) => [agent.address, agent]));
    const filter = shared(FILTER_KEY) === "agents" ? "agents" : "all";
    const density = shared(DENSITY_KEY) === "compact" ? "compact" : "expanded";
    const metadataSetting = shared(METADATA_KEY);
    const metadata = metadataSetting == null ? true : metadataSetting === true;
    const tabOwners = new Map(allSpaces.flatMap((space) => space.tabs.map((tab) => [tab.id, { space, tab }])));
    const displayOrder = [];
    const entries = [];
    const addresses = new Set();
    for (const pane of allPanes) {
      const owner = tabOwners.get(pane.tab);
      if (!pane.terminal || !owner || addresses.has(pane.terminal)) continue;
      const agent = agentByAddress.get(pane.terminal);
      if (filter === "agents" && !agent) continue;
      addresses.add(pane.terminal);
      entries.push({ pane, agent, ...owner });
    }
    if (!allSpaces.length || (filter === "agents" && !entries.length)) {
      setAgentOrder([]);
      return v_flex().flex_1().min_h(0).justify_center().px(16).text_size(11).text_color(t.dim)
        .child(allSpaces.length === 0 ? "No Herdr spaces yet" : "No agents in these spaces");
    }

    const groups = new Map();
    for (const entry of entries) {
      const { pane, space } = entry;
      const cwd = pane.cwd || space.folder || "";
      const root = (!space.machine && this.tops?.[cwd]) || cwd;
      const dir = root ? root.replace(/\/+$/, "") || "/" : "";
      const machine = space.machine ?? "";
      const key = dir ? JSON.stringify([machine, dir]) : JSON.stringify([machine, "space", space.id]);
      if (!groups.has(key)) groups.set(key, { key, dir, machine, entries: [] });
      groups.get(key).entries.push(entry);
    }
    // A pane that is a real core child belongs under its parent, even if it
    // changed cwd. Move only its displayed row, never the underlying pane.
    const groupOf = new Map([...groups.values()].flatMap((g) => g.entries.map((e) => [e.pane.terminal, g])));
    for (const entry of entries) {
      let current = entry.pane.terminal;
      const path = new Set([current]);
      let top = current, cycle = false;
      for (let depth = 0; depth < MAX_TREE_DEPTH; depth++) {
        const parent = terminalByAddress.get(current)?.parent;
        if (!parent || !groupOf.has(parent)) break;
        if (path.has(parent)) { cycle = true; break; }
        path.add(parent); top = current = parent;
      }
      const from = groupOf.get(entry.pane.terminal), to = groupOf.get(top);
      if (!cycle && from && to && from !== to) {
        from.entries = from.entries.filter((item) => item !== entry);
        to.entries.push(entry);
      }
    }
    for (const [key, group] of groups) if (!group.entries.length) groups.delete(key);
    // Preserve access to spaces with no terminal panes.
    if (filter === "all") for (const space of allSpaces) {
      if (entries.some((entry) => entry.space.id === space.id)) continue;
      const key = JSON.stringify([space.machine ?? "", "space", space.id]);
      groups.set(key, { key, dir: space.folder || "", machine: space.machine ?? "", entries: [], emptySpace: space });
    }
    const priority = (entry) => entry.agent?.app === "codex" || entry.agent?.program?.key === "codex" ? 0 : entry.agent ? 1 : 2;
    const orderedGroups = [...groups.values()].sort((a, b) =>
      (a.machine !== b.machine ? (!a.machine ? -1 : !b.machine ? 1 : a.machine.localeCompare(b.machine)) : 0) ||
      Math.min(3, ...a.entries.map(priority)) - Math.min(3, ...b.entries.map(priority)));
    const views = [];
    const shownMachines = new Set();
    const shownTerminals = new Set();
    const renderChildren = (address, depth, rails, path) => {
      if (depth >= MAX_TREE_DEPTH) return;
      const kids = (byParent.get(address) ?? []).filter((child) => child.address && !path.has(child.address) && !shownTerminals.has(child.address) && (filter === "all" || agentByAddress.has(child.address)));
      kids.forEach((child, index) => {
        if (shownTerminals.has(child.address)) return;
        const last = index === kids.length - 1;
        const listedAgent = agentByAddress.get(child.address);
        shownTerminals.add(child.address);
        if (listedAgent) displayOrder.push(child.address);
        views.push(this.childRow(t, child, listedAgent, depth, rails, last, narrow));
        const next = new Set(path); next.add(child.address);
        renderChildren(child.address, depth + 1, last ? rails : [...rails, 31 + depth * 16 - 0.75], next);
      });
    };
    for (const group of orderedGroups) {
      if (!shownMachines.has(group.machine)) {
        shownMachines.add(group.machine);
        views.push(this.machineHeader(t, group.machine, narrow, allSpaces.find((s) => (s.machine ?? "") === group.machine)));
      }
      const sorted = [...group.entries].sort((a, b) => priority(a) - priority(b));
      const owner = sorted[0]?.space ?? group.emptySpace;
      if (!owner) continue;
      const spaceIds = new Set(sorted.map((entry) => entry.space.id));
      const git = !group.machine ? this.repoInfo?.[group.dir] : null;
      const branch = git?.branch || sorted.find((entry) => entry.pane.branch)?.pane.branch || null;
      const name = group.dir.split("/").filter(Boolean).pop() || owner.name;
      views.push(this.projectRow(t, { ...owner, name, where: group.dir, branch, active: sorted.some((entry) => entry.pane.focused) }, narrow,
        sorted.length === 1 ? sorted[0].pane.terminal : null, group.key, git, spaceIds.size > 1));
      const roots = sorted.filter((entry) => !hasListedAgentAncestor({ address: entry.pane.terminal }, addresses, terminalByAddress));
      for (const entry of [...roots, ...sorted]) {
        const address = entry.pane.terminal;
        if (shownTerminals.has(address)) continue;
        shownTerminals.add(address);
        const terminal = terminalByAddress.get(address);
        if (entry.agent) {
          displayOrder.push(address);
          const nested = descendants(byParent, address);
          const native = metadata ? (this.native?.[address]?.children ?? []) : [];
          views.push(this.agentRow(t, entry.agent, terminal, entry.tab, density, metadata, narrow, new Set(nested.map((item) => item.terminal.address)).size + native.length));
          if (!this.folded.has(address)) {
            const nativeByParent = new Map();
            for (const child of native) {
              const list = nativeByParent.get(child.parent) ?? [];
              list.push(child); nativeByParent.set(child.parent, list);
            }
            const rootId = native.find((child) => child.depth === 0)?.parent;
            const drawNative = (parent, rails, path) => {
              const kids = nativeByParent.get(parent) ?? [];
              kids.forEach((child, i) => {
                if (path.has(child.id)) return;
                const last = i === kids.length - 1 && (child.depth > 0 || nested.length === 0);
                views.push(this.nativeRow(t, entry.agent, child, rails, last, narrow));
                const next = new Set(path); next.add(child.id);
                drawNative(child.id, last ? rails : [...rails, 30.25 + child.depth * 16], next);
              });
            };
            if (rootId) drawNative(rootId, [], new Set([rootId]));
          } else for (const item of nested) shownTerminals.add(item.terminal.address);
        } else views.push(this.terminalRow(t, entry.pane, terminal, entry.tab, narrow));
        if (!this.folded.has(address)) renderChildren(address, 0, [], new Set([address]));
      }
    }
    setAgentOrder(displayOrder);
    return v_flex().flex_1().min_h(0).overflow_y_scrollbar().gap(1).children(views);
  }

  footer(t, narrow) {
    const row = (id, icon, label, action) => h_flex()
      .id(`footer-${id}`)
      .h(28)
      .flex_none()
      .px(narrow ? 0 : 8)
      .gap(9)
      .items_center()
      .justify_center()
      .rounded(7)
      .text_size(13)
      .text_color(t.muted)
      .hover((el) => el.bg(t.hover).text_color(t.foreground))
      .tooltip(label)
      .on_click(action)
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(14).flex_none())
      .when(!narrow, (el) => el.child(div().flex_1().child(label)));

    return v_flex().size_full().bg(t.chrome)
      .when(shared("layout") !== "alex-islands", (el) => el.border_t(1).border_color(t.border))
      .px(narrow ? 5 : 8).pt(4).pb(5).gap(1)
      .when(narrow, (el) => el.items_center())
      .children([
        row("settings", "settings", "Settings", () => run("app.settings")),
        row("options", "layers", "Workspace help & options", () => openOverlay({ mod: "alex-options", kind: "popup", width: 340, height: shared("layout") === "alex-islands" ? 300 : 250, props: { page: "options" } })),
        row("machine", "plus", "Add machine", () => run("mod.open", { name: "machine-add" }))
      ]);
  }

  render() {
    const t = theme();
    const narrow = isNarrow();
    if (props()?.footer) return this.footer(t, narrow);
    const filter = shared(FILTER_KEY) === "agents" ? "agents" : "all";
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(12)
      .when(!isIslandsRail(), (el) => el.child(this.filterRow(t, filter, agents().length, narrow)))
      .child(this.listContent(t, narrow));
  }
}
