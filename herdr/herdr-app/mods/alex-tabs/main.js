import { View, div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import {
  spaces, agents, theme, run, shared, setShared, openOverlay, layout, checking, window
} from "herdr";

const PANELS = [
  { id: "needs-me", label: "Needs me", icon: "file-text", islandsOnly: true },
  { id: "files", label: "Files", icon: "files" },
  { id: "changes", label: "Changes", icon: "git-compare" },
  { id: "issues", label: "Issues", icon: "file-text" },
  { id: "skills", label: "Skills", icon: "layers" }
];

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function panelKey(spaceId) {
  return `alex.panels.${spaceId || "none"}`;
}

function readPanelState(spaceId) {
  if (shared("layout") === "alex-islands") {
    const needs = shared(`alex.islands.needs-me.${spaceId || "none"}`);
    if (needs?.selected === true) return { panel: "needs-me", open: needs.open === true };
  }
  const value = shared(panelKey(spaceId));
  const panel = PANELS.some((item) => !item.islandsOnly && item.id === value?.panel) ? value.panel : "files";
  return { panel, open: value?.open === true };
}

function tabTitle(tab, agent) {
  const generic = (value) => !value
    || value.toLowerCase() === agent?.address?.toLowerCase()
    || value.toLowerCase() === agent?.program?.key?.toLowerCase()
    || value.toLowerCase() === agent?.program?.name?.toLowerCase()
    || /^\d+$/.test(value);
  if (tab.named && tab.name && !generic(tab.name)) return tab.name;
  const title = agent?.title?.trim();
  if (title && !generic(title)) return title;
  if (tab.named && tab.name) return tab.name;
  if (tab.name && !/^\d+$/.test(tab.name)) return tab.name;
  return agent?.program?.name || tab.name || `Tab ${tab.index}`;
}

function programIcon(program) {
  if (!program?.icon) return null;
  return program.tint
    ? svg(program.icon).size(13).flex_none().text_color(program.color || "#aab3c0")
    : image(program.icon).w(13).h(13).flex_none();
}

function statusMark(status, t) {
  if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900);
  if (status === "blocked") return div().size(7).flex_none().rounded_full().bg(t.blocked);
  if (status === "done") return div().size(7).flex_none().rounded_full().bg(t.done);
  if (status === "idle") return div().size(7).flex_none().rounded_full().border(1).border_color(t.idle ?? t.dim);
  return null;
}

function launcher(space) {
  openOverlay({
    mod: "alex-options",
    kind: "popup",
    width: 340,
    height: 330,
    props: { page: "launcher", space: space?.id, machine: space?.machine ?? null }
  });
}

export default class AlexTabs extends View {
  syncPanel(spaceId, state) {
    if (checking()) return;
    const tree = layout();
    const stack = findNode(tree, "panel-body");
    const panel = findNode(tree, "panel");
    if (!stack || !panel || !stack.children?.some((child) => child.id === state.panel)) return;
    if (stack.active !== state.panel) run("layout.select", { stack: "panel-body", child: state.panel });
    if (Boolean(panel.hidden) === state.open) run(state.open ? "layout.show" : "layout.hide", { id: "panel" });
  }

  choosePanel(spaceId, panelId) {
    const current = readPanelState(spaceId);
    const next = current.panel === panelId && current.open
      ? { panel: panelId, open: false }
      : { panel: panelId, open: true };
    if (shared("layout") === "alex-islands") {
      setShared(`alex.islands.needs-me.${spaceId || "none"}`, { selected: panelId === "needs-me", open: next.open });
    }
    if (panelId !== "needs-me") setShared(panelKey(spaceId), next);
    if (!checking()) {
      run("layout.select", { stack: "panel-body", child: panelId });
      run(next.open ? "layout.show" : "layout.hide", { id: "panel" });
    }
  }

