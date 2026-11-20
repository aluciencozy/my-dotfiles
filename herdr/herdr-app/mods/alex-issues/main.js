import { View, div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, TextView } from "gpui-base";
import { checking, exec, focused, layout, panes, shared, spaces, theme } from "herdr";

const POLL_MS = 45000;
const LIST_FIELDS = "number,title,state,url,updatedAt,comments,assignees";
const DETAIL_FIELDS = "number,title,body,state,url,createdAt,updatedAt,author,comments";

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
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  const terminal = pane?.terminal ?? f?.terminal ?? null;
  const cwd = pane?.cwd ?? f?.cwd ?? null;
  if (terminal && cwd) {
    const on = terminal.includes("/") ? terminal.split("/")[0] : space?.machine ?? null;
    return { cwd, on, space: space?.id ?? f?.space ?? null, terminal };
  }
  if (last && (!space || last.space === space.id)) return last;
  return { cwd: space?.folder || null, on: space?.machine ?? null, space: space?.id ?? null, terminal: null };
}

const targetKey = (target) => JSON.stringify(target ?? null);
const visible = () => {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  return Boolean(panel && body && !panel.hidden && body.active === "issues" && body.children?.some((c) => c.id === "issues"));
};
const later = (cx, fn) => cx.spawn(async (cx) => { await cx.sleep(0); fn(cx); });
const messageOf = (e) => String(e?.message ?? e ?? "Unknown error").trim();

export default class AlexIssues extends View {
  init(_props, cx) {
    this.target = null;
    this.targetId = null;
    this.token = 0;
    this.detailToken = 0;
    this.repo = null;
    this.state = "OPEN";
    this.query = "";
    this.lists = {};
    this.selected = null;
    this.loading = false;
    this.detailLoading = false;
    this.error = null;
    this.detailError = null;
    this.filter = InputState.new({ placeholder: "Filter issues by number or title" });
    this.filter.on("change", (_e, cx) => { this.query = this.filter.value(); cx.notify(); });

    if (checking()) return;
    cx.timer.every(POLL_MS, (cx) => { if (visible()) this.refresh(cx); });
  }

