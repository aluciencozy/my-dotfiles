import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  knownAgents, spaces, theme, run, shared, setShared, props, closeOverlay, openOverlay, checking
} from "herdr";

const ALLOWED = new Set(["codex", "opencode"]);
const DENSITY_KEY = "alex.sidebar.density";
const METADATA_KEY = "alex.sidebar.metadata";
const ORDER = ["shell", "codex", "opencode"];

function programIcon(program, size, t) {
  if (program?.icon) {
    return program.tint
      ? svg(program.icon).size(size).flex_none().text_color(t.foreground)
      : image(program.icon).w(size).h(size).flex_none();
  }
  const label = program?.key === "opencode" ? "O" : program?.key === "codex" ? "C" : "›";
  return div().size(size).flex_none().rounded(4).bg(t.raised).flex().items_center().justify_center()
    .text_size(10).font_semibold().text_color(t.accent).child(label);
}

export default class AlexOptions extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.page = p.page === "launcher" ? "launcher" : "options";
    const active = spaces().find((space) => space.active) ?? null;
    this.spaceId = typeof p.space === "string" ? p.space : active?.id;
    this.machine = Object.prototype.hasOwnProperty.call(p, "machine") ? p.machine : active?.machine ?? null;
    this.remote = Boolean(this.machine);
    this.choices = [];
    this.loading = false;
    this.failed = false;

    if (this.page === "launcher" && !checking() && !this.remote) {
      this.loading = true;
      cx.spawn(async (cx) => {
        try {
          const available = await knownAgents();
          this.choices = available
            .filter((agent) => ALLOWED.has(agent.key))
            .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
        } catch {
          this.failed = true;
        }
        this.loading = false;
        cx.notify();
      });
    }
  }

  dismiss() {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  launch(choice) {
    const target = spaces().find((space) => space.id === this.spaceId);
    if (this.remote || !target || target.machine || !choice?.installed) return;
    if (choice.key !== "shell" && (!ALLOWED.has(choice.key) || !Array.isArray(choice.run) || choice.run.length === 0)) return;
    const args = { space: target.id };
    if (choice.key !== "shell") { args.name = choice.name; args.argv = choice.run; }
    this.dismiss();
    run("tab.new", args);
  }

  actionRow(id, title, detail, icon, action, t, selected = false) {
    return h_flex()
      .id(id)
      .h(34)
      .flex_none()
      .px(8)
      .gap(9)
      .items_center()
      .rounded(7)
      .text_size(11.5)
      .text_color(t.foreground)
      .when(selected, (el) => el.bg(t.selected))
      .hover((el) => el.bg(t.hover))
      .on_click(action)
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(14).flex_none())
      .child(div().flex_1().truncate().child(title))
      .child(div().text_size(10).text_color(t.dim).child(detail));
  }

  choiceRow(choice, t) {
    const installed = choice.installed === true;
    return h_flex()
      .id(`launch-${choice.key}`)
      .h(35)
      .flex_none()
      .px(8)
      .gap(9)
      .items_center()
      .rounded(7)
      .text_size(11.5)
      .text_color(installed ? t.foreground : t.dim)
      .when(installed, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => this.launch(choice))
      .child(programIcon(choice, 15, t))
      .child(div().flex_1().truncate().child(choice.name))
      .child(div().text_size(10).text_color(installed ? t.dim : t.dim).child(installed ? "Start" : "Not installed"));
  }

  launcherPage(t) {
    const space = spaces().find((item) => item.id === this.spaceId) ?? null;
    const location = space
      ? `${space.name}${space.machine ? ` · ${space.machine}` : ""}`
      : (this.machine || "This computer");
    return v_flex().size_full().min_h(0).bg(t.popover).p(10).gap(6).text_size(12)
      .child(h_flex().h(27).flex_none().items_center().gap(8)
        .child(div().flex_1().font_semibold().text_color(t.foreground).child("New session"))
        .child(div().size(22).flex_none().rounded(5).flex().items_center().justify_center().text_color(t.dim)
          .id("close-launcher").hover((el) => el.bg(t.hover).text_color(t.foreground)).on_click(() => this.dismiss())
          .child(svg("mods/workspace-chrome/x.svg").size(13))))
      .child(div().px(2).pb(3).text_size(10.5).text_color(t.dim).truncate().child(`Target: ${location}`))
      .child(v_flex().flex_1().min_h(0).gap(2)
        .when(!this.remote && Boolean(space), (el) => el.child(this.choiceRow({ key: "shell", name: "Terminal", installed: true }, t)))
        .children(this.choices.map((choice) => this.choiceRow(choice, t)))
        .when(!space, (el) => el.child(div().px(8).py(8).text_color(t.dim).child("Select an existing space first.")))
        .when(this.remote, (el) => el.child(div().px(8).py(8).text_color(t.dim).child("Remote launch is omitted here to avoid remote checks.")))
        .when(this.loading, (el) => el.child(div().px(8).py(8).text_color(t.dim).child("Checking installed shell, Codex and OpenCode entries…")))
        .when(this.failed, (el) => el.child(div().px(8).py(8).text_color(t.blocked).child("Herdr could not check installed launchers.")))
        .when(!this.remote && !this.loading && !this.failed && this.choices.length === 0, (el) => el.child(div().px(8).py(8).text_color(t.dim).child("No supported launcher entries are configured."))))
      .child(div().h(1).flex_none().bg(t.border))
      .child(div().px(2).pt(2).text_size(9.5).text_color(t.dim).child("No agent starts until you choose an installed entry."));
  }

  optionsPage(t) {
    const density = shared(DENSITY_KEY) === "compact" ? "compact" : "expanded";
    const rawMetadata = shared(METADATA_KEY);
    const metadata = rawMetadata == null ? true : rawMetadata === true;
    const densityRow = h_flex().h(34).flex_none().px(8).gap(8).items_center().rounded(7)
      .text_size(11.5).text_color(t.foreground)
      .child(div().flex_1().child("Sidebar rows"))
      .children(["compact", "expanded"].map((choice) => h_flex()
        .id(`density-${choice}`).h(24).px(8).items_center().rounded(6).text_size(10)
        .text_color(density === choice ? t.foreground : t.muted)
        .when(density === choice, (el) => el.bg(t.raised))
        .hover((el) => el.bg(t.hover))
        .on_click(() => setShared(DENSITY_KEY, choice))
        .child(choice === "compact" ? "Compact" : "Expanded")));
    const metadataRow = h_flex().h(34).flex_none().px(8).gap(8).items_center().rounded(7)
      .text_size(11.5).text_color(t.foreground)
      .child(div().flex_1().truncate().child("Codex metadata and child detail"))
      .child(h_flex().id("metadata-toggle").h(23).px(8).items_center().rounded(6).text_size(10)
        .text_color(metadata ? t.accent : t.dim).bg(metadata ? t.selected : t.raised)
        .hover((el) => el.bg(t.hover))
        .on_click(() => setShared(METADATA_KEY, !metadata))
        .child(metadata ? "On" : "Off"));

    return v_flex().size_full().min_h(0).overflow_y_scroll().bg(t.popover).p(10).gap(7).text_size(12)
      .child(h_flex().h(27).flex_none().items_center().gap(8)
        .child(div().flex_1().font_semibold().text_color(t.foreground).child("Workspace options"))
        .child(div().size(22).flex_none().rounded(5).flex().items_center().justify_center().text_color(t.dim)
          .id("close-options").hover((el) => el.bg(t.hover).text_color(t.foreground)).on_click(() => this.dismiss())
          .child(svg("mods/workspace-chrome/x.svg").size(13))))
      .child(div().px(2).text_size(10).text_color(t.dim).child("A compact, local view of Herdr's live workspace."))
      .child(densityRow)
      .child(metadataRow)
      .child(div().px(2).text_size(9.5).text_color(t.dim)
        .child("Codex session metadata is read locally only when its terminal can be identified; ambiguous sessions are omitted."))
      .child(div().h(1).mt(1).flex_none().bg(t.border))
      .child(this.actionRow("open-codex-accounts", "Codex accounts…", "", "settings", () => {
        this.dismiss();
        openOverlay({ mod: "alex-accounts", kind: "dialog", frame: "none", width: 460, height: 520 });
      }, t))
      .when(shared("layout") === "alex-islands", (el) => el.child(this.actionRow("open-islands-appearance", "Islands appearance…", "", "layers", () => {
        this.dismiss();
        openOverlay({ mod: "alex-appearance", props: { role: "settings" }, kind: "dialog", width: 520, height: 430 });
      }, t)))
      .child(this.actionRow("open-settings", "Open Herdr settings", "", "settings", () => {
        this.dismiss();
        run("app.settings");
      }, t));
  }

  render() {
    const t = theme();
    const page = props()?.page === "launcher" ? "launcher" : "options";
    return page === "launcher" ? this.launcherPage(t) : this.optionsPage(t);
  }
}