  panelButton(item, state, spaceId, t) {
    const selected = state.open && state.panel === item.id;
    const count = item.id === "needs-me" ? agents().filter((agent) => agent.status === "blocked" && agent.space === spaceId).length : 0;
    return h_flex()
      .id(`panel-button-${item.id}`)
      .h(28)
      .flex_none()
      .px(8)
      .gap(6)
      .items_center()
      .rounded(shared("layout") === "alex-islands" ? 0 : 7)
      .text_size(10.5)
      .text_color(selected ? t.foreground : t.muted)
      .when(selected, (el) => el.bg(t.selected))
      .hover((el) => el.bg(t.hover).text_color(t.foreground))
      .tooltip(`${selected ? "Hide" : "Show"} ${item.label}`)
      .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
      .on_click(() => this.choosePanel(spaceId, item.id))
      .child(svg(`mods/workspace-chrome/${item.icon}.svg`).size(13).flex_none())
      .child(count ? `${item.label} ${count}` : item.label);
  }

  render() {
    const t = theme();
    const space = spaces().find((item) => item.active) ?? null;
    const spaceId = space?.id ?? null;
    const state = readPanelState(spaceId);
    this.syncPanel(spaceId, state);

    const allAgents = agents();
    const tabs = space?.tabs ?? [];
    const tabPills = tabs.map((tab) => {
      const agent = allAgents.find((item) => item.tab === tab.id) ?? null;
      const title = tabTitle(tab, agent);
      const icon = programIcon(agent?.program);
      const active = tab.active;
      return h_flex()
        .id(`tab-${tab.id}`)
        .h(29)
        .max_w(205)
        .min_w(64)
        .px(9)
        .gap(6)
        .items_center()
        .flex_none()
        .rounded(shared("layout") === "alex-islands" ? 0 : 8)
        .text_size(11)
        .text_color(active ? t.foreground : t.muted)
        .when(active, (el) => el.bg(t.raised))
        .hover((el) => el.bg(t.hover))
        .tooltip(title)
        .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
        .on_click(() => run("tab.select", { id: tab.id }))
        .when(Boolean(statusMark(tab.status, t)), (el) => el.child(statusMark(tab.status, t)))
        .when(Boolean(icon), (el) => el.child(icon))
        .when(!icon, (el) => el.child(svg("mods/workspace-chrome/terminal.svg").size(13).flex_none().text_color(t.dim)))
        .child(div().flex_1().truncate().child(title));
    });

    return h_flex()
      .id("alex-tab-bar")
      .size_full()
      .px(7)
      .gap(5)
      .items_center()
      .bg(t.chrome)
      .when(shared("layout") !== "alex-islands", (el) => el.border_b(1).border_color(t.border))
      .child(h_flex().flex_1().min_w(0).gap(5).items_center().overflow_x_scroll().children(tabPills)
        .when(tabs.length === 0, (el) => el.child(div().px(7).text_size(11).text_color(t.dim).child("No active space"))))
      .child(h_flex().id("new-session").size(28).flex_none().items_center().justify_center().rounded(shared("layout") === "alex-islands" ? 0 : 7)
        .text_color(t.muted).hover((el) => el.bg(t.hover).text_color(t.foreground))
      .tooltip("New shell, Codex or OpenCode session")
        .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
        .on_click(() => launcher(space))
        .child(svg("mods/workspace-chrome/plus.svg").size(14)))
      .child(div().w(1).h(20).flex_none().bg(t.border))
      .child(h_flex().gap(2).items_center().children(PANELS.filter((item) => !item.islandsOnly || shared("layout") === "alex-islands").map((item) => this.panelButton(item, state, spaceId, t))))
      .when(Boolean(window()?.buttons), (el) => el.child(h_flex().gap(2).items_center().flex_none().children([
        ["window.minimize", "−", "Minimize"],
        ["window.maximize", window()?.maximized ? "▣" : "□", window()?.maximized ? "Restore" : "Maximize"],
        ["window.close", "×", "Close window"]
      ].map(([command, glyph, label]) => h_flex()
        .id(`window-${command}`)
        .size(25)
        .flex_none()
        .items_center()
        .justify_center()
        .rounded(shared("layout") === "alex-islands" ? 0 : 6)
        .text_size(14)
        .text_color(command === "window.close" ? t.muted : t.dim)
        .hover((button) => button.bg(command === "window.close" ? t.blocked : t.hover).text_color(t.foreground))
        .tooltip(label)
        .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
        .on_click(() => run(command))
        .child(glyph)))));
  }
}
