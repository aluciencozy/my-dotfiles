import { View, div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, TextView } from "gpui-base";
import { agents, appHome, checking, exec, focused, layout, panes, readTextFile, shared, spaces, theme } from "herdr";

const POLL_MS = 60000;
const PREVIEW_NOTICE = "Preview is limited to the first 64 KiB of SKILL.md.";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function currentTarget(last) {
  const f = focused();
  const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  const pane = panes().find((p) => (f?.pane && p.pane === f.pane) || (f?.terminal && p.terminal === f.terminal)) ?? null;
  const terminal = pane?.terminal ?? f?.terminal ?? null;
  const agent = terminal ? agents().find((a) => a.address === terminal) : null;
  const cwd = pane?.cwd ?? f?.cwd ?? null;
  if (terminal && cwd) {
    const on = terminal.includes("/") ? terminal.split("/")[0] : space?.machine ?? null;
    return {
      cwd, on, space: space?.id ?? f?.space ?? null, terminal,
      programKey: String(pane?.program?.key ?? agent?.program?.key ?? "").toLowerCase(),
      programName: pane?.program?.name ?? agent?.program?.name ?? agent?.app ?? "Focused terminal",
    };
  }
  if (last && (!space || last.space === space.id)) return last;
  return {
    cwd: space?.folder || null, on: space?.machine ?? null, space: space?.id ?? null,
    terminal: null, programKey: "", programName: "No focused agent session",
  };
}

const keyOf = (target) => JSON.stringify(target ?? null);
const visible = () => {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  return Boolean(panel && body && !panel.hidden && body.active === "skills" && body.children?.some((c) => c.id === "skills"));
};
const later = (cx, fn) => cx.spawn(async (cx) => { await cx.sleep(0); fn(cx); });
const messageOf = (e) => String(e?.message ?? e ?? "Unknown error").trim();
const codexTarget = (target) => target?.programKey === "codex" || /\bcodex\b/i.test(target?.programName ?? "");
const scopeLabel = (scope) => scope === "user" ? "USER" : scope === "admin" ? "ADMIN" : "PROJECT";

export default class AlexSkills extends View {
  init(_props, cx) {
    this.target = null;
    this.targetId = null;
    this.token = 0;
    this.previewToken = 0;
    this.skills = [];
    this.warnings = [];
    this.selected = null;
    this.loading = false;
    this.previewLoading = false;
    this.error = null;
    this.previewError = null;
    this.query = "";
    this.filter = InputState.new({ placeholder: "Search discovered skills" });
    this.filter.on("change", (_e, cx) => { this.query = this.filter.value(); cx.notify(); });

    if (checking()) return;
    cx.timer.every(POLL_MS, (cx) => { if (visible()) this.refresh(cx); });
  }

  syncTarget(cx, schedule = true) {
    const next = currentTarget(this.target);
    const key = keyOf(next), changed = key !== this.targetId;
    if (changed) {
      this.target = next;
      this.targetId = key;
      this.token++;
      this.previewToken++;
      this.skills = [];
      this.warnings = [];
      this.selected = null;
      this.loading = false;
      this.previewLoading = false;
      this.again = false;
      this.error = null;
      this.previewError = null;
    }
    const shown = visible();
    if (schedule && !checking() && shown && (changed || !this.wasVisible)) {
      const scheduledKey = key;
      later(cx, (cx) => {
        if (visible() && this.targetId === scheduledKey && !this.loading) this.refresh(cx);
      });
    }
    this.wasVisible = shown;
  }

  isCurrent(token, key) {
    return token === this.token && key === this.targetId && keyOf(currentTarget(this.target)) === key;
  }

  async callHelper(action, target, identity = null, current = () => true) {
    if (checking() || !visible() || !current()) return null;
    const source = await readTextFile(`${appHome()}/mods/alex-skills/discover.py`);
    if (!source) throw new Error("The read-only skills discovery helper is missing from mods/alex-skills.");
    if (checking() || !visible() || !current()) return null;
    const args = ["-c", source, action, target.cwd];
    if (identity) args.push(identity);
    const result = await exec("python3", args, { cwd: target.cwd, on: target.on, timeout: 30000 });
    let payload;
    try { payload = JSON.parse(result.stdout); }
    catch { throw new Error((result.stderr || result.stdout || "Python returned no valid inventory data.").trim()); }
    if (result.code !== 0 || payload?.error) throw new Error(payload?.error ?? result.stderr ?? `Python exited with ${result.code}.`);
    return payload;
  }

