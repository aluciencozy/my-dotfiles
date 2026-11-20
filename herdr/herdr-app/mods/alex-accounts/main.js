import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import {
  checking, closeOverlay, props, run, setShared, shared, spaces, theme
} from "herdr";
import {
  acquireRefreshLease, createAccount, loginPlan, readAccounts,
  refreshAccounts, releaseRefreshLease
} from "./accounts-bridge.js";
import {
  errorLabel, makeSignInClick, normalizeAccountRow, normalizeAccountsPayload,
  runModelFixtures, shouldRefreshSelected, statusLabel, windowTitle
} from "./account-model.js";
import { chevron, islandsRadius } from "./islands-ui.js";

const MAX_ALIAS_LENGTH = 48;
const SELECTED_ACCOUNT = "alex.codex-accounts.selected.v1";
const AGE = (seconds) => seconds < 60 ? "<1m" : seconds < 3600
  ? `${Math.floor(seconds / 60)}m` : seconds < 86400
    ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d`;

function activeLocalSpace() {
  return spaces().find((space) => space.active && space.machine === null) ?? null;
}

function safeAlias(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim()
    : "";
}

function aliasLength(value) {
  return Array.from(value).length;
}

function errorText(error) {
  return errorLabel(error?.code);
}

function observedText(seconds, now) {
  if (seconds == null) return "Not observed yet";
  const delta = now - seconds;
  if (delta < 0) return "Observation time is in the future";
  return `Observed ${AGE(delta)} ago`;
}

function cadenceLabel(window) {
  return windowTitle(window);
}

export default class AlexAccounts extends View {
  init(_props, cx) {
    this.alias = InputState.new({ placeholder: "e.g. Personal or Work" });
    this.alias.on("change", (_event, cx) => cx.notify());
    this.accounts = [];
    this.loading = false;
    this.loadError = null;
    this.notice = "";
    this.busy = "";
    this.expanded = new Set();
    this.refreshOwner = `accounts-dialog:${Date.now()}`;
    this.autoNext = 0;
    const selected = shared(SELECTED_ACCOUNT);
    if (typeof selected === "string") this.expanded.add(selected);

    if (checking()) {
      cx.spawn(async () => { await runModelFixtures(); });
      return;
    }
    this.loadAccounts(cx);
    cx.spawn(async (cx) => {
      for (;;) {
        await cx.sleep(5000);
        if (!this.loading && !this.busy) this.loadAccounts(cx, true);
      }
    });
  }

  dismiss() {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  loadAccounts(cx, quiet = false) {
    if (this.loading) return;
    this.loading = true;
    this.loadError = null;
    if (!quiet) this.notice = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const result = normalizeAccountsPayload(await readAccounts());
        if (!result.ok) throw new Error("invalid_payload");
        this.accounts = result.accounts;
        const selected = shared(SELECTED_ACCOUNT);
        const account = result.accounts.find((item) => item.id === selected);
        if (shouldRefreshSelected(account, selected, Date.now(), this.autoNext, this.busy)
            && acquireRefreshLease(this.refreshOwner, 90000)) {
          this.autoNext = Date.now() + 120000;
          try {
            const updated = normalizeAccountsPayload(await refreshAccounts(account.id));
            if (!updated.ok) throw new Error("invalid_payload");
            const row = updated.accounts.find((item) => item.id === account.id);
            if (row) this.replaceAccount(row);
          } catch (error) {
            this.replaceAccount({ ...account, status: "error",
              errorCode: typeof error?.code === "string" ? error.code : null, windows: [] });
          } finally {
            releaseRefreshLease(this.refreshOwner);
          }
        }
      } catch (error) {
        this.accounts = [];
        this.loadError = errorText(error);
      }
      this.loading = false;
      cx.notify();
    });
  }

  addAccount(cx) {
    const alias = safeAlias(this.alias.value());
    if (!alias || aliasLength(alias) > MAX_ALIAS_LENGTH || this.busy) return;
    this.busy = "add";
    this.loadError = null;
    this.notice = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const added = normalizeAccountRow(await createAccount(alias));
        if (!added) throw new Error("invalid_payload");
        // Adding creates only an empty profile. Do not refresh or start login here.
        const result = normalizeAccountsPayload(await readAccounts());
        if (!result.ok) throw new Error("invalid_payload");
        this.accounts = result.accounts;
        this.alias.set_value("");
        this.expanded = new Set([...this.expanded, added.id]);
        this.notice = `“${added.alias}” profile added. Select Sign in to continue.`;
      } catch (error) {
        this.loadError = errorText(error);
      }
      this.busy = "";
      cx.notify();
    });
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = "refresh";
    this.loadError = null;
    this.notice = "";
    cx.notify();
    cx.spawn(async (cx) => {
      let owner = this.refreshOwner;
      const list = await readAccounts().catch(() => null);
      const parsed = normalizeAccountsPayload(list);
      if (!parsed.ok) {
        this.accounts = [];
        this.loadError = list ? "Invalid account list" : "Couldn't read tracked accounts";
        this.busy = "";
        cx.notify();
        return;
      }
      this.accounts = parsed.accounts;
      if (this.accounts.length === 0) {
        this.notice = "No tracked profiles; nothing was sent to the collector.";
        this.busy = "";
        cx.notify();
        return;
      }
      const refreshable = this.accounts.filter((account) => account.status !== "missing_login");
      if (refreshable.length === 0) {
        this.notice = "No signed-in profiles to refresh. No collector call was made.";
        this.busy = "";
        cx.notify();
        return;
      }

      const ttl = Math.min(600000, 90000 * refreshable.length);
      if (!acquireRefreshLease(owner, ttl)) {
        this.notice = "Another account refresh is already running.";
        this.busy = "";
        cx.notify();
        return;
      }
      try {
        for (const account of refreshable) {
          if (!acquireRefreshLease(owner, 90000)) break;
          try {
            const result = normalizeAccountsPayload(await refreshAccounts(account.id));
            if (!result.ok) throw new Error("invalid_payload");
            const updated = result.accounts.find((item) => item.id === account.id);
            if (updated) this.replaceAccount(updated);
            else this.replaceAccount({
              ...account,
              status: "unknown",
              observedAt: null,
              windows: []
            });
          } catch (error) {
            this.replaceAccount({
              ...account,
              status: "error",
              errorCode: typeof error?.code === "string" ? error.code : null,
              windows: []
            });
          }
          cx.notify();
        }
        this.notice = "Refresh attempts finished. Rows show the backend's reported state.";
      } finally {
        releaseRefreshLease(owner);
        this.busy = "";
        cx.notify();
      }
    });
  }

  replaceAccount(account) {
    this.accounts = this.accounts.map((current) => current.id === account.id ? account : current);
  }

  signIn(account, cx) {
    if (this.busy) return;
    this.busy = account.id;
    this.loadError = null;
    this.notice = "";
    cx.notify();
    const clickAction = makeSignInClick({
      account,
      getSpace: activeLocalSpace,
      getPlan: loginPlan,
      selectAccount: (id) => setShared(SELECTED_ACCOUNT, id),
      dismiss: () => this.dismiss(),
      run
    });
    cx.spawn(async (cx) => {
      try {
        // loginPlan's private argv stays local to this explicit button callback.
        await clickAction();
        this.notice = `Sign-in tab opened for “${account.alias}”. Choose the account there.`;
      } catch (error) {
        this.loadError = error?.message === "local_space_required"
          ? "Choose a local space before opening sign-in."
          : error?.message === "invalid_login_plan"
            ? "The backend returned an invalid sign-in plan."
            : errorText(error);
      }
      this.busy = "";
      cx.notify();
    });
  }

  toggleExpanded(id, cx) {
    const next = new Set(this.expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expanded = next;
    cx.notify();
  }

  button(id, label, action, t, disabled = false, primary = false) {
    const islands = shared("layout") === "alex-islands";
    return h_flex().id(id).h(29).flex_none().px(9).gap(6).items_center()
      .rounded(islandsRadius(islands, 5))
      .text_size(10.5)
      .text_color(disabled ? t.dim : primary ? t.accent_foreground : t.foreground)
      .when(primary && !disabled, (el) => el.bg(t.accent))
      .when(!primary || disabled, (el) => el.bg(t.raised))
      .when(!disabled, (el) => el.cursor_pointer())
      .when(!disabled, (el) => el.hover((inner) => inner.bg(primary ? t.solid : t.hover)))
      .disabled(disabled)
      .on_click(action)
      .child(label);
  }

  windowRow(window, t, now, windowIndex) {
    const percent = window.usedPercent;
    const percentColor = percent == null ? t.dim : percent >= 80 ? t.ansi1 : percent >= 50 ? t.ansi3 : t.ansi2;
    const reset = window.resetsAt == null
      ? "Reset unknown"
      : window.resetsAt <= now
        ? "Reset passed"
        : `Reset in ${AGE(window.resetsAt - now)}`;
    return v_flex().id(`window-${window.key || windowIndex}`).w_full().gap(3).py(3)
      .child(h_flex().w_full().h(17).items_center().gap(5).text_size(10)
        .child(div().flex_1().truncate().text_color(t.muted).child(cadenceLabel(window)))
        .child(div().text_color(t.dim).child(reset))
        .child(div().text_color(percentColor).child(percent == null ? "—" : `${Math.round(percent)}%`)))
      .when(percent != null, (el) => el.child(div().w_full().h(3).rounded(2).bg(t.raised)
        .child(div().h(3).rounded(2).bg(percentColor).w(`${Math.max(0, Math.min(100, percent))}%`))));
  }

  accountCard(account, index, t, now) {
    const expanded = this.expanded.has(account.id);
    const localSpace = activeLocalSpace();
    const signing = this.busy === account.id;
    const statusColor = account.status === "ok" ? t.done
      : account.status === "stale" ? t.ansi3
        : account.status === "unknown" ? t.dim : t.blocked;
    const detail = account.status === "stale" || account.errorCode
      ? `${statusLabel(account)}${account.errorCode && errorLabel(account.errorCode) !== statusLabel(account) ? ` · ${errorLabel(account.errorCode)}` : ""}`
      : statusLabel(account);

    return v_flex().id(`account-card-${index}`).w_full().flex_none().rounded(islandsRadius(shared("layout") === "alex-islands", 6))
      .bg(t.surface).child(
        h_flex().id(`account-header-${index}`).w_full().h(36).flex_none().px(8).gap(7)
          .items_center().cursor_pointer().text_size(11).text_color(t.foreground)
          .hover((el) => el.bg(t.hover))
          .on_click((_event, cx) => this.toggleExpanded(account.id, cx))
          .child(div().flex_1().truncate().font_semibold().child(account.alias))
          .child(div().text_size(9.5).text_color(statusColor).child(statusLabel(account)))
          .child(account.plan
            ? div().px(5).py(2).rounded(islandsRadius(shared("layout") === "alex-islands", 3)).bg(t.raised).text_size(9).text_color(t.accent).child(account.plan)
            : div())
          .child(chevron(expanded, t.muted))
      )
      .when(expanded, (el) => el.child(
        v_flex().w_full().px(8).pb(8).gap(4).text_size(10)
          .child(div().text_color(account.status === "stale" || account.errorCode ? t.ansi3 : t.dim).child(detail))
          .child(div().text_color(t.dim).child(observedText(account.observedAt, now)))
          .when(account.lastAttemptAt != null, (inner) => inner.child(div().text_color(t.dim)
            .child(`Last attempt ${AGE(Math.max(0, now - account.lastAttemptAt))} ago`)))
          .when(account.source != null, (inner) => inner.child(div().text_color(t.dim)
            .child(account.source === "codex-cli" ? "Source: Codex CLI recovery" : "Source: OAuth")))
          .when(account.version != null, (inner) => inner.child(div().text_color(t.dim).child(`Codex ${account.version}`)))
          .when(account.windows.length > 0, (inner) => inner.children(account.windows.map((window, windowIndex) => this.windowRow(window, t, now, windowIndex))))
          .when(account.windows.length === 0, (inner) => inner.child(div().py(3).text_color(t.dim).child("No usage windows reported.")))
          .child(h_flex().w_full().justify_end().pt(3)
            .child(this.button(`signin-${index}`, signing ? "Opening…" : "Sign in", (_event, cx) => {
              cx.stop_propagation();
              this.signIn(account, cx);
            }, t, Boolean(this.busy) || !localSpace)))
      ));
  }

  render() {
    const t = theme();
    const islands = shared("layout") === "alex-islands";
    const localSpace = activeLocalSpace();
    const alias = safeAlias(this.alias.value());
    const now = Date.now() / 1000;
    const radius = islandsRadius(islands, 5);
    const statusArea = this.loading
      ? div().px(2).py(8).text_color(t.dim).child("Reading tracked accounts…")
      : this.loadError
        ? v_flex().gap(6).child(div().px(2).py(5).text_color(t.blocked).child(this.loadError))
          .child(this.button("retry-list", "Retry list", (_event, cx) => this.loadAccounts(cx), t))
        : this.accounts.length === 0
          ? div().px(2).py(9).text_color(t.dim).child("No tracked Codex accounts yet. Add one below.")
          : div();

    return v_flex().size_full().min_h(0).bg(t.popover)
      .border(1).border_color(t.border).rounded(islandsRadius(islands, 8))
      .p(11).gap(7).text_size(12)
      .child(h_flex().h(27).flex_none().items_center().gap(8)
        .child(div().flex_1().font_semibold().text_color(t.foreground).child("Manage Codex accounts"))
        .child(div().size(22).flex_none().rounded(radius).flex().items_center().justify_center().text_color(t.dim)
          .id("close-codex-accounts").hover((el) => el.bg(t.hover).text_color(t.foreground))
          .on_click(() => this.dismiss())
          .cursor_pointer()
          .child(svg("mods/workspace-chrome/x.svg").size(13))))
      .child(v_flex().flex_none().gap(3).px(2).text_size(10).text_color(t.dim)
        .child("Each alias gets its own Codex profile, independent of your default account. Add a profile first; sign-in is a separate click.")
        .child("No credentials are copied or shown. The provider may ask you to renew sign-in later."))
      .child(v_flex().flex_1().min_h(0).gap(5).id("codex-account-list").overflow_y_scroll()
        .when(this.accounts.length > 0, (el) => el.children(this.accounts.map((account, index) => this.accountCard(account, index, t, now))))
        .when(this.accounts.length === 0, (el) => el.child(statusArea)))
      .when(Boolean(this.loadError) && this.accounts.length > 0,
        (el) => el.child(div().px(2).text_size(10).text_color(t.blocked).child(this.loadError)))
      .when(Boolean(this.notice), (el) => el.child(div().px(2).text_size(10).text_color(t.accent).child(this.notice)))
      .child(div().h(1).flex_none().bg(t.border))
      .child(h_flex().h(34).flex_none().gap(6).items_center()
        .child(Input.new(this.alias).id("codex-account-alias").h(32).flex_1().rounded(islandsRadius(islands, 5)))
        .child(this.button("add-codex-account", this.busy === "add" ? "Adding…" : "Add account", (_event, cx) => this.addAccount(cx), t,
          Boolean(this.busy) || alias.length === 0 || aliasLength(alias) > MAX_ALIAS_LENGTH, true)))
      .child(h_flex().h(30).flex_none().items_center().gap(6)
        .child(this.button("refresh-codex-accounts", this.busy === "refresh" ? "Refreshing…" : "Refresh", (_event, cx) => this.refresh(cx), t,
          Boolean(this.busy) || this.accounts.length === 0))
        .child(div().flex_1())
        .child(div().text_size(9).text_color(t.dim).child(localSpace ? `Sign-in tab: ${localSpace.name}` : "Choose a local space to sign in")))
      .child(div().px(2).text_size(9.5).text_color(t.dim)
        .child("Codex-only. Claude and Gemini account management are out of scope."));
  }
}
