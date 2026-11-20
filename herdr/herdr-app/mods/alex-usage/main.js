import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { checking, layout, openOverlay, run, shared, theme, window } from "herdr";
import {
  acquireRefreshLease, readAccounts, refreshAccounts, releaseRefreshLease
} from "./accounts-bridge.js";
import {
  errorLabel, normalizeAccountsPayload, panelHeight, railSummary,
  statusHasIssue, statusLabel, windowTitle
} from "./account-model.js";
import { chevron, islandsRadius } from "./islands-ui.js";
import { readCached, refreshDue } from "./cache-lifecycle.js";

function usageBlocks(root, visible = true, found = []) {
  if (!root || typeof root !== "object") return found;
  const shown = visible && !root.hidden;
  if (root.type === "block" && root.content?.mod === "alex-usage") found.push({ node: root, visible: shown });
  for (const child of root.children ?? []) {
    usageBlocks(child, shown && (root.type !== "stack" || child.id === root.active), found);
  }
  return found;
}

function visibleUsageBlock() {
  return usageBlocks(layout()).find((entry) => entry.visible) ?? null;
}

function islandsRail() {
  const find = (node, id) => {
    if (node?.id === id) return node;
    for (const child of node?.children ?? []) {
      const found = find(child, id);
      if (found) return found;
    }
    return null;
  };
  return shared("layout") === "alex-islands" && (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
}

function pollAllowed() {
  if (checking() || !window().active) return false;
  return Boolean(visibleUsageBlock());
}

function usageColor(t, percent) {
  return percent == null ? t.dim : percent >= 80 ? t.ansi1 : percent >= 50 ? t.ansi3 : t.ansi2;
}

function age(seconds) {
  return seconds < 60 ? "<1m" : seconds < 3600
    ? `${Math.floor(seconds / 60)}m` : seconds < 86400
      ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d`;
}

function resetText(window, now) {
  if (window.resetsAt == null) return "reset unknown";
  if (window.resetsAt <= now) return "reset passed";
  return `reset in ${age(window.resetsAt - now)}`;
}

function formatAge(timestamp, now) {
  if (timestamp == null) return "not observed";
  const delta = now - timestamp;
  return delta < 0 ? "clock differs" : `${age(delta)} ago`;
}

export default class Usage extends View {
  init(_props, cx) {
    this.accounts = [];
    this.status = "loading";
    this.loadError = false;
    this.open = false;
    this.expanded = new Set();
    this.refreshOwner = `usage:${Date.now()}`;
    this.nextRefresh = Date.now() + 120000;
    if (checking()) return;

    cx.spawn(async (cx) => {
      for (;;) {
        const listed = await readCached(readAccounts, normalizeAccountsPayload);
        if (listed.ok) {
          this.accounts = listed.accounts;
          this.status = "ready";
          this.loadError = false;
        } else {
          // Keep any previous rows, but do not present a failed read as loading.
          this.status = "error";
          this.loadError = true;
        }
        try { this.fit(); } catch { /* layout can be unavailable during startup */ }
        cx.notify();
        await cx.sleep(5000);
      }
    });
    cx.spawn(async (cx) => {
      for (;;) {
        await cx.sleep(5000);
        let active = false;
        try { active = this.canPoll(); } catch { /* retry when layout is ready */ }
        if (refreshDue(Date.now(), this.nextRefresh, active,
          this.accounts.some((account) => account.status !== "missing_login"))) {
          this.nextRefresh = Date.now() + 120000;
          try { await this.refreshProfiles(cx); } catch { /* cache reader reports failures */ }
        }
      }
    });
  }

  canPoll() {
    return !checking() && pollAllowed();
  }

  async refreshProfiles(cx) {
    // An empty inventory is a read-only state; never call refresh without a profile.
    const refreshable = this.accounts.filter((account) => account.status !== "missing_login");
    if (refreshable.length === 0 || !this.canPoll()) return;
    const leaseTtl = Math.min(600000, 90000 * refreshable.length);
    if (!acquireRefreshLease(this.refreshOwner, leaseTtl)) return;
    try {
      for (const account of refreshable) {
        if (!this.canPoll() || !acquireRefreshLease(this.refreshOwner, 90000)) break;
        try {
          const result = normalizeAccountsPayload(await refreshAccounts(account.id));
          if (!result.ok) throw new Error("invalid_payload");
          const updated = result.accounts.find((row) => row.id === account.id);
          if (updated) this.replaceAccount(updated);
          else this.replaceAccount({
            ...account,
            status: "unknown",
            observedAt: null,
            windows: []
          });
        } catch (error) {
          // The cache-only loop will report authoritative backend state.
        }
        this.fit();
        cx.notify();
      }
    } finally {
      releaseRefreshLease(this.refreshOwner);
    }
  }

  replaceAccount(account) {
    this.accounts = this.accounts.map((current) => current.id === account.id ? account : current);
  }

  fit() {
    if (checking()) return;
    const blockHeight = panelHeight(this.open, this.accounts, this.expanded);
    for (const block of usageBlocks(layout())) {
      if (block.visible && block.node.id && block.node.size?.px !== blockHeight) {
        run("layout.resize", { id: block.node.id, px: blockHeight });
      }
    }
  }

  openManager() {
    openOverlay({ mod: "alex-accounts", kind: "dialog", frame: "none", width: 460, height: 520 });
  }

  toggleOpen(cx) {
    this.open = !this.open;
    this.fit();
    cx.notify();
  }

  toggleExpanded(id, cx) {
    const next = new Set(this.expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expanded = next;
    this.fit();
    cx.notify();
  }

  button(id, label, action, t, islands) {
    return h_flex().id(id).h(24).flex_none().px(6).items_center().justify_center()
      .rounded(islandsRadius(islands, 4)).bg(t.raised).text_size(9.5).text_color(t.foreground).cursor_pointer()
      .hover((el) => el.bg(t.hover)).on_click((_event, cx) => {
        cx.stop_propagation();
        action();
      }).child(label);
  }

  usageWindow(window, t, now) {
    const color = usageColor(t, window.usedPercent);
    return v_flex().id(`usage-window-${window.key}`).w_full().h(26).flex_none()
      .child(h_flex().w_full().h(16).items_center().gap(5).text_size(9.5)
        .child(div().w(58).flex_none().text_color(t.muted).child(windowTitle(window)))
        .child(div().flex_1().text_color(t.dim).child(resetText(window, now)))
        .child(div().text_color(color).child(window.usedPercent == null ? "—" : `${Math.round(window.usedPercent)}%`)))
      .when(window.usedPercent != null, (el) => el.child(div().w_full().h(3).rounded(2).bg(t.raised)
        .child(div().h(3).rounded(2).bg(color)
          .w(`${Math.max(0, Math.min(100, window.usedPercent))}%`))));
  }

  accountRow(account, index, t, now, islands) {
    const expanded = this.expanded.has(account.id);
    const issue = statusHasIssue(account);
    const statusColor = account.status === "ok" ? t.done : account.status === "stale" ? t.ansi3 : t.blocked;
    const latest = account.status !== "ok" || account.errorCode
      ? `Last reported ${formatAge(account.observedAt, now)}`
      : `Observed ${formatAge(account.observedAt, now)}`;
    return v_flex().id(`codex-account-${index}`).w_full().flex_none()
      .child(h_flex().id(`codex-account-toggle-${index}`).w_full().h(32).flex_none().items_center().gap(6)
        .cursor_pointer().px(2).rounded(islandsRadius(islands, 4))
        .hover((el) => el.bg(t.hover)).on_click((_event, cx) => this.toggleExpanded(account.id, cx))
        .child(div().flex_1().truncate().text_color(t.foreground).child(account.alias))
        .child(div().text_size(9.5).text_color(statusColor).child(statusLabel(account)))
        .child(account.plan
          ? div().px(4).rounded(islandsRadius(islands, 3)).bg(t.raised).text_size(9).text_color(t.accent).child(account.plan)
          : div())
        .child(chevron(expanded, issue ? statusColor : t.muted)))
      .when(expanded, (el) => el.child(v_flex().w_full().px(8).pb(6).gap(2).text_size(9.5)
        .child(div().text_color(account.status === "stale" || account.errorCode ? t.ansi3 : t.dim)
          .child(`${latest}${account.errorCode ? ` · ${errorLabel(account.errorCode)}` : ""}`))
        .when(account.windows.length > 0, (inner) => inner.children(account.windows.map((item) => this.usageWindow(item, t, now))))
        .when(account.windows.length === 0, (inner) => inner.child(div().h(22).items_center().text_color(t.dim)
          .child("No usage windows reported.")))));
  }

  render() {
    const t = theme();
    const islands = shared("layout") === "alex-islands";
    const compactRail = islandsRail();
    const now = Date.now() / 1000;
    const summary = railSummary(this.accounts, this.loadError);
    const issue = summary.hasIssue;
    const detail = this.loadError && this.accounts.length === 0
      ? div().px(2).py(7).text_color(t.blocked).child("Can't load tracked accounts.")
      : this.status === "loading"
        ? div().px(2).py(7).text_color(t.dim).child("Reading tracked accounts…")
        : this.accounts.length === 0
          ? v_flex().px(2).py(4).gap(5)
            .child(div().text_color(t.dim).child("No tracked Codex accounts yet."))
            .child(this.button("add-first-codex-account", "Add account", () => this.openManager(), t, islands))
          : v_flex().w_full().flex_none().gap(1)
            .when(this.loadError, (el) => el.child(div().text_size(9.5).text_color(t.blocked)
              .child("Cache read failed; showing previous rows.")))
            .children(this.accounts.map((account, index) => this.accountRow(account, index, t, now, islands)));

    const header = h_flex().w_full().h(28).flex_none().items_center().gap(5)
      .child(h_flex().id("codex-usage-toggle").h(28).flex_1().min_w(0).items_center().gap(6)
        .cursor_pointer().on_click((_event, cx) => this.toggleOpen(cx))
        .child(svg("icons/codex.svg").size(14).flex_none().text_color(t.muted))
        .child(div().text_color(t.muted).child("Codex"))
        .child(div().text_size(9.5).text_color(t.dim).child(String(summary.count)))
        .child(div().flex_1())
        .child(chevron(this.open && !compactRail, t.muted)))
      .when(!compactRail, (el) => el.child(this.button("manage-codex-accounts", "Manage", () => this.openManager(), t, islands)));

    return v_flex().w_full().h_full().min_h(0).px(compactRail ? 4 : 10).pt(3).bg(t.chrome)
      .on_size_change((_size, cx) => {
        if (islandsRail() && this.open) {
          this.open = false;
          this.fit();
          cx.notify();
        }
      })
      .when(!islands, (el) => el.border_t(1).border_color(t.border))
      .text_size(12.5)
      .when(compactRail, (el) => el.child(
        h_flex().id("codex-accounts-rail").w_full().h(28).items_center().justify_center().gap(4)
          .cursor_pointer()
          .tooltip(`${summary.count} tracked Codex account${summary.count === 1 ? "" : "s"}${issue ? " · attention needed" : ""}`)
          .on_click(() => this.openManager())
          .child(svg("icons/codex.svg").size(14).flex_none().text_color(t.muted))
          .child(div().text_size(10).text_color(t.foreground).child(summary.count > 99 ? "99+" : String(summary.count)))
          .when(issue, (inner) => inner.child(div().size(5).rounded(3).bg(t.blocked)))
      ))
      .when(!compactRail, (el) => el.child(header))
      .when(this.open && !compactRail, (el) => el.child(
        v_flex().id("codex-account-rows").w_full().flex_1().min_h(0).gap(2).overflow_y_scroll()
          .child(detail)
      ));
  }
}