  refresh(cx) {
    if (checking() || !visible()) return;
    this.syncTarget(cx, false);
    if (this.loading) { this.again = true; return; }
    const target = this.target;
    if (!codexTarget(target)) {
      this.skills = [];
      this.error = target?.terminal
        ? "This first pass discovers Codex skills only. Open Skills while a Codex terminal is focused."
        : "Focus a Codex terminal to see skills found in its documented locations.";
      this.loading = false;
      cx.notify();
      return;
    }
    if (!target.cwd) {
      this.error = "The focused Codex terminal has no working directory.";
      cx.notify();
      return;
    }
    const token = this.token, key = this.targetId;
    this.loading = true;
    this.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const result = await this.callHelper("list", target, null, () => this.isCurrent(token, key));
        if (!result || checking() || !visible() || !this.isCurrent(token, key)) return;
        if (!Array.isArray(result.skills)) throw new Error("The discovery helper returned an invalid skill inventory.");
        this.skills = result.skills;
        this.warnings = Array.isArray(result.warnings) ? result.warnings : [];
        if (this.selected && !this.skills.some((skill) => skill.id === this.selected.id)) {
          this.selected = null;
          this.previewToken++;
          this.previewLoading = false;
        }
        this.error = null;
      } catch (e) {
        if (this.isCurrent(token, key) && visible()) this.error = `Skills could not be read: ${messageOf(e)}.`;
      } finally {
        if (this.isCurrent(token, key)) {
          this.loading = false;
          cx.notify();
          const again = this.again;
          this.again = false;
          if (again && !checking() && visible()) this.refresh(cx);
        }
      }
    });
  }

  openSkill(skill, cx) {
    if (checking() || !visible()) return;
    this.syncTarget(cx);
    const target = this.target;
    if (!target || !codexTarget(target) || !this.skills.some((item) => item.id === skill?.id)) return;
    const token = this.token, key = this.targetId;
    const previewToken = ++this.previewToken;
    this.selected = { ...skill, preview: "" };
    this.previewError = null;
    this.previewLoading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        if (checking() || !visible()) return;
        const result = await this.callHelper("read", target, skill.id, () => this.isCurrent(token, key) && previewToken === this.previewToken && this.selected?.id === skill.id);
        if (!result || checking() || !visible() || !this.isCurrent(token, key) || previewToken !== this.previewToken || this.selected?.id !== skill.id) return;
        if (!result.skill || result.skill.id !== skill.id) throw new Error("The selected skill could not be confirmed in this scope.");
        this.selected = result.skill;
      } catch (e) {
        if (this.isCurrent(token, key) && previewToken === this.previewToken && this.selected?.id === skill.id && visible()) this.previewError = messageOf(e);
      } finally {
        if (this.isCurrent(token, key) && previewToken === this.previewToken && this.selected?.id === skill.id) {
          this.previewLoading = false;
          cx.notify();
        }
      }
    });
  }

  shownSkills() {
    const query = this.query.trim().toLowerCase();
    return this.skills.filter((skill) => !query || `${skill.name} ${skill.description} ${skill.source}`.toLowerCase().includes(query));
  }

  back(cx) {
    this.previewToken++;
    this.selected = null;
    this.previewError = null;
    this.previewLoading = false;
    cx.notify();
  }

  header(t) {
    const target = this.target;
    const project = target?.cwd?.split(/[\\/]/).filter(Boolean).pop() || target?.cwd || "No project";
    const who = target?.terminal ? `${target.programName} · ${target.terminal}` : target?.programName ?? "No focused agent session";
    return v_flex().flex_none().border_b(1).border_color(t.border)
      .child(h_flex().h(42).px(13).gap(8).items_center()
        .child(div().font_semibold().child("Skills"))
        .child(div().flex_1().min_w(0).truncate().text_size(10).text_right().text_color(t.dim).child(project))
        .child(h_flex().id("skills-refresh").h(26).px(8).items_center().rounded(6).border_1().border_color(t.border)
          .cursor_pointer().text_size(11).text_color(t.muted).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.refresh(cx))
          .child(this.loading ? "Reading…" : "Refresh")))
      .child(v_flex().px(13).pb(8).gap(2)
        .child(div().text_size(11).font_semibold().text_color(t.foreground).child("Codex skills found — session activity not tracked"))
        .child(div().truncate().text_size(10).text_color(t.dim).child(who)));
  }

  renderList(t, cx) {
    const skills = this.shownSkills();
    return v_flex().id("alex-skills-list").size_full().min_h(0).rounded(shared("layout") === "alex-islands" ? 0 : 10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(this.header(t))
      .child(h_flex().flex_none().px(9).py(8).border_b(1).border_color(t.border)
        .child(h_flex().flex_1().min_w(0).h(28).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border).bg(t.chrome)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(Input.new(this.filter).h_full().text_size(12).text_color(t.foreground))))
      .when(Boolean(this.error), (e) => e.child(div().flex_none().px(12).py(8).text_size(11).text_color(t.ansi1).child(this.error)))
      .children(this.warnings.map((warning, index) => div().id(`skills-warning-${index}`).flex_none().px(12).py(4).text_size(10).text_color(t.ansi3).child(warning)))
      .child(v_flex().id("alex-skills-rows").flex_1().min_h(0).overflow_y_scrollbar().p(6).gap(2)
        .children(skills.map((skill) => v_flex().id(`skill-${skill.id}`).flex_none().px(10).py(8).gap(4).rounded(7)
          .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.openSkill(skill, cx))
          .child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().font_semibold().child(skill.name))
            .child(div().flex_none().text_size(9).text_color(t.dim).child(scopeLabel(skill.scope))))
          .child(div().text_size(11).text_color(t.muted).child(skill.description || "No description in SKILL.md frontmatter."))
          .child(div().text_size(10).text_color(t.dim).child(skill.source))))
        .when(!skills.length, (e) => e.child(div().px(12).py(24).text_size(11).text_color(this.error ? t.ansi1 : t.dim).text_center()
          .child(this.loading ? "Reading Codex skill locations…" : this.query ? "No skills match this search." : this.error ? "No inventory is available." : "No Codex skills found in the documented locations."))));
  }

  renderPreview(t, cx) {
    const skill = this.selected;
    return v_flex().id("alex-skills-preview").size_full().min_h(0).rounded(shared("layout") === "alex-islands" ? 0 : 10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
        .child(h_flex().id("skills-back").h(26).px(8).items_center().rounded(6).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.back(cx)).child("‹ Back"))
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(skill.name))
         .child(div().flex_none().text_size(9).text_color(t.dim).child(scopeLabel(skill.scope))))
      .child(div().flex_none().px(13).py(8).border_b(1).border_color(t.border)
        .child(div().text_size(11).text_color(t.muted).child(skill.description || "No description in SKILL.md frontmatter."))
        .child(div().pt(4).text_size(10).text_color(t.dim).child(skill.source)))
      .when(Boolean(this.previewError), (e) => e.child(div().flex_none().px(12).py(7).text_size(11).text_color(t.ansi1).child(this.previewError)))
      .child(div().id("skill-markdown").flex_1().min_h(0).overflow_y_scrollbar().p(12)
        .child(this.previewLoading ? div().text_size(11).text_color(t.muted).child("Reading SKILL.md…")
          : TextView.markdown("skill-preview-markdown", skill.preview ?? "").selectable(true)))
      .when(Boolean(skill.truncated), (e) => e.child(div().flex_none().px(12).py(5).border_t(1).border_color(t.border).text_size(10).text_color(t.dim).child(PREVIEW_NOTICE)));
  }

  render(cx) {
    if (checking()) return div().id("alex-skills-check").child("Skills");
    this.syncTarget(cx);
    const t = theme();
    return this.selected ? this.renderPreview(t, cx) : this.renderList(t, cx);
  }
}