  syncTarget(cx, schedule = true) {
    const next = currentTarget(this.target);
    const key = targetKey(next);
    const changed = key !== this.targetId;
    if (changed) {
      this.target = next;
      this.targetId = key;
      this.token++;
      this.detailToken++;
      this.repo = null;
      this.lists = {};
      this.selected = null;
      this.error = null;
      this.detailError = null;
      this.loading = false;
      this.detailLoading = false;
      this.again = false;
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
    return token === this.token && key === this.targetId && targetKey(currentTarget(this.target)) === key;
  }

  failText(text) {
    const clean = String(text ?? "").trim();
    return clean || "No error details were returned.";
  }

  async runGh(args, target, current = () => true) {
    if (checking() || !visible() || !current()) return null;
    return exec("gh", args, { cwd: target.cwd, on: target.on, timeout: 30000 });
  }

  refresh(cx) {
    if (checking() || !visible()) return;
    this.syncTarget(cx, false);
    if (this.loading) { this.again = true; return; }
    const target = this.target ?? currentTarget(null);
    if (!target?.cwd) {
      this.repo = null;
      this.error = "No focused project folder is available.";
      cx.notify();
      return;
    }
    const token = this.token, key = this.targetId ?? targetKey(target), state = this.state;
    this.loading = true;
    this.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const repoResult = await this.runGh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], target, () => this.isCurrent(token, key));
        if (!repoResult || checking() || !visible() || !this.isCurrent(token, key)) return;
        if (repoResult.code !== 0) {
          throw new Error(this.failText(repoResult.stderr || repoResult.stdout));
        }
        const repo = repoResult.stdout.trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("The focused folder is not linked to a GitHub repository that gh can read.");
        if (repo !== this.repo) {
          this.repo = repo;
          this.lists = {};
          this.selected = null;
          this.detailToken++;
          this.detailLoading = false;
        }
        const result = await this.runGh([
          "issue", "list", "--repo", repo, "--state", state === "OPEN" ? "open" : "closed",
          "--limit", "100", "--json", LIST_FIELDS,
        ], target, () => this.isCurrent(token, key));
        if (!result || checking() || !visible() || !this.isCurrent(token, key)) return;
        if (result.code !== 0) throw new Error(this.failText(result.stderr || result.stdout));
        const issues = JSON.parse(result.stdout);
        if (!Array.isArray(issues)) throw new Error("GitHub CLI returned an unexpected issue list.");
        this.lists[repo] ??= {};
        this.lists[repo][state] = issues;
        this.error = null;
      } catch (e) {
        if (this.isCurrent(token, key)) {
          this.error = `GitHub CLI read failed: ${messageOf(e)}. Check gh authentication, repository access, and network connectivity.`;
        }
      } finally {
        if (this.isCurrent(token, key)) {
          this.loading = false;
          cx.notify();
          const again = this.again || state !== this.state;
          this.again = false;
          if (again && !checking() && visible()) {
            this.refresh(cx);
          }
        }
      }
    });
  }

  openIssue(issue, cx) {
    if (checking() || !visible()) return;
    this.syncTarget(cx);
    if (!this.repo || !issue?.number || !this.target) return;
    const selected = { repo: this.repo, number: issue.number, data: issue };
    const detailToken = ++this.detailToken;
    this.selected = selected;
    this.detailError = null;
    this.detailLoading = true;
    const token = this.token, key = this.targetId, target = this.target;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        if (checking() || !visible() || !this.isCurrent(token, key) || detailToken !== this.detailToken || this.selected?.number !== selected.number || this.selected?.repo !== selected.repo) return;
        const result = await this.runGh([
          "issue", "view", String(issue.number), "--repo", selected.repo, "--json", DETAIL_FIELDS,
        ], target, () => this.isCurrent(token, key) && detailToken === this.detailToken && this.selected?.number === selected.number && this.selected?.repo === selected.repo);
        if (!result || checking() || !visible() || !this.isCurrent(token, key) || detailToken !== this.detailToken || this.selected?.number !== selected.number || this.selected?.repo !== selected.repo) return;
        if (result.code !== 0) throw new Error(this.failText(result.stderr || result.stdout));
        const detail = JSON.parse(result.stdout);
        if (!detail || Number(detail.number) !== Number(selected.number)) throw new Error("GitHub CLI returned a different issue than requested.");
        this.selected = { ...selected, data: detail };
      } catch (e) {
        if (this.isCurrent(token, key) && detailToken === this.detailToken && this.selected?.number === selected.number && this.selected?.repo === selected.repo && visible()) {
          this.detailError = `Issue details could not be read: ${messageOf(e)}.`;
        }
      } finally {
        if (this.isCurrent(token, key) && detailToken === this.detailToken && this.selected?.number === selected.number && this.selected?.repo === selected.repo) {
          this.detailLoading = false;
          cx.notify();
        }
      }
    });
  }

  openOnGitHub(cx) {
    if (checking() || !visible()) return;
    this.syncTarget(cx);
    const selected = this.selected, target = this.target;
    if (!selected || !target) return;
    const token = this.token, key = this.targetId;
    const detailToken = this.detailToken;
    cx.spawn(async (cx) => {
      try {
        if (checking() || !visible() || !this.isCurrent(token, key) || detailToken !== this.detailToken || this.selected?.number !== selected.number || this.selected?.repo !== selected.repo) return;
        const result = await this.runGh(["issue", "view", String(selected.number), "--repo", selected.repo, "--web"], target, () => this.isCurrent(token, key) && detailToken === this.detailToken && this.selected?.number === selected.number && this.selected?.repo === selected.repo);
        if (!result) return;
        if (result.code !== 0) throw new Error(this.failText(result.stderr || result.stdout));
      } catch (e) {
        if (this.isCurrent(token, key) && detailToken === this.detailToken && this.selected?.number === selected.number && this.selected?.repo === selected.repo && visible()) {
          this.detailError = `Could not open this issue with gh: ${messageOf(e)}.`;
          cx.notify();
        }
      }
    });
  }

  rows() {
    const all = this.lists[this.repo]?.[this.state] ?? [];
    const q = this.query.trim().toLowerCase();
    return all.filter((i) => !q || `#${i.number} ${i.title ?? ""}`.toLowerCase().includes(q));
  }

  back(cx) {
    this.detailToken++;
    this.selected = null;
    this.detailError = null;
    this.detailLoading = false;
    cx.notify();
  }

  renderList(t, cx) {
    const items = this.rows();
    const loaded = Boolean(this.repo && Object.prototype.hasOwnProperty.call(this.lists[this.repo] ?? {}, this.state));
    return v_flex().id("alex-issues-list-view").size_full().min_h(0).rounded(shared("layout") === "alex-islands" ? 0 : 10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Issues"))
        .child(div().flex_1().min_w(0).text_size(11).text_color(t.dim).text_right().truncate().child(this.repo ?? ""))
        .child(h_flex().id("alex-issues-refresh").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
          .border_1().border_color(t.border).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.refresh(cx)).child(this.loading ? "Reading…" : "Refresh")))
      .child(v_flex().flex_none().p(8).gap(7).border_b(1).border_color(t.border)
        .child(h_flex().h(30).items_center().gap(6)
          .child(div().flex_1().min_w(0).h(28).px(8).flex().items_center().rounded(6).border_1().border_color(t.border).bg(t.chrome)
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.filter).h_full().text_size(12).text_color(t.foreground)))
          .child(h_flex().id("issues-open-filter").h(26).px(9).items_center().rounded(6).cursor_pointer()
            .bg(this.state === "OPEN" ? t.selected : t.chrome).text_color(this.state === "OPEN" ? t.foreground : t.muted)
            .on_click((_e, cx) => { this.state = "OPEN"; cx.notify(); this.refresh(cx); }).child("Open"))
          .child(h_flex().id("issues-closed-filter").h(26).px(9).items_center().rounded(6).cursor_pointer()
            .bg(this.state === "CLOSED" ? t.selected : t.chrome).text_color(this.state === "CLOSED" ? t.foreground : t.muted)
            .on_click((_e, cx) => { this.state = "CLOSED"; cx.notify(); this.refresh(cx); }).child("Closed"))))
      .when(Boolean(this.error), (e) => e.child(div().flex_none().px(12).py(8).text_size(12).text_color(t.ansi1).child(this.error)))
      .child(v_flex().id("alex-issues-rows").flex_1().min_h(0).overflow_y_scrollbar().p(6).gap(1)
        .children(items.map((issue) => h_flex().id(`issue-row-${issue.number}`).flex_none().min_h(34).px(9).py(6).gap(9)
          .items_start().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.openIssue(issue, cx))
          .child(div().w(42).flex_none().text_color(issue.state === "CLOSED" ? t.ansi5 : t.dim).child(`#${issue.number}`))
          .child(v_flex().flex_1().min_w(0).gap(3)
            .child(div().text_color(t.foreground).child(issue.title ?? "(untitled issue)"))
            .child(div().text_size(10).text_color(t.dim).child(`${Array.isArray(issue.comments) ? issue.comments.length : issue.comments ?? 0} comments${issue.updatedAt ? ` · updated ${issue.updatedAt.slice(0, 10)}` : ""}`)))))
        .when(items.length >= 100, (e) => e.child(div().flex_none().px(10).py(6).text_size(10).text_color(t.dim).child("Showing the first 100 issues.")))
        .when(!items.length, (e) => e.child(div().px(12).py(24).text_size(12).text_color(this.error ? t.ansi1 : t.dim).text_center()
          .child(this.error ? "No issue data is available." : !this.repo ? "Focus a terminal in a GitHub repository." : this.loading ? "Loading issues…" : loaded ? "No issues match this view." : "Refresh to load this state’s issues."))));
  }

  renderDetail(t, cx) {
    const issue = this.selected.data ?? {};
    const comments = Array.isArray(issue.comments) ? issue.comments : [];
    const textCard = (id, author, stamp, body, emptyText = "") => v_flex().id(id).flex_none().rounded(6).border_1().border_color(t.border).overflow_hidden()
      .child(h_flex().min_h(34).px(11).gap(7).items_center().bg(t.raised).border_b(1).border_color(t.border)
        .child(div().font_semibold().text_size(12).child(author || "unknown author"))
        .child(div().text_size(10).text_color(t.dim).child(stamp ?? "")))
      .child(div().px(12).py(10).text_size(13).child(body?.trim()
        ? TextView.markdown(`${id}-markdown`, body).selectable(true)
        : div().text_color(t.dim).italic().child(emptyText || "No description provided.")));
    return v_flex().id("alex-issue-detail").size_full().min_h(0).rounded(shared("layout") === "alex-islands" ? 0 : 10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(10).gap(7).items_center().border_b(1).border_color(t.border)
        .child(h_flex().id("issue-back").h(26).px(8).items_center().rounded(6).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.back(cx)).child("‹ Back"))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${this.selected.repo} · #${this.selected.number}`))
        .child(h_flex().id("issue-refresh").h(26).px(8).items_center().rounded(6).border_1().border_color(t.border)
          .cursor_pointer().text_size(11).text_color(t.muted).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.openIssue(issue, cx))
          .child(this.detailLoading ? "Reading…" : "Refresh"))
        .child(h_flex().id("issue-open-github").h(26).px(8).items_center().rounded(6).border_1().border_color(t.border)
          .cursor_pointer().text_size(11).text_color(t.muted).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.openOnGitHub(cx)).child("Open on GitHub")))
      .when(Boolean(this.detailError), (e) => e.child(div().flex_none().px(12).py(6).text_size(11).text_color(t.ansi1).child(this.detailError)))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(9)
        .child(v_flex().flex_none().gap(6).px(2).pb(3)
          .child(h_flex().gap(7).items_start().flex_wrap()
            .child(div().flex_1().min_w(0).text_size(19).font_semibold().child(issue.title ?? `Issue #${this.selected.number}`))
            .child(div().px(7).py(2).rounded(10).text_size(10).bg(issue.state === "CLOSED" ? t.raised : t.selected)
              .text_color(issue.state === "CLOSED" ? t.muted : t.accent).child(issue.state === "CLOSED" ? "Closed" : "Open")))
          .child(div().text_size(11).text_color(t.dim).child(`${issue.author?.login ?? "unknown author"} opened ${issue.createdAt?.slice(0, 10) ?? ""}`)))
        .when(this.detailLoading, (e) => e.child(div().flex_none().text_size(11).text_color(t.muted).child("Refreshing issue details…")))
        .child(textCard("issue-body", issue.author?.login, issue.createdAt?.slice(0, 10), issue.body, "No description provided."))
        .children(comments.map((comment, index) => textCard(`issue-comment-${index}`, comment.author?.login, comment.createdAt?.slice(0, 10), comment.body)))
        .when(!comments.length, (e) => e.child(div().flex_none().px(2).py(4).text_size(11).text_color(t.dim).child("No comments."))));
  }

  render(cx) {
    if (checking()) return div().id("alex-issues-check").child("Issues");
    this.syncTarget(cx);
    if (this.selected) return this.renderDetail(theme(), cx);
    const t = theme();
    return this.renderList(t, cx);
  }
}
