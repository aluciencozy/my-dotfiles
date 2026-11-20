import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, run, theme } from "herdr";

export default class NeedsMe extends View {
  init(_props, cx) {
    this.selected = null;
  }
  pick(a, cx) {
    this.selected = this.selected === a.address ? null : a.address;
    cx.notify();
  }
  render() {
    const t = theme(), all = agents(), waiting = all.filter(a => a.status === "blocked"), done = all.filter(a => a.status === "done");
    const row = a => {
      const selected = this.selected === a.address;
      return v_flex().id(`agent-${a.address}`).px(10).py(7).gap(3).cursor_pointer()
        .when(selected, e => e.bg(t.selected)).hover(e => e.bg(t.hover))
        .on_click((_e, cx) => this.pick(a, cx))
        .child(h_flex().gap(8).items_center()
          .child(div().text_color(a.status === "blocked" ? t.blocked : t.done).child("●"))
          .child(div().flex_1().min_w(0).truncate().child(a.tab_name || a.program?.name || a.address))
          .child(div().text_size(11).text_color(t.muted).child(a.focused ? "Focused" : a.status === "blocked" ? "Waiting" : "Done")))
        .child(div().pl(16).text_size(11).text_color(t.muted).truncate().child(`${a.program?.name || a.app || "Agent"} · ${a.space_name} · ${a.address}`));
    };
    const selected = all.find(a => a.address === this.selected);
    const button = (id, label, fn) => div().id(id).px(8).py(6).border_1().border_color(t.border).cursor_pointer().hover(e => e.bg(t.hover)).on_click(fn).child(label);
    return v_flex().id("needs-me-root").size_full().min_h(0).rounded(0).border_1().border_color(t.border).text_size(13).text_color(t.foreground)
      .child(h_flex().h(42).px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Needs me")).child(div().text_color(t.muted).child(String(waiting.length + done.length))))
      .child(v_flex().id("needs-me-list").flex_1().min_h(0).overflow_y_scrollbar().py(8)
        .when(!waiting.length && !done.length, e => e.child(div().p(12).text_color(t.muted).child("Nothing needs your attention.")))
        .when(waiting.length > 0, e => e.child(div().px(10).py(5).text_size(11).text_color(t.blocked).child(`WAITING · ${waiting.length}`)).children(waiting.map(row)))
        .when(done.length > 0, e => e.child(div().px(10).py(5).text_size(11).text_color(t.done).child(`READY TO REVIEW · ${done.length}`)).children(done.map(row)))
        .when(Boolean(selected), e => e.child(v_flex().p(10).gap(8).border_t(1).border_color(t.border)
          .child(div().font_semibold().child(selected.status === "blocked" ? "Waiting for you" : selected.status === "done" ? "Ready to review" : "Status changed"))
          .child(div().text_size(11).text_color(t.muted).child(`${selected.program?.name || selected.app || "Agent"} · ${selected.tab_name || selected.address}${selected.focused ? " · focused" : ""}`))
          .when(selected.status === "blocked", el => el.child(div().text_color(t.muted).child("Inline answers unavailable. Open the agent to read and answer.")))
          .child(button("open-agent", "Open agent", () => run("agent.focus", { terminal: selected.address }))))));
  }
}
